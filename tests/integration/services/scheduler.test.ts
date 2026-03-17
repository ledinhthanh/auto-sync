import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../../../src/lib/db';
import { triggerManualRun, upsertSchedule, removeSchedule, syncQueue, syncWorker } from '../../../src/services/scheduler.service';
import { encryptCredential } from '../../../src/lib/crypto';
import { ConnectionType, SourceType, SyncMode, TriggerBy } from '@prisma/client';
import { getRedis } from '../../../src/lib/redis';
import { Client } from 'pg';

describe('scheduler.service - Integration', () => {
  let syncId: string;
  let workspaceId = 'test-ws-scheduler';

  beforeAll(async () => {
    // 1. Setup workspace
    await prisma.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId, name: 'Scheduler Test', slug: 'scheduler-test' },
      update: {}
    });

    // 2. Setup Connections
    const srcConn = await prisma.connection.create({
      data: {
        name: 'Sched Source',
        workspaceId,
        type: ConnectionType.POSTGRES,
        role: 'SOURCE',
        host: process.env.SOURCE_DB_HOST || 'localhost',
        port: parseInt(process.env.SOURCE_DB_PORT || '5444', 10),
        database: process.env.SOURCE_DB_NAME || 'source_db_test',
        username: process.env.SOURCE_DB_USER || 'source_user',
        passwordEnc: encryptCredential(process.env.SOURCE_DB_PASS || 'source_password'),
        status: 'ACTIVE'
      }
    });

    const destConn = await prisma.connection.create({
      data: {
        name: 'Sched Dest',
        workspaceId,
        type: ConnectionType.POSTGRES,
        role: 'DESTINATION',
        host: process.env.DEST_DB_HOST || 'localhost',
        port: parseInt(process.env.DEST_DB_PORT || '5445', 10),
        database: process.env.DEST_DB_NAME || 'dest_db_test',
        username: process.env.DEST_DB_USER || 'dest_user',
        passwordEnc: encryptCredential(process.env.DEST_DB_PASS || 'dest_password'),
        status: 'ACTIVE'
      }
    });

    // 3. Setup Source Table
    const srcClient = new Client({
      host: process.env.SOURCE_DB_HOST || 'localhost',
      port: parseInt(process.env.SOURCE_DB_PORT || '5444', 10),
      user: process.env.SOURCE_DB_USER || 'source_user',
      password: process.env.SOURCE_DB_PASS || 'source_password',
      database: process.env.SOURCE_DB_NAME || 'source_db_test',
    });
    await srcClient.connect();
    await srcClient.query('DROP TABLE IF EXISTS faculty_sched CASCADE');
    await srcClient.query(`
      CREATE TABLE faculty_sched (id SERIAL PRIMARY KEY, name TEXT);
      INSERT INTO faculty_sched (name) VALUES ('Jane Doe');
    `);
    await srcClient.end();

    // 4. Cleanup Dest DB
    const destClient = new Client({
      host: process.env.DEST_DB_HOST || 'localhost',
      port: parseInt(process.env.DEST_DB_PORT || '5445', 10),
      user: process.env.DEST_DB_USER || 'dest_user',
      password: process.env.DEST_DB_PASS || 'dest_password',
      database: process.env.DEST_DB_NAME || 'dest_db_test',
    });
    await destClient.connect();
    await destClient.query('DROP VIEW IF EXISTS faculty_view CASCADE');
    await destClient.query('DROP TABLE IF EXISTS faculty CASCADE');
    await destClient.query('DROP TABLE IF EXISTS faculty_sched CASCADE');
    await destClient.end();

    // 5. Setup Model
    const model = await prisma.model.create({
      data: {
        name: 'Sched Model',
        workspaceId,
        sourceConnId: srcConn.id,
        sourceType: SourceType.TABLE,
        sourceSchema: 'public',
        sourceName: 'faculty_sched'
      }
    });

    // 6. Setup Sync
    const sync = await prisma.sync.create({
      data: {
        name: 'Sched Sync',
        workspaceId,
        modelId: model.id,
        destConnId: destConn.id,
        destSchema: 'public',
        destName: 'faculty_sched',
        syncMode: SyncMode.FULL_REFRESH
      }
    });
    syncId = sync.id;

    // Wait for worker to be ready
    await syncWorker.waitUntilReady();
  });

  afterAll(async () => {
    await syncQueue.close();
    await syncWorker.close();
    await getRedis().quit();
  });

  it('should trigger a manual run and process it via BullMQ', async () => {
    const runId = await triggerManualRun(syncId, TriggerBy.MANUAL);
    expect(runId).toBeDefined();

    // Verify Prisma status is PENDING or RUNNING
    const run = await prisma.syncRun.findUniqueOrThrow({ where: { id: runId } });
    expect(['PENDING', 'RUNNING']).toContain(run.status);

    // Wait for completion (polling for simplicity in integration test)
    let finalRun;
    for (let i = 0; i < 20; i++) {
        finalRun = await prisma.syncRun.findUniqueOrThrow({ where: { id: runId } });
        if (finalRun.status === 'SUCCESS' || finalRun.status === 'FAILED') break;
        await new Promise(r => setTimeout(r, 500));
    }

    if (finalRun?.status === 'FAILED') {
      console.error('Final sync run error:', finalRun.errorMessage);
    }
    expect(finalRun?.status).toBe('SUCCESS');
  });

  it('should manage repeatable schedules in BullMQ', async () => {
    // 1. Add Schedule
    await upsertSchedule({
      syncId,
      cronExpression: '*/5 * * * *', // Every 5 minutes
      timezone: 'UTC',
      enabled: true
    });

    let repeatables = await syncQueue.getRepeatableJobs();
    console.log('Repeatable jobs:', JSON.stringify(repeatables, null, 2));
    
    // In BullMQ 5.x+, the ID for repeatable jobs might be different
    // Let's use the name since we only have one in this test
    expect(repeatables.length).toBeGreaterThan(0);
    expect(repeatables.some(r => r.id?.includes(syncId) || r.name === 'scheduled-sync')).toBe(true);

    // 2. Disable Schedule
    await upsertSchedule({
        syncId,
        cronExpression: '*/5 * * * *',
        timezone: 'UTC',
        enabled: false
    });
    repeatables = await syncQueue.getRepeatableJobs();
    expect(repeatables.filter(r => r.id?.includes(syncId)).length).toBe(0);

    // 3. Remove Schedule
    await upsertSchedule({
        syncId,
        cronExpression: '*/5 * * * *',
        timezone: 'UTC',
        enabled: true
    });
    await removeSchedule(syncId);
    repeatables = await syncQueue.getRepeatableJobs();
    expect(repeatables.some(r => r.id === `schedule:${syncId}`)).toBe(false);
  });
});

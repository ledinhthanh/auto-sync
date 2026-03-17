import { describe, it, expect, beforeAll } from 'vitest';
import prisma from '../../../src/lib/db';
import { generateSyncPlan } from '../../../src/services/sync-plan.service';
import { executeSyncPlan } from '../../../src/services/sync-executor.service';
import { encryptCredential } from '../../../src/lib/crypto';
import { Client } from 'pg';
import { ConnectionType, SourceType, SyncMode, TriggerBy, FullRefreshStrategy } from '@prisma/client';

describe('sync-executor.service - MySQL to Postgres Integration', () => {
  let syncId: string;
  let workspaceId = 'test-ws-mysql';

  beforeAll(async () => {
    // 1. Setup workspace
    await prisma.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId, name: 'MySQL Test', slug: 'mysql-test' },
      update: {}
    });

    // 2. Setup Connections
    const srcConn = await prisma.connection.create({
      data: {
        name: 'MySQL Source',
        workspaceId,
        type: ConnectionType.MYSQL,
        role: 'SOURCE',
        host: process.env.MYSQL_HOST || 'mysql_source_test',
        port: parseInt(process.env.MYSQL_PORT || '3306', 10),
        database: process.env.MYSQL_DATABASE || 'mysql_source_test',
        username: process.env.MYSQL_USER || 'source_user',
        passwordEnc: encryptCredential(process.env.MYSQL_PASSWORD || 'source_password'),
        status: 'ACTIVE'
      }
    });

    const destConn = await prisma.connection.create({
      data: {
        name: 'PG Dest',
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

    // 3. Setup Model
    const model = await (prisma as any).model.create({
      data: {
        name: 'MySQL Model',
        workspaceId,
        sourceConnId: srcConn.id,
        sourceType: SourceType.TABLE,
        sourceSchema: process.env.MYSQL_DATABASE || 'mysql_source_test',
        sourceName: 'mysql_faculty'
      }
    });

    // 4. Setup Sync
    const sync = await (prisma as any).sync.create({
      data: {
        name: 'MySQL Sync',
        workspaceId,
        modelId: model.id,
        destConnId: destConn.id,
        destSchema: 'public',
        destName: 'mysql_faculty_synced',
        syncMode: SyncMode.FULL_REFRESH,
        fullRefreshStrategy: FullRefreshStrategy.DROP
      }
    });
    syncId = sync.id;

    // 5. Wait for MySQL to be ready
    let attempts = 0;
    while (attempts < 10) {
      try {
        const client = await (prisma as any).connection.findUnique({ where: { id: srcConn.id } });
        // Simple test to see if we can connect via Prisma/Client
        // actually we can just try to connect via mysql2
        const { getMySQLPool } = await import('../../../src/lib/mysql-client');
        const pool = await getMySQLPool(srcConn.id, {
          host: srcConn.host,
          port: srcConn.port,
          database: srcConn.database,
          user: srcConn.username,
          passwordEnc: 'source_password'
        });
        await pool.query('SELECT 1');
        console.log('MySQL is ready!');
        break;
      } catch (e) {
        attempts++;
        console.log(`Waiting for MySQL... attempt ${attempts}`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  });

  it('should execute a full sync from MySQL to PostgreSQL', async () => {
    // 1. Generate Plan
    const plan = await generateSyncPlan(syncId);
    expect(plan.steps.map(s => s.type)).toContain('SYNC_DATA');

    // 2. Create SyncRun
    const run = await (prisma as any).syncRun.create({
      data: {
        syncId,
        status: 'RUNNING',
        triggeredBy: TriggerBy.MANUAL
      }
    });

    // 3. Execute
    const result = await executeSyncPlan({
      syncRunId: run.id,
      plan,
      fullRefreshStrategy: 'DROP',
      onLog: async (log) => { console.log(`[LOG] ${log.message}`); },
      onStepComplete: async (step, success) => { console.log(`[STEP] ${step} success=${success}`); }
    });

    if (result.status === 'FAILED') {
      console.error('Sync failed:', result.errorMessage);
    }
    expect(result.status).toBe('SUCCESS');

    // 4. Verify data in Dest
    const client = new Client({
        host: process.env.DEST_DB_HOST || 'localhost',
        port: parseInt(process.env.DEST_DB_PORT || '5445', 10),
        user: process.env.DEST_DB_USER || 'dest_user',
        password: process.env.DEST_DB_PASS || 'dest_password',
        database: process.env.DEST_DB_NAME || 'dest_db_test',
    });
    await client.connect();
    
    const res = await client.query('SELECT count(*)::int as cnt FROM public.mysql_faculty_synced');
    expect(res.rows[0].cnt).toBeGreaterThan(0);
    
    const dataRes = await client.query('SELECT name FROM public.mysql_faculty_synced WHERE name = $1', ['MySQL User 1']);
    expect(dataRes.rows[0].name).toBe('MySQL User 1');

    await client.end();
  });
});

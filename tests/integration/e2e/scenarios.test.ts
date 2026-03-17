import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../../../src/lib/db';
import { triggerManualRun, syncQueue, syncWorker } from '../../../src/services/scheduler.service';
import { encryptCredential } from '../../../src/lib/crypto';
import { ConnectionType, SourceType, SyncMode, TriggerBy, FullRefreshStrategy } from '@prisma/client';
import { Client } from 'pg';
import { getRedis } from '../../../src/lib/redis';

describe('E2E Scenarios', () => {
  let workspaceId = 'e2e-ws';
  let srcConnId: string;
  let destConnId: string;
  let modelId: string;
  let modelIdMulti: string;

  beforeAll(async () => {
    // 1. Setup workspace
    await prisma.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId, name: 'E2E Workspace', slug: 'e2e-ws' },
      update: {}
    });

    // 2. Setup Connections
    const srcConn = await prisma.connection.create({
      data: {
        name: 'E2E Source',
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
    srcConnId = srcConn.id;

    const destConn = await prisma.connection.create({
      data: {
        name: 'E2E Dest',
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
    destConnId = destConn.id;

    // 3. Seed Source DB
    const srcClient = new Client({
      host: process.env.SOURCE_DB_HOST || 'localhost',
      port: parseInt(process.env.SOURCE_DB_PORT || '5444', 10),
      user: process.env.SOURCE_DB_USER || 'source_user',
      password: process.env.SOURCE_DB_PASS || 'source_password',
      database: process.env.SOURCE_DB_NAME || 'source_db_test',
    });
    await srcClient.connect();
    await srcClient.query('DROP TABLE IF EXISTS e2e_table CASCADE');
    await srcClient.query('DROP TABLE IF EXISTS e2e_table_multi CASCADE');
    await srcClient.query(`
      CREATE TABLE e2e_table (id SERIAL PRIMARY KEY, val TEXT);
      INSERT INTO e2e_table (val) VALUES ('Initial');
      
      CREATE TABLE e2e_table_multi (id SERIAL PRIMARY KEY, val TEXT);
      INSERT INTO e2e_table_multi (val) VALUES ('Multi');
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
    await destClient.query('DROP TABLE IF EXISTS e2e_table CASCADE');
    await destClient.query('DROP TABLE IF EXISTS e2e_table_multi CASCADE');
    await destClient.end();

    // 5. Setup Models
    const model = await prisma.model.create({
      data: {
        name: 'E2E Model',
        workspaceId,
        sourceConnId: srcConnId,
        sourceType: SourceType.TABLE,
        sourceSchema: 'public',
        sourceName: 'e2e_table'
      }
    });
    modelId = model.id;

    const modelMulti = await prisma.model.create({
      data: {
        name: 'E2E Model Multi',
        workspaceId,
        sourceConnId: srcConnId,
        sourceType: SourceType.TABLE,
        sourceSchema: 'public',
        sourceName: 'e2e_table_multi'
      }
    });
    modelIdMulti = modelMulti.id;

    await syncWorker.waitUntilReady();
  });

  afterAll(async () => {
    await syncQueue.close();
    await syncWorker.close();
    await getRedis().quit();
  });

  async function waitForRun(runId: string): Promise<any> {
    for (let i = 0; i < 30; i++) {
        const run = await prisma.syncRun.findUniqueOrThrow({ where: { id: runId } });
        console.log(`[TEST] Waiting for run ${runId}, status: ${run.status}`);
        if (run.status === 'SUCCESS') return run;
        if (run.status === 'FAILED') {
          process.stderr.write(`\n[TEST] SyncRun ${runId} FAILED: ${run.errorMessage}\n`);
          return run;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error(`Sync timed out for run ${runId}`);
  }

  it('Scenario 1: Basic TABLE sync and Scenario 2: Schema Modification', async () => {
    // 1. Setup Sync
    const sync = await prisma.sync.create({
      data: {
        name: 'E2E Sync 1',
        workspaceId,
        modelId,
        destConnId,
        destSchema: 'public',
        destName: 'e2e_table',
        syncMode: SyncMode.FULL_REFRESH,
        fullRefreshStrategy: FullRefreshStrategy.DROP
      }
    });

    // 2. Trigger Sync 1
    const runId1 = await triggerManualRun(sync.id, TriggerBy.MANUAL);
    const run1 = await waitForRun(runId1);
    expect(run1.status).toBe('SUCCESS');

    // 3. Verify target data
    const destClient = new Client({
      host: process.env.DEST_DB_HOST || 'localhost',
      port: parseInt(process.env.DEST_DB_PORT || '5445', 10),
      user: process.env.DEST_DB_USER || 'dest_user',
      password: process.env.DEST_DB_PASS || 'dest_password',
      database: process.env.DEST_DB_NAME || 'dest_db_test',
    });
    await destClient.connect();
    const res1 = await destClient.query('SELECT val FROM e2e_table');
    expect(res1.rows[0].val).toBe('Initial');

    // 4. Modify Source (Schema Change)
    const srcClient = new Client({
      host: process.env.SOURCE_DB_HOST || 'localhost',
      port: parseInt(process.env.SOURCE_DB_PORT || '5444', 10),
      user: process.env.SOURCE_DB_USER || 'source_user',
      password: process.env.SOURCE_DB_PASS || 'source_password',
      database: process.env.SOURCE_DB_NAME || 'source_db_test',
    });
    await srcClient.connect();
    await srcClient.query('ALTER TABLE e2e_table ADD COLUMN meta TEXT');
    await srcClient.query('UPDATE e2e_table SET meta = \'NewMeta\'');
    await srcClient.end();

    // 5. Trigger Sync again (Model should detect drift and sync updated schema)
    const runId2 = await triggerManualRun(sync.id, TriggerBy.MANUAL);
    const run2 = await waitForRun(runId2);
    expect(run2.status).toBe('SUCCESS');

    // 6. Verify updated schema and data at dest
    const res2 = await destClient.query('SELECT meta FROM e2e_table');
    expect(res2.rows[0].meta).toBe('NewMeta');

    await destClient.end();
  });

  it('Scenario 3: 1 Model, 2 Syncs', async () => {
     // Setup third sync to different table
     const sync2 = await prisma.sync.create({
        data: {
          name: 'E2E Sync 2',
          workspaceId,
          modelId: modelIdMulti,
          destConnId,
          destSchema: 'public',
          destName: 'e2e_table_multi',
          syncMode: SyncMode.FULL_REFRESH
        }
      });

      const runId = await triggerManualRun(sync2.id, TriggerBy.MANUAL);
      const run = await waitForRun(runId);
      expect(run.status).toBe('SUCCESS');

      const destClient = new Client({
        host: process.env.DEST_DB_HOST || 'localhost',
        port: parseInt(process.env.DEST_DB_PORT || '5445', 10),
        user: process.env.DEST_DB_USER || 'dest_user',
        password: process.env.DEST_DB_PASS || 'dest_password',
        database: process.env.DEST_DB_NAME || 'dest_db_test',
      });
      await destClient.connect();
      const res = await destClient.query('SELECT count(*)::int as cnt FROM e2e_table_multi');
      expect(res.rows[0].cnt).toBeGreaterThan(0);
      await destClient.end();
  });
});

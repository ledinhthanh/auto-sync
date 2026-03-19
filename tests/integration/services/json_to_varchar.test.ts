import { describe, it, expect, beforeAll } from 'vitest';
import prisma from '../../../src/lib/db';
import { generateSyncPlan } from '../../../src/services/sync-plan.service';
import { executeSyncPlan } from '../../../src/services/sync-executor.service';
import { encryptCredential } from '../../../src/lib/crypto';
import { Client } from 'pg';
import { ConnectionType, SourceType, SyncMode, TriggerBy } from '@prisma/client';

describe('sync-executor.service - JSON to VARCHAR Mapping', () => {
  let syncId: string;
  let workspaceId = 'test-ws-json-cast';

  beforeAll(async () => {
    // 1. Setup workspace
    await prisma.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId, name: 'JSON Cast Test', slug: 'json-cast-test' },
      update: {}
    });

    // 2. Setup Connections
    const srcConn = await prisma.connection.create({
      data: {
        name: 'JSON Source',
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
        name: 'JSON Dest',
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

    // 3. Seed Source DB with JSON column
    const srcClient = new Client({
      host: process.env.SOURCE_DB_HOST || 'localhost',
      port: parseInt(process.env.SOURCE_DB_PORT || '5444', 10),
      user: process.env.SOURCE_DB_USER || 'source_user',
      password: process.env.SOURCE_DB_PASS || 'source_password',
      database: process.env.SOURCE_DB_NAME || 'source_db_test',
    });
    await srcClient.connect();
    await srcClient.query('DROP TABLE IF EXISTS test_json_source CASCADE');
    await srcClient.query(`
      CREATE TABLE test_json_source (id SERIAL PRIMARY KEY, data JSON);
      INSERT INTO test_json_source (data) VALUES ('{"key": "value1"}'), ('{"key": "value2"}');
    `);
    await srcClient.end();

    // 4. Seed Dest DB with VARCHAR column
    const client = new Client({
      host: process.env.DEST_DB_HOST || 'localhost',
      port: parseInt(process.env.DEST_DB_PORT || '5445', 10),
      user: process.env.DEST_DB_USER || 'dest_user',
      password: process.env.DEST_DB_PASS || 'dest_password',
      database: process.env.DEST_DB_NAME || 'dest_db_test',
    });
    await client.connect();
    await client.query('DROP TABLE IF EXISTS test_json_dest CASCADE');
    await client.query(`
      CREATE TABLE test_json_dest (id SERIAL PRIMARY KEY, data VARCHAR(255));
    `);
    await client.end();

    // 5. Setup Model (triggered column detection)
    const model = await (prisma as any).model.create({
      data: {
        name: 'JSON Model',
        workspaceId,
        sourceConnId: srcConn.id,
        sourceType: SourceType.TABLE,
        sourceSchema: 'public',
        sourceName: 'test_json_source',
        detectedColumns: [
          { name: 'id', type: 'integer', udtName: 'int4', nullable: false, ordinalPosition: 1, maxLength: null, numericPrecision: 32, numericScale: 0, isArray: false },
          { name: 'data', type: 'json', udtName: 'json', nullable: true, ordinalPosition: 2, maxLength: null, numericPrecision: null, numericScale: null, isArray: false }
        ]
      }
    });

    // 6. Setup Sync
    const sync = await (prisma as any).sync.create({
      data: {
        name: 'JSON Sync',
        workspaceId,
        modelId: model.id,
        destConnId: destConn.id,
        destSchema: 'public',
        destName: 'test_json_dest',
        syncMode: SyncMode.FULL_REFRESH,
        fullRefreshStrategy: 'TRUNCATE'
      }
    });
    syncId = sync.id;
  });

  it('should sync JSON source to VARCHAR destination using explicit casting', async () => {
    // 1. Generate Plan
    const plan = await generateSyncPlan(syncId);
    
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
      onLog: async (log) => { console.log(`[LOG] ${log.level}: ${log.message}`); },
      onStepComplete: async (step, success) => { console.log(`[STEP] ${step} success=${success}`); },
      fullRefreshStrategy: 'TRUNCATE'
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
    
    // Check table data
    const res = await client.query('SELECT data FROM test_json_dest ORDER BY id');
    expect(res.rows.length).toBe(2);
    expect(res.rows[0].data).toBe('{"key": "value1"}');
    expect(res.rows[1].data).toBe('{"key": "value2"}');

    await client.end();
  });
});

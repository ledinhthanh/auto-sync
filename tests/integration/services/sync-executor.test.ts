import { describe, it, expect, beforeAll } from 'vitest';
import prisma from '../../../src/lib/db';
import { generateSyncPlan } from '../../../src/services/sync-plan.service';
import { executeSyncPlan } from '../../../src/services/sync-executor.service';
import { encryptCredential } from '../../../src/lib/crypto';
import { Client } from 'pg';
import { ConnectionType, SourceType, SyncMode, TriggerBy } from '@prisma/client';

describe('sync-executor.service - Integration', () => {
  let syncId: string;
  let workspaceId = 'test-ws-exec';

  beforeAll(async () => {
    // 1. Setup workspace
    await prisma.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId, name: 'Exec Test', slug: 'exec-test' },
      update: {}
    });

    // 2. Setup Connections
    const srcConn = await prisma.connection.create({
      data: {
        name: 'Exec Source',
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
        name: 'Exec Dest',
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
        name: 'Exec Model',
        workspaceId,
        sourceConnId: srcConn.id,
        sourceType: SourceType.TABLE,
        sourceSchema: 'public',
        sourceName: 'exec_faculty'
      }
    });

    // 4. Setup Sync
    const sync = await (prisma as any).sync.create({
      data: {
        name: 'Exec Sync',
        workspaceId,
        modelId: model.id,
        destConnId: destConn.id,
        destSchema: 'public',
        destName: 'exec_faculty', // Same name to test overwrite & deps
        syncMode: SyncMode.FULL_REFRESH
      }
    });
    syncId = sync.id;

    // 5. Seed Source DB with view (for dependency handling)
    // Use different table names to avoid conflicting with other tests
    const srcClient = new Client({
      host: process.env.SOURCE_DB_HOST || 'localhost',
      port: parseInt(process.env.SOURCE_DB_PORT || '5444', 10),
      user: process.env.SOURCE_DB_USER || 'source_user',
      password: process.env.SOURCE_DB_PASS || 'source_password',
      database: process.env.SOURCE_DB_NAME || 'source_db_test',
    });
    await srcClient.connect();
    await srcClient.query('DROP VIEW IF EXISTS exec_faculty_view CASCADE');
    await srcClient.query('DROP TABLE IF EXISTS exec_faculty CASCADE');
    await srcClient.query(`
      CREATE TABLE exec_faculty (id SERIAL PRIMARY KEY, name TEXT);
      INSERT INTO exec_faculty (name) VALUES ('Test1'), ('Test2');
      CREATE VIEW exec_faculty_view AS SELECT * FROM exec_faculty;
    `);
    await srcClient.end();

    // 6. Seed Dest DB with dependent view
    const client = new Client({
      host: process.env.DEST_DB_HOST || 'localhost',
      port: parseInt(process.env.DEST_DB_PORT || '5445', 10),
      user: process.env.DEST_DB_USER || 'dest_user',
      password: process.env.DEST_DB_PASS || 'dest_password',
      database: process.env.DEST_DB_NAME || 'dest_db_test',
    });
    await client.connect();
    await client.query('DROP VIEW IF EXISTS exec_faculty_view CASCADE');
    await client.query('DROP TABLE IF EXISTS exec_faculty CASCADE');
    await client.query(`
      CREATE TABLE exec_faculty (id SERIAL PRIMARY KEY, name TEXT);
      CREATE VIEW exec_faculty_view AS SELECT * FROM exec_faculty;
    `);
    await client.end();
  });

  it('should execute a full sync with dependency handling', async () => {
    // 1. Generate Plan
    const plan = await generateSyncPlan(syncId);
    
    // Verify plan has expected steps for SYNC_DATA (now includes TRUNCATE internally)
    const stepTypes = plan.steps.map(s => s.type);
    expect(stepTypes).toContain('SYNC_DATA');
    expect(stepTypes).not.toContain('TRUNCATE_TABLE');
    expect(stepTypes).not.toContain('SAVE_DEFINITION');

    // 2. Create SyncRun
    const run = await (prisma as any).syncRun.create({
      data: {
        syncId,
        status: 'RUNNING',
        triggeredBy: TriggerBy.MANUAL
      }
    });

    // 3. Execute
    console.dir(plan.steps, { depth: null });
    const result = await executeSyncPlan({
      syncRunId: run.id,
      plan,
      onLog: async (log) => { console.log(`[LOG] ${log.message}`); },
      onStepComplete: async (step, success) => { console.log(`[STEP] ${step} success=${success}`); }
    });

    if (result.status === 'FAILED') {
      console.error('Sync failed:', result.errorMessage);
    }
    expect(result.status).toBe('SUCCESS');

    // 4. Verify data and view restoration in Dest
    const client = new Client({
        host: process.env.DEST_DB_HOST || 'localhost',
        port: parseInt(process.env.DEST_DB_PORT || '5445', 10),
        user: process.env.DEST_DB_USER || 'dest_user',
        password: process.env.DEST_DB_PASS || 'dest_password',
        database: process.env.DEST_DB_NAME || 'dest_db_test',
    });
    await client.connect();
    
    // Check table data
    const res = await client.query('SELECT count(*)::int as cnt FROM exec_faculty');
    expect(res.rows[0].cnt).toBeGreaterThan(0);
    
    // Check view exists and is working (TRUNCATE preserves views)
    const viewRes = await client.query('SELECT name FROM exec_faculty_view LIMIT 1');
    expect(viewRes.rows[0].name).toBeDefined();

    await client.end();
  });
});

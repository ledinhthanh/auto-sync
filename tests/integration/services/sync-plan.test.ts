import { describe, it, expect, beforeAll } from 'vitest';
import prisma from '../../../src/lib/db';
import { generateSyncPlan } from '../../../src/services/sync-plan.service';
import { encryptCredential } from '../../../src/lib/crypto';
import { Client } from 'pg';
import { ConnectionType, SourceType, SyncMode } from '@prisma/client';

describe('sync-plan.service - Integration', () => {
  let syncId: string;
  const workspaceId = 'test-ws-plan';

  beforeAll(async () => {
    // 1. Setup workspace
    await prisma.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId, name: 'Plan Test', slug: 'plan-test' },
      update: {}
    });

    // 2. Setup Connections
    const srcConn = await prisma.connection.create({
      data: {
        name: 'Plan Source',
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
        name: 'Plan Dest',
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
    const model = await prisma.model.create({
      data: {
        name: 'Faculty Model',
        workspaceId,
        sourceConnId: srcConn.id,
        sourceType: SourceType.TABLE,
        sourceSchema: 'public',
        sourceName: 'faculty'
      }
    });

    // 4. Setup Sync
    const sync = await prisma.sync.create({
      data: {
        name: 'Faculty Sync',
        workspaceId,
        modelId: model.id,
        destConnId: destConn.id,
        destSchema: 'public',
        destName: 'faculty',
        syncMode: SyncMode.FULL_REFRESH
      }
    });
    syncId = sync.id;

    // 5. Seed Dest DB with dependent view
    const client = new Client({
      host: process.env.DEST_DB_HOST || 'localhost',
      port: parseInt(process.env.DEST_DB_PORT || '5445', 10),
      user: process.env.DEST_DB_USER || 'dest_user',
      password: process.env.DEST_DB_PASS || 'dest_password',
      database: process.env.DEST_DB_NAME || 'dest_db_test',
    });
    await client.connect();
    await client.query('DROP VIEW IF EXISTS faculty_view CASCADE');
    await client.query('DROP TABLE IF EXISTS faculty CASCADE');
    await client.query(`
      CREATE TABLE faculty (id SERIAL PRIMARY KEY, name TEXT);
      CREATE VIEW faculty_view AS SELECT * FROM faculty;
    `);
    await client.end();
  });

  it('should generate a plan with dependency management', async () => {
    const plan = await generateSyncPlan(syncId);

    expect(plan.syncId).toBe(syncId);
    expect(plan.steps.length).toBeGreaterThan(0);
    const types = plan.steps.map(s => s.type);

    expect(types).toContain('CREATE_SCHEMA');
    expect(types).toContain('SYNC_DATA');
    expect(types).toContain('VERIFY_COUNT');
    expect(types).not.toContain('TRUNCATE_TABLE');
    expect(types).not.toContain('SAVE_DEFINITION');
    expect(types).not.toContain('RECREATE_OBJECT');

    // Sequence check
    const schemaIdx = types.indexOf('CREATE_SCHEMA');
    const syncIdx = types.indexOf('SYNC_DATA');
    const verifyIdx = types.indexOf('VERIFY_COUNT');

    expect(schemaIdx).toBeLessThan(syncIdx);
    expect(syncIdx).toBeLessThan(verifyIdx);
  });
});

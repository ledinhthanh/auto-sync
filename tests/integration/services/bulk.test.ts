import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../../../src/lib/db';
import { bulkCreateModels } from '../../../src/services/model.service';
import { encryptCredential } from '../../../src/lib/crypto';
import { Client } from 'pg';
import { ConnectionRole, ConnectionType, SourceType } from '@prisma/client';
import { createSync } from '../../../src/services/sync.service';

describe('bulkCreateModels - Integration', () => {
  const workspaceId = 'test-ws-bulk';
  let sourceConnId: string;
  let destConnId: string;

  beforeAll(async () => {
    // Setup workspace
    await prisma.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId, name: 'Bulk Import Test', slug: 'bulk-import-test' },
      update: {},
    });

    // Source connection
    const srcConn = await prisma.connection.create({
      data: {
        name: 'Bulk Source',
        workspaceId,
        type: ConnectionType.POSTGRES,
        role: ConnectionRole.SOURCE,
        host: process.env.SOURCE_DB_HOST || 'localhost',
        port: parseInt(process.env.SOURCE_DB_PORT || '5444', 10),
        database: process.env.SOURCE_DB_NAME || 'source_db_test',
        username: process.env.SOURCE_DB_USER || 'source_user',
        passwordEnc: encryptCredential(process.env.SOURCE_DB_PASS || 'source_password'),
        status: 'ACTIVE',
      },
    });
    sourceConnId = srcConn.id;

    // Destination connection
    const dstConn = await prisma.connection.create({
      data: {
        name: 'Bulk Destination',
        workspaceId,
        type: ConnectionType.POSTGRES,
        role: ConnectionRole.DESTINATION,
        host: process.env.DEST_DB_HOST || 'localhost',
        port: parseInt(process.env.DEST_DB_PORT || '5445', 10),
        database: process.env.DEST_DB_NAME || 'dest_db_test',
        username: process.env.DEST_DB_USER || 'dest_user',
        passwordEnc: encryptCredential(process.env.DEST_DB_PASS || 'dest_password'),
        status: 'ACTIVE',
      },
    });
    destConnId = dstConn.id;

    // Seed source tables
    const client = new Client({
      host: process.env.SOURCE_DB_HOST || 'localhost',
      port: parseInt(process.env.SOURCE_DB_PORT || '5444', 10),
      user: process.env.SOURCE_DB_USER || 'source_user',
      password: process.env.SOURCE_DB_PASS || 'source_password',
      database: process.env.SOURCE_DB_NAME || 'source_db_test',
    });
    await client.connect();
    await client.query('DROP TABLE IF EXISTS bulk_table_a CASCADE');
    await client.query('DROP TABLE IF EXISTS bulk_table_b CASCADE');
    await client.query('CREATE TABLE bulk_table_a (id SERIAL PRIMARY KEY, name TEXT)');
    await client.query('CREATE TABLE bulk_table_b (id SERIAL PRIMARY KEY, value INTEGER)');
    await client.end();
  });

  afterAll(async () => {
    // Cleanup: delete models and connections created during test
    await prisma.sync.deleteMany({ where: { workspaceId } });
    await prisma.model.deleteMany({ where: { workspaceId } });
    await prisma.connection.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  });

  it('should create multiple models from bulk input', async () => {
    const models = await bulkCreateModels({
      workspaceId,
      sourceConnId,
      objects: [
        { schema: 'public', name: 'bulk_table_a' },
        { schema: 'public', name: 'bulk_table_b' },
      ],
    });

    expect(models).toHaveLength(2);
    expect(models.map(m => m.sourceName)).toContain('bulk_table_a');
    expect(models.map(m => m.sourceName)).toContain('bulk_table_b');
    expect(models.every(m => m.sourceConnId === sourceConnId)).toBe(true);
  });

  it('should skip already existing models (deduplication)', async () => {
    // Try to bulk-create the same tables again
    const models = await bulkCreateModels({
      workspaceId,
      sourceConnId,
      objects: [
        { schema: 'public', name: 'bulk_table_a' },
        { schema: 'public', name: 'bulk_table_b' },
      ],
    });

    // Should return 0 new models since both already exist
    expect(models).toHaveLength(0);
  });

  it('should auto-create sync jobs using ConnectionRole enum', async () => {
    // Get the models created in the first test
    const models = await prisma.model.findMany({
      where: { workspaceId, sourceConnId },
    });
    expect(models.length).toBeGreaterThan(0);

    // Verify ConnectionRole.DESTINATION enum is accepted by Prisma
    const destConn = await prisma.connection.findFirst({
      where: {
        workspaceId,
        role: { in: [ConnectionRole.DESTINATION, ConnectionRole.BOTH] },
      },
    });
    expect(destConn).not.toBeNull();
    expect(destConn!.id).toBe(destConnId);

    // Create sync jobs for each model
    const syncResults = await Promise.allSettled(
      models.map(model =>
        createSync({
          workspaceId,
          modelId: model.id,
          destConnId: destConn!.id,
          destSchema: model.sourceSchema || 'public',
          destName: model.sourceName || model.name,
          syncMode: 'FULL_REFRESH',
          scheduleEnabled: false,
        })
      )
    );

    const successCount = syncResults.filter(r => r.status === 'fulfilled').length;
    expect(successCount).toBe(models.length);

    // Verify syncs in DB
    const syncs = await prisma.sync.findMany({ where: { workspaceId } });
    expect(syncs.length).toBe(models.length);
    expect(syncs.every(s => s.destConnId === destConnId)).toBe(true);
    expect(syncs.every(s => s.syncMode === 'FULL_REFRESH')).toBe(true);
    expect(syncs.every(s => s.scheduleEnabled === false)).toBe(true);
  });
});

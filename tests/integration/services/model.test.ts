import { describe, it, expect, beforeAll } from 'vitest';
import prisma from '../../../src/lib/db';
import { createModel, detectModelSchema } from '../../../src/services/model.service';
import { encryptCredential } from '../../../src/lib/crypto';
import { Client } from 'pg';
import { ConnectionType, SourceType } from '@prisma/client';

describe('model.service - Integration', () => {
  let modelId: string;
  let workspaceId = 'test-ws-model';
  let sourceConnId: string;

  beforeAll(async () => {
    // 1. Setup workspace
    await prisma.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId, name: 'Model Test', slug: 'model-test' },
      update: {}
    });

    // 2. Setup Connection
    const srcConn = await prisma.connection.create({
      data: {
        name: 'Model Source',
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
    sourceConnId = srcConn.id;

    // 3. Seed Source DB with initial table
    const client = new Client({
      host: process.env.SOURCE_DB_HOST || 'localhost',
      port: parseInt(process.env.SOURCE_DB_PORT || '5444', 10),
      user: process.env.SOURCE_DB_USER || 'source_user',
      password: process.env.SOURCE_DB_PASS || 'source_password',
      database: process.env.SOURCE_DB_NAME || 'source_db_test',
    });
    await client.connect();
    await client.query('DROP TABLE IF EXISTS drift_test CASCADE');
    await client.query(`
      CREATE TABLE drift_test (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        old_col INTEGER,
        change_me INTEGER
      );
    `);
    await client.end();
  });

  it('should detect schema and manage drift correctly', async () => {
    // 1. Create Model (autosync detection happens in createModel)
    const model = await createModel({
      workspaceId,
      name: 'Drift Model',
      sourceConnId,
      sourceType: SourceType.TABLE,
      sourceSchema: 'public',
      sourceName: 'drift_test'
    });
    modelId = model.id;

    expect(model.schemaStatus).toBe('SYNCED');
    const cols = model.detectedColumns as any[];
    expect(cols).toHaveLength(4);

    // 2. Modify Source Table
    const client = new Client({
      host: process.env.SOURCE_DB_HOST || 'localhost',
      port: parseInt(process.env.SOURCE_DB_PORT || '5444', 10),
      user: process.env.SOURCE_DB_USER || 'source_user',
      password: process.env.SOURCE_DB_PASS || 'source_password',
      database: process.env.SOURCE_DB_NAME || 'source_db_test',
    });
    await client.connect();
    await client.query('ALTER TABLE drift_test DROP COLUMN old_col');
    await client.query('ALTER TABLE drift_test ADD COLUMN new_col TEXT');
    await client.query('ALTER TABLE drift_test ALTER COLUMN change_me TYPE TEXT');
    await client.end();

    // 3. Re-detect Schema
    const result = await detectModelSchema(modelId);
    
    expect(result.changed).toBe(true);
    expect(result.diff?.added).toHaveLength(1);
    expect(result.diff?.added[0].name).toBe('new_col');
    expect(result.diff?.removed).toHaveLength(1);
    expect(result.diff?.removed[0].name).toBe('old_col');
    expect(result.diff?.changed).toHaveLength(1);
    expect(result.diff?.changed[0].column).toBe('change_me');

    // 4. Verify DB state
    const updatedModel = await prisma.model.findUniqueOrThrow({ where: { id: modelId } });
    expect(updatedModel.schemaStatus).toBe('DRIFTED');
    expect(updatedModel.lastSchemaCheckedAt).toBeDefined();
  });
});

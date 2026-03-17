import { describe, it, expect, beforeAll } from 'vitest';
import prisma from '../../../src/lib/db';
import { testConnection, detectSchema, previewData } from '../../../src/services/connection.service';
import { encryptCredential } from '../../../src/lib/crypto';

describe('connection.service - Integration', () => {
  let sourceConnId: string;

  beforeAll(async () => {
    // Create workspace first to satisfy FK
    await prisma.workspace.upsert({
      where: { id: 'test-ws' },
      create: { id: 'test-ws', name: 'Test Workspace', slug: 'test-ws' },
      update: {}
    });

    // Create source connection in test DB
    const conn = await prisma.connection.create({
      data: {
        name: 'Source Integration Test',
        workspaceId: 'test-ws',
        type: 'POSTGRES',
        role: 'BOTH',
        host: process.env.SOURCE_DB_HOST || 'localhost',
        port: parseInt(process.env.SOURCE_DB_PORT || '5444', 10),
        database: process.env.SOURCE_DB_NAME || 'source_db_test',
        username: process.env.SOURCE_USER || 'source_user',
        passwordEnc: encryptCredential(process.env.SOURCE_DB_PASS || 'source_password'),
        status: 'ACTIVE'
      }
    });
    sourceConnId = conn.id;
  });

  it('should test connection successfully', async () => {
    const result = await testConnection(sourceConnId);
    expect(result.success).toBe(true);
    expect(result.serverVersion).toContain('PostgreSQL');
    expect(result.schemas).toContain('public');
  });

  it('should detect schema for a table', async () => {
    const result = await detectSchema(sourceConnId, { schema: 'public', table: 'faculty' });
    const colNames = result.columns.map(c => c.name);
    
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('department');
    expect(result.detectedFrom).toBe('information_schema');
  });

  it('should detect schema for a view', async () => {
    const result = await detectSchema(sourceConnId, { schema: 'public', table: 'faculty_view' });
    const colNames = result.columns.map(c => c.name);
    
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
  });

  it('should preview data from a table', async () => {
    const result = await previewData(sourceConnId, { schema: 'public', name: 'faculty' });
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0]).toHaveProperty('name');
  });

  it('should preview data from a SQL query', async () => {
    const result = await previewData(sourceConnId, { sql: 'SELECT count(*)::int as cnt FROM faculty' });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cnt).toBeGreaterThan(0);
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import prisma from '../../../src/lib/db';
import { detectSchema, previewData } from '../../../src/services/connection.service';
import { encryptCredential } from '../../../src/lib/crypto';
import { ConnectionType } from '@prisma/client';
import { getMySQLPool } from '../../../src/lib/mysql-client';

describe('connection.service - MySQL SQL Query Schema Detection', () => {
  let connId: string;
  let workspaceId = 'test-ws-mysql-sql';

  beforeAll(async () => {
    // 1. Setup workspace
    await prisma.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId, name: 'MySQL SQL Test', slug: 'mysql-sql-test' },
      update: {}
    });

    // 2. Setup Connection
    const conn = await prisma.connection.create({
      data: {
        name: 'MySQL SQL Source',
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
    connId = conn.id;

    // 3. Ensure table exists in MySQL
    const pool = await getMySQLPool(connId, {
      host: conn.host,
      port: conn.port,
      database: conn.database,
      user: conn.username,
      passwordEnc: 'source_password'
    });
    
    await pool.query('CREATE TABLE IF NOT EXISTS test_sql_detect (id INT PRIMARY KEY, val VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    await pool.query('INSERT INTO test_sql_detect (id, val) VALUES (1, "test1"), (2, "test2") ON DUPLICATE KEY UPDATE val=val');
  });

  it('should detect schema for a custom SQL query in MySQL', async () => {
    const sql = 'SELECT id, val FROM test_sql_detect WHERE id > 0';
    
    // This previously might have failed with ECONNRESET if the logic didn't wrap it in LIMIT 0
    // and the table was massive. Even with a small table, we verify it returns correct columns.
    const result = await detectSchema(connId, { sql });
    
    expect(result.columns).toHaveLength(2);
    expect(result.columns.map(c => c.name)).toContain('id');
    expect(result.columns.map(c => c.name)).toContain('val');
    
    // Verify that it correctly identifies types (even if MySQL2 returns 'text' as fallback, 
    // we check that it doesn't crash)
    const idCol = result.columns.find(c => c.name === 'id');
    expect(idCol).toBeDefined();
  });

  it('should preview data for a custom SQL query in MySQL', async () => {
    const sql = 'SELECT id, val FROM test_sql_detect WHERE id > 0';
    const result = await previewData(connId, { sql });
    
    expect(result.rows).toHaveLength(2);
    expect(result.columns).toHaveLength(2);
    expect(result.rows[0].val).toBe('test1');
  });

  it('should preview data for a MySQL table', async () => {
    const result = await previewData(connId, { schema: 'mysql_source_test', name: 'test_sql_detect' });
    
    expect(result.rows).toHaveLength(2);
    expect(result.columns.map(c => c.name)).toContain('val');
    expect(result.rows[0].val).toBe('test1');
  });

  it('should detect schema for a complex SQL query with joins in MySQL', async () => {
    const sql = `
      SELECT t1.id, t1.val, t2.id as id2 
      FROM test_sql_detect t1 
      LEFT JOIN test_sql_detect t2 ON t1.id = t2.id
    `;
    
    const result = await detectSchema(connId, { sql });
    
    expect(result.columns).toHaveLength(3);
    const names = result.columns.map(c => c.name);
    expect(names).toContain('id');
    expect(names).toContain('val');
    expect(names).toContain('id2');
  });
});

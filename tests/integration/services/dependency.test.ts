import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../../../src/lib/db';
import { analyzeDependencies, topologicalSort } from '../../../src/services/dependency.service';
import { encryptCredential } from '../../../src/lib/crypto';
import { Client } from 'pg';
import { DestObjectType } from '@prisma/client';

describe('dependency.service - Integration', () => {
  let destConnId: string;
  const workspaceId = 'test-ws-dep';

  beforeAll(async () => {
    // 1. Setup workspace
    await prisma.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId, name: 'Dep Test', slug: 'dep-test' },
      update: {}
    });

    // 2. Setup Destination Connection
    const conn = await prisma.connection.create({
      data: {
        name: 'Dest Dep Test',
        workspaceId,
        type: 'POSTGRES',
        role: 'DESTINATION',
        host: process.env.DEST_DB_HOST || 'localhost',
        port: parseInt(process.env.DEST_DB_PORT || '5445', 10),
        database: process.env.DEST_DB_NAME || 'dest_db_test',
        username: process.env.DEST_DB_USER || 'dest_user',
        passwordEnc: encryptCredential(process.env.DEST_DB_PASS || 'dest_password'),
        status: 'ACTIVE'
      }
    });
    destConnId = conn.id;

    // 3. Seed Destination with dependencies
    const client = new Client({
      host: process.env.DEST_DB_HOST || 'localhost',
      port: parseInt(process.env.DEST_DB_PORT || '5445', 10),
      user: process.env.DEST_DB_USER || 'dest_user',
      password: process.env.DEST_DB_PASS || 'dest_password',
      database: process.env.DEST_DB_NAME || 'dest_db_test',
    });
    await client.connect();
    await client.query('DROP VIEW IF EXISTS v_v_base CASCADE');
    await client.query('DROP VIEW IF EXISTS v_base CASCADE');
    await client.query('DROP MATERIALIZED VIEW IF EXISTS mv_base CASCADE');
    await client.query('DROP TABLE IF EXISTS base CASCADE');
    
    await client.query(`
      CREATE TABLE base (id SERIAL PRIMARY KEY, val TEXT);
      CREATE VIEW v_base AS SELECT * FROM base;
      CREATE VIEW v_v_base AS SELECT * FROM v_base;
      CREATE MATERIALIZED VIEW mv_base AS SELECT * FROM base;
    `);
    await client.end();
  });

  it('should analyze dependencies correctly', async () => {
    const { nodes } = await analyzeDependencies(destConnId, workspaceId);
    
    expect(nodes.has('public.base')).toBe(true);
    expect(nodes.has('public.v_base')).toBe(true);
    expect(nodes.has('public.v_v_base')).toBe(true);
    expect(nodes.has('public.mv_base')).toBe(true);

    const vBase = nodes.get('public.v_base')!;
    expect(vBase.dependsOn).toContain('public.base');
    expect(vBase.dependedBy).toContain('public.v_v_base');
    expect(vBase.objectType).toBe(DestObjectType.VIEW);

    const mvBase = nodes.get('public.mv_base')!;
    expect(mvBase.dependsOn).toContain('public.base');
    expect(mvBase.objectType).toBe(DestObjectType.MATVIEW);
  });

  it('should generate correct topological sort for dropping', async () => {
    const { nodes } = await analyzeDependencies(destConnId, workspaceId);
    const dropOrder = topologicalSort(nodes, 'public.base', 'drop');
    
    // Order should be leaves first: v_v_base -> [v_base, mv_base] -> base
    const vVBaseIdx = dropOrder.indexOf('public.v_v_base');
    const vBaseIdx = dropOrder.indexOf('public.v_base');
    const baseIdx = dropOrder.indexOf('public.base');

    expect(vVBaseIdx).toBeLessThan(vBaseIdx);
    expect(vBaseIdx).toBeLessThan(baseIdx);
  });

  it('should generate correct topological sort for recreating', async () => {
    const { nodes } = await analyzeDependencies(destConnId, workspaceId);
    const recreateOrder = topologicalSort(nodes, 'public.base', 'recreate');
    
    // Order: base -> [v_base, mv_base] -> v_v_base
    const baseIdx = recreateOrder.indexOf('public.base');
    const vBaseIdx = recreateOrder.indexOf('public.v_base');
    const vVBaseIdx = recreateOrder.indexOf('public.v_v_base');

    expect(baseIdx).toBeLessThan(vBaseIdx);
    expect(vBaseIdx).toBeLessThan(vVBaseIdx);
  });
});

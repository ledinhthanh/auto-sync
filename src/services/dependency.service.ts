import prisma from '../lib/db';
import { getPooledClient } from '../lib/pg-client';
import { resolveConnForPool, getObjectDefinition } from './connection.service';
import { getRedis } from '../lib/redis';
import { DestObjectType, Ownership } from '@prisma/client';

export type ObjectId = string; // format: "schema.name"

export interface DependencyNode {
  id: ObjectId;
  schema: string;
  name: string;
  objectType: DestObjectType;
  ownership: Ownership;
  syncId: string | null;
  definition: string | null;
  dependsOn: ObjectId[];
  dependedBy: ObjectId[];
  lastSyncedAt: Date | null;
  estimatedRows: number | null;
}

export interface DependencyGraph {
  connId: string;
  analyzedAt: Date;
  nodes: Map<ObjectId, DependencyNode>;
  getNode: (id: ObjectId) => DependencyNode | undefined;
  getAffected: (id: ObjectId) => ObjectId[];
  getDropOrder: (id: ObjectId) => ObjectId[];
  getRecreateOrder: (id: ObjectId) => ObjectId[];
}

function serializeGraph(graph: DependencyGraph) {
  const nodesRecord: Record<string, DependencyNode> = {};
  for (const [key, val] of graph.nodes.entries()) {
    nodesRecord[key] = val;
  }
  return {
    connId: graph.connId,
    analyzedAt: graph.analyzedAt.toISOString(),
    nodes: nodesRecord
  };
}

function deserializeGraph(jsonStr: string): DependencyGraph {
  const data = JSON.parse(jsonStr);
  const nodes = new Map<ObjectId, DependencyNode>();
  for (const [key, val] of Object.entries(data.nodes)) {
    // Rehydrate Dates
    const nodeData = val as DependencyNode;
    if (nodeData.lastSyncedAt) {
      nodeData.lastSyncedAt = new Date(nodeData.lastSyncedAt);
    }
    nodes.set(key, nodeData);
  }
  
  return {
    connId: data.connId,
    analyzedAt: new Date(data.analyzedAt),
    nodes,
    getNode: (id) => nodes.get(id),
    getAffected: (id) => getAffectedRecursive(nodes, id),
    getDropOrder: (id) => topologicalSort(nodes, id, 'drop'),
    getRecreateOrder: (id) => topologicalSort(nodes, id, 'recreate'),
  };
}

export async function analyzeDependencies(destConnId: string, workspaceId: string): Promise<DependencyGraph> {
  const resolved = await resolveConnForPool(destConnId);
  const client = await getPooledClient(destConnId, resolved);
  const nodes = new Map<ObjectId, DependencyNode>();

  try {
    // 1. Get all objects at dest DB
    const objectsRes = await client.query(`
      SELECT
        n.nspname || '.' || c.relname AS id,
        n.nspname AS schema,
        c.relname AS name,
        CASE c.relkind WHEN 'r' THEN 'TABLE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATVIEW' END AS type,
        c.reltuples::bigint AS estimated_rows
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'v', 'm')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        AND n.nspname NOT LIKE 'pg_temp_%'
    `);

    // 2. Load managed objects from Prisma
    const mObjs = await prisma.destObject.findMany({
      where: { connId: destConnId, workspaceId }
    });
    
    const registryMap = new Map<string, typeof mObjs[0]>();
    mObjs.forEach(o => registryMap.set(`${o.schema}.${o.name}`, o));

    objectsRes.rows.forEach(r => {
      const dbObj = registryMap.get(r.id);
      nodes.set(r.id, {
        id: r.id,
        schema: r.schema,
        name: r.name,
        objectType: r.type,
        ownership: dbObj?.ownership === Ownership.MANAGED ? Ownership.MANAGED : Ownership.USER_CREATED,
        syncId: dbObj?.syncId || null,
        definition: dbObj?.definition || null,
        dependsOn: [],
        dependedBy: [],
        lastSyncedAt: dbObj?.lastSyncedAt || null,
        estimatedRows: r.estimated_rows ? parseInt(r.estimated_rows, 10) : null
      });
    });

    // 3. Get dependency edges
    const edgesRes = await client.query(`
      SELECT DISTINCT
        dep_ns.nspname  || '.' || dep_obj.relname   AS dependent_id,
        src_ns.nspname  || '.' || src_obj.relname   AS depends_on_id
      FROM pg_depend d
      JOIN pg_rewrite rw ON d.objid = rw.oid
      JOIN pg_class dep_obj ON rw.ev_class = dep_obj.oid
      JOIN pg_namespace dep_ns ON dep_obj.relnamespace = dep_ns.oid
      JOIN pg_class src_obj ON d.refobjid = src_obj.oid
      JOIN pg_namespace src_ns ON src_obj.relnamespace = src_ns.oid
      WHERE
        dep_obj.relkind IN ('v', 'm')
        AND src_obj.relkind IN ('r', 'v', 'm')
        AND dep_obj.oid != src_obj.oid
        AND dep_ns.nspname NOT IN ('pg_catalog', 'information_schema')
        AND src_ns.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY dependent_id, depends_on_id
    `);

    for (const r of edgesRes.rows) {
      const dependentId = r.dependent_id;
      const dependsOnId = r.depends_on_id;

      if (nodes.has(dependentId) && nodes.has(dependsOnId)) {
        nodes.get(dependentId)!.dependsOn.push(dependsOnId);
        nodes.get(dependsOnId)!.dependedBy.push(dependentId);
      }
    }

    // 4. Update memory from fetched DDL if it is a view/matview with 'user_created' ownership and missing
    for (const [, node] of nodes.entries()) {
      if (node.ownership === Ownership.USER_CREATED && (node.objectType === DestObjectType.VIEW || node.objectType === DestObjectType.MATVIEW) && !node.definition) {
          const fetchedDdl = await getObjectDefinition(destConnId, node.schema, node.name, node.objectType);
          node.definition = fetchedDdl || null;
      }
    }

    const graph: DependencyGraph = {
      connId: destConnId,
      analyzedAt: new Date(),
      nodes,
      getNode: (id) => nodes.get(id),
      getAffected: (id) => getAffectedRecursive(nodes, id),
      getDropOrder: (id) => topologicalSort(nodes, id, 'drop'),
      getRecreateOrder: (id) => topologicalSort(nodes, id, 'recreate'),
    };

    const redis = getRedis();
    const cacheKey = `dep_graph:${destConnId}`;
    await redis.setex(cacheKey, 300, JSON.stringify(serializeGraph(graph)));

    return graph;

  } finally {
    client.release();
  }
}

export function getAffectedRecursive(nodes: Map<ObjectId, DependencyNode>, targetId: ObjectId): ObjectId[] {
  const visited = new Set<ObjectId>();
  const affected: ObjectId[] = [];
  
  const queue = [targetId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    
    affected.push(currentId);
    const node = nodes.get(currentId);
    if (node && node.dependedBy) {
      queue.push(...node.dependedBy);
    }
  }
  
  return affected;
}

export function topologicalSort(nodes: Map<ObjectId, DependencyNode>, targetId: ObjectId, mode: 'drop' | 'recreate'): ObjectId[] {
  const affectedNodes = getAffectedRecursive(nodes, targetId);
  const subgraphNodes = new Set(affectedNodes);
  
  // Build in-degree map for Kahn's spanning only within the subgraph
  const inDegree = new Map<ObjectId, number>();
  const adj = new Map<ObjectId, ObjectId[]>();

  for (const id of subgraphNodes) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const id of subgraphNodes) {
    const node = nodes.get(id);
    if (!node) continue;
    // Edges direction depends on if we build from the target backwards or forwards.
    // DependsOn: node -> parent. DependedBy: parent -> child.
    for (const childId of node.dependedBy) {
      if (subgraphNodes.has(childId)) {
        adj.get(id)!.push(childId);
        inDegree.set(childId, inDegree.get(childId)! + 1);
      }
    }
  }

  const result: ObjectId[] = [];
  const q: ObjectId[] = [];

  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) {
      q.push(id);
    }
  }

  while (q.length > 0) {
    const u = q.shift()!;
    result.push(u);

    for (const v of adj.get(u) || []) {
      inDegree.set(v, inDegree.get(v)! - 1);
      if (inDegree.get(v) === 0) {
        q.push(v);
      }
    }
  }

  // Check for cycles - if result doesn't include all nodes, there's a cycle
  if (result.length !== subgraphNodes.size) {
    throw new Error('Circular dependency detected');
  }

  // result currently is topologically sorted (root -> leaves)
  if (mode === 'drop') {
    return result.reverse(); // drop leaves first
  }
  return result; // recreate root first
}

export async function invalidateCache(destConnId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`dep_graph:${destConnId}`);
}

export async function getCachedOrAnalyze(destConnId: string, workspaceId: string): Promise<DependencyGraph> {
  const redis = getRedis();
  const cachedStr = await redis.get(`dep_graph:${destConnId}`);
  if (cachedStr) {
    try {
      return deserializeGraph(cachedStr);
    } catch {
       console.warn('Failed to parse cached Dependency Graph, recomputing...');
    }
  }
  return await analyzeDependencies(destConnId, workspaceId);
}

export async function syncDestObjectRegistry(destConnId: string, workspaceId: string): Promise<void> {
  const resolved = await resolveConnForPool(destConnId);
  const client = await getPooledClient(destConnId, resolved);
  
  try {
    const objectsRes = await client.query(`
      SELECT
        n.nspname AS schema,
        c.relname AS name,
        CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'matview' END AS type
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'v', 'm')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        AND n.nspname NOT LIKE 'pg_temp_%'
    `);

    // We do bulk upsert mapping into DestObject registry
    for (const r of objectsRes.rows) {
      const typeEnum = r.type === 'table' ? DestObjectType.TABLE 
                     : r.type === 'view' ? DestObjectType.VIEW : DestObjectType.MATVIEW;
      
      const exists = await prisma.destObject.findUnique({
        where: { connId_schema_name: { connId: destConnId, schema: r.schema, name: r.name } }
      });

      if (!exists) {
        await prisma.destObject.create({
          data: {
             workspaceId,
             connId: destConnId,
             schema: r.schema,
             name: r.name,
             objectType: typeEnum,
             ownership: 'USER_CREATED'
          }
        });
      }
    }
  } finally {
    client.release();
  }
}

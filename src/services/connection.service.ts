import { Connection, DestObjectType } from '@prisma/client';
import { Pool } from 'pg';
import { NodeSSH } from 'node-ssh';
import * as net from 'net';
import prisma from '../lib/db';
import { decryptCredential } from '../lib/crypto';
import { getPooledClient, ResolvedConnection } from '../lib/pg-client';
import { getMySQLPool } from '../lib/mysql-client';

export function assertSourceReadOnly(connId: string, conn: Connection): void {
  if (conn.role === 'DESTINATION') {
    throw new Error(`Cannot perform source operation on DESTINATION connection: ${connId}`);
  }
  console.warn(`[SOURCE-SAFETY] Connection ${connId} (role: ${conn.role}) is being used for potential write operation`);
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  serverVersion: string;
  databaseSize: string;
  schemas: string[];
  error?: string;
}

export interface DbObject {
  schema: string;
  name: string;
  type: 'table' | 'view' | 'matview';
  rowCount: number | null;
  sizeBytes: number | null;
  lastAnalyzed: Date | null;
}

export interface ColumnDef {
  name: string;
  type: string;
  udtName: string;
  nullable: boolean;
  ordinalPosition: number;
  maxLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
  isArray: boolean;
}

export interface PreviewResult {
  columns: ColumnDef[];
  rows: Record<string, unknown>[];
  rowCount: number;
  totalEstimate: number;
  executionMs: number;
  truncated: boolean;
}

export interface SchemaDetectResult {
  columns: ColumnDef[];
  detectedFrom: 'information_schema' | 'query_result';
  warnings: string[];
}

async function createSshTunnel(conn: Connection): Promise<{ localPort: number; close: () => void }> {
  const ssh = new NodeSSH();
  const localPort = Math.floor(Math.random() * 10000) + 40000;
  
  await ssh.connect({
    host: conn.sshHost!,
    port: conn.sshPort!,
    username: conn.sshUser!,
    privateKey: conn.sshKeyEnc ? decryptCredential(conn.sshKeyEnc) : undefined,
    keepaliveInterval: 10000,
    keepaliveCountMax: 10,
  });

  const server = net.createServer(async (sock) => {
    try {
      const stream = await ssh.forwardOut(
        '127.0.0.1',
        localPort,
        conn.host,
        conn.port
      );
      sock.pipe(stream);
      stream.pipe(sock);
    } catch {
      sock.end();
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(localPort, '127.0.0.1', () => resolve());
  });

  return {
    localPort,
    close: () => {
      server.close();
      ssh.dispose();
    }
  };
}

export async function testConnection(connIdOrObj: string | Connection): Promise<TestConnectionResult> {
  const isId = typeof connIdOrObj === 'string';
  let tunnel: { localPort: number; close: () => void } | null = null;
  let pool: Pool | null = null;
  const result: TestConnectionResult = {
    success: false,
    latencyMs: 0,
    serverVersion: '',
    databaseSize: '',
    schemas: []
  };

  try {
    const conn = isId 
      ? await prisma.connection.findUniqueOrThrow({ where: { id: connIdOrObj } })
      : connIdOrObj;
      
    const password = decryptCredential(conn.passwordEnc);
    
    let host = conn.host;
    let port = conn.port;

    if (conn.sshEnabled && conn.sshHost) {
      tunnel = await createSshTunnel(conn);
      host = '127.0.0.1';
      port = tunnel.localPort;
    }

    const sslMode = conn.sslMode;
    let ssl: boolean | { rejectUnauthorized: boolean } = false;
    if (sslMode === 'require' || sslMode === 'verify-full') {
      ssl = { rejectUnauthorized: sslMode === 'verify-full' };
    }

    console.log(`[SERVICE] testConnection: connecting to ${host}:${port}, database=${conn.database}, user=${conn.username}, ssl=${sslMode}`);

    if (conn.type === 'MYSQL') {
      const mysqlPool = await getMySQLPool(conn.id, {
        host,
        port,
        database: conn.database,
        user: conn.username,
        passwordEnc: password,
        sslMode: conn.sslMode,
      });
      const t0 = Date.now();
      const [rows] = await mysqlPool.query('SELECT VERSION() as version, @@innodb_buffer_pool_size as size');
      result.latencyMs = Date.now() - t0;
      const resRows = rows as { version: string; size: number }[];
      result.serverVersion = resRows[0].version;
      result.databaseSize = (resRows[0].size / 1024 / 1024).toFixed(2) + ' MB';
      
      const [schemaRows] = await mysqlPool.query('SHOW DATABASES');
      result.schemas = (schemaRows as { Database: string }[]).map(r => r.Database);
      result.success = true;
    } else {
      pool = new Pool({
        host,
        port,
        database: conn.database,
        user: conn.username,
        password,
        ssl,
        connectionTimeoutMillis: 0,
      });

      const t0 = Date.now();
      const verRes = await pool.query('SELECT version(), pg_size_pretty(pg_database_size(current_database())) as size');
      result.latencyMs = Date.now() - t0;
      
      const versionString = verRes.rows[0].version as string;
      const match = versionString.match(/^PostgreSQL\s[\d\.]+/);
      result.serverVersion = match ? match[0] : versionString.split(' ')[0];
      result.databaseSize = verRes.rows[0].size;

      const schemaRes = await pool.query(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name NOT LIKE 'pg_%' AND schema_name != 'information_schema' 
        ORDER BY schema_name
      `);
      result.schemas = schemaRes.rows.map(r => r.schema_name);
      result.success = true;
    }

    if (isId) {
      await prisma.connection.update({
        where: { id: connIdOrObj },
        data: { status: 'ACTIVE', lastTestedAt: new Date(), lastError: null }
      });
    }

  } catch (err: unknown) {
    const error = err as Error;
    let errMsg = error.message || 'Unknown error';
    if (errMsg.includes('timeout')) {
      errMsg = 'Connection timed out. Please check the host, port, and firewalls.';
    } else if (errMsg.includes('SSL') || errMsg.includes('certificate')) {
      errMsg = 'SSL connection failed. Have you tried verify-ca or disable?';
    }

    result.error = errMsg;
    console.error(`[SERVICE] testConnection error for ${isId ? connIdOrObj : (connIdOrObj as Connection).host}:`, error);
    
    if (isId) {
      await prisma.connection.update({
        where: { id: connIdOrObj },
        data: { status: 'ERROR', lastTestedAt: new Date(), lastError: errMsg }
      });
    }
  } finally {
    if (pool) await pool.end();
    if (tunnel) tunnel.close();
  }

  return result;
}

export async function listObjects(connId: string, schema?: string | null): Promise<DbObject[]> {
  const conn = await prisma.connection.findUniqueOrThrow({ where: { id: connId } });
  
  if (conn.type === 'MYSQL') {
    const pool = await getMySQLPool(connId, {
      host: conn.host,
      port: conn.port,
      database: conn.database,
      user: conn.username,
      passwordEnc: decryptCredential(conn.passwordEnc),
      sslMode: conn.sslMode,
    });
    
    // For MySQL, 'schema' is the database name.
    const dbName = schema || conn.database;
    const [rows] = await pool.query(`
      SELECT 
        TABLE_SCHEMA as \`schema\`,
        TABLE_NAME as name,
        LOWER(TABLE_TYPE) as type,
        TABLE_ROWS as row_count,
        DATA_LENGTH + INDEX_LENGTH as size_bytes,
        UPDATE_TIME as last_analyzed
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
    `, [dbName]);
    
    return (rows as { schema: string; name: string; type: string; row_count: number; size_bytes: number; last_analyzed: string | null }[]).map(r => ({
      schema: r.schema,
      name: r.name,
      type: r.type.includes('view') ? 'view' : 'table',
      rowCount: r.row_count,
      sizeBytes: r.size_bytes,
      lastAnalyzed: r.last_analyzed ? new Date(r.last_analyzed) : null
    }));
  }

  const resolved = await resolveConnForPool(connId);
  const client = await getPooledClient(connId, resolved);
  try {
    const whereClause = schema 
      ? `n.nspname = $1` 
      : `n.nspname NOT LIKE 'pg_%' AND n.nspname != 'information_schema'`;
    const params = schema ? [schema] : [];

    const res = await client.query(`
      SELECT
        n.nspname                                          AS schema,
        c.relname                                          AS name,
        CASE c.relkind
          WHEN 'r' THEN 'table'
          WHEN 'v' THEN 'view'
          WHEN 'm' THEN 'matview'
        END                                                AS type,
        CASE WHEN c.relkind = 'r' THEN c.reltuples::bigint ELSE NULL END AS row_count,
        CASE WHEN c.relkind = 'r' THEN pg_total_relation_size(c.oid) ELSE NULL END AS size_bytes,
        GREATEST(s.last_analyze, s.last_autoanalyze)       AS last_analyzed
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables s
        ON s.schemaname = n.nspname AND s.relname = c.relname
      WHERE ${whereClause}
        AND c.relkind IN ('r', 'v', 'm')
      ORDER BY n.nspname, c.relkind, c.relname
    `, params);

    return res.rows.map(r => ({
      schema: r.schema,
      name: r.name,
      type: r.type,
      rowCount: r.row_count ? parseInt(r.row_count, 10) : null,
      sizeBytes: r.size_bytes ? parseInt(r.size_bytes, 10) : null,
      lastAnalyzed: r.last_analyzed
    }));
  } finally {
    client.release();
  }
}

function validateSelectOnly(sql: string): void {
  const stripped = sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim()
    .toUpperCase();

  if (!/^(SELECT|WITH)\s/.test(stripped)) {
    throw new Error('Only SELECT statements are allowed in Custom SQL');
  }

  const forbidden = [
    /\bINSERT\b/, /\bUPDATE\b/, /\bDELETE\b/, /\bDROP\b/,
    /\bCREATE\b/, /\bALTER\b/, /\bTRUNCATE\b/, /\bEXECUTE\b/,
    /\bGRANT\b/, /\bREVOKE\b/, /\bCOPY\b/, /\bPG_READ_FILE\b/,
    /\bPG_EXEC\b/, /\bdblink\b/, /\bpg_sleep\b/
  ];

  for (const pattern of forbidden) {
    if (pattern.test(stripped)) {
      throw new Error(`Forbidden statement detected: ${pattern.source}`);
    }
  }
}

export async function previewData(
  connId: string,
  input: { schema: string; name: string } | { sql: string }
): Promise<PreviewResult> {
  const conn = await prisma.connection.findUnique({ where: { id: connId } });
  if (!conn) {
    throw new Error(`Connection not found: ${connId}`);
  }

  if (conn.role === 'SOURCE' || conn.role === 'BOTH') {
    console.warn(`[SECURITY] Read-only check: previewData called on SOURCE connection ${connId}`);
  }

  const resolved = await resolveConnForPool(connId);
  const client = await getPooledClient(connId, resolved);
  
  let querySql = '';
  let nameForEstimate = '';

  if ('sql' in input) {
    validateSelectOnly(input.sql);
    querySql = `SELECT * FROM (${input.sql}) AS _preview LIMIT 50`;
  } else {
    querySql = `SELECT * FROM "${input.schema}"."${input.name}" LIMIT 50`;
    nameForEstimate = input.name;
  }

  try {
    const t0 = Date.now();
    const res = await client.query(querySql);
    const executionMs = Date.now() - t0;

    let totalEstimate = -1;
    if (nameForEstimate) {
      const estRes = await client.query('SELECT reltuples FROM pg_class WHERE relname = $1 LIMIT 1', [nameForEstimate]);
      if (estRes.rows.length > 0) {
        totalEstimate = parseInt(estRes.rows[0].reltuples, 10);
      }
    }

    // Map dataTypeID to type string
    const oidToType = new Map<number, string>();
    const typeRes = await client.query('SELECT oid, typname FROM pg_type');
    typeRes.rows.forEach(r => oidToType.set(r.oid, r.typname));

    const columns: ColumnDef[] = res.fields.map((f, i) => ({
      name: f.name,
      type: oidToType.get(f.dataTypeID) || 'unknown',
      udtName: oidToType.get(f.dataTypeID) || 'unknown',
      nullable: true,
      ordinalPosition: i + 1,
      maxLength: null,
      numericPrecision: null,
      numericScale: null,
      isArray: (oidToType.get(f.dataTypeID) || '').startsWith('_')
    }));

    return {
      columns,
      rows: res.rows,
      rowCount: res.rows.length,
      totalEstimate,
      executionMs,
      truncated: res.rows.length === 50
    };
  } finally {
    client.release();
  }
}

export async function detectSchema(
  connId: string, 
  input: { schema: string; table: string } | { sql: string }
): Promise<SchemaDetectResult> {
  const conn = await prisma.connection.findUniqueOrThrow({ where: { id: connId } });
  
  if (conn.type === 'MYSQL') {
    const pool = await getMySQLPool(connId, {
      host: conn.host,
      port: conn.port,
      database: conn.database,
      user: conn.username,
      passwordEnc: decryptCredential(conn.passwordEnc),
      sslMode: conn.sslMode,
    });
    
    let sql = '';
    if ('sql' in input) {
      sql = `SELECT * FROM (${input.sql}) AS _detect LIMIT 0`;
    } else {
      sql = `SELECT * FROM \`${input.schema}\`.\`${input.table}\` LIMIT 0`;
    }

    try {
      // For MySQL, it's better to use information_schema directly for tables
      if (!('sql' in input)) {
        const [rows] = await pool.query(`
          SELECT 
            COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, ORDINAL_POSITION,
            CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION
        `, [input.schema, input.table]);
        
        const columns: ColumnDef[] = (rows as { COLUMN_NAME: string; DATA_TYPE: string; COLUMN_TYPE: string; IS_NULLABLE: string; ORDINAL_POSITION: number; CHARACTER_MAXIMUM_LENGTH: number | null; NUMERIC_PRECISION: number | null; NUMERIC_SCALE: number | null }[]).map(r => ({
          name: r.COLUMN_NAME,
          type: r.DATA_TYPE,
          udtName: r.COLUMN_TYPE,
          nullable: r.IS_NULLABLE === 'YES',
          ordinalPosition: r.ORDINAL_POSITION,
          maxLength: r.CHARACTER_MAXIMUM_LENGTH,
          numericPrecision: r.NUMERIC_PRECISION,
          numericScale: r.NUMERIC_SCALE,
          isArray: false
        }));
        
        return { columns, detectedFrom: 'information_schema', warnings: [] };
      }

      // Fallback or for SQL queries — rows unused, only fields are inspected
      const [, fields] = await pool.query({ sql, rowsAsArray: true });
      const columns: ColumnDef[] = (fields as { name?: string }[]).map((f, i: number) => ({
        name: f.name || `col${i + 1}`,
        type: 'text', // MySQL2 doesn't easily expose the type name in fields
        udtName: 'text',
        nullable: true,
        ordinalPosition: i + 1,
        maxLength: null,
        numericPrecision: null,
        numericScale: null,
        isArray: false
      }));
      
      return { columns, detectedFrom: 'query_result', warnings: [] };
    } catch (err) {
      throw err;
    }
  }

  let sql = '';
  if ('sql' in input) {
    sql = input.sql;
  } else {
    sql = `SELECT * FROM "${input.schema}"."${input.table}"`;
  }

  validateSelectOnly(sql);
  const resolved = await resolveConnForPool(connId);
  const client = await getPooledClient(connId, resolved);

  try {
    try {
      await client.query(`CREATE TEMP TABLE _schema_detect AS SELECT * FROM (${sql}) AS q LIMIT 0`);
      const res = await client.query(`
        SELECT 
          column_name, data_type, udt_name, is_nullable, ordinal_position,
          character_maximum_length, numeric_precision, numeric_scale
        FROM information_schema.columns 
        WHERE table_name = '_schema_detect'
        ORDER BY ordinal_position
      `);
      await client.query('DROP TABLE _schema_detect');
      
      const columns: ColumnDef[] = res.rows.map(r => ({
        name: r.column_name,
        type: r.data_type,
        udtName: r.udt_name,
        nullable: r.is_nullable === 'YES',
        ordinalPosition: r.ordinal_position,
        maxLength: r.character_maximum_length,
        numericPrecision: r.numeric_precision,
        numericScale: r.numeric_scale,
        isArray: r.data_type === 'ARRAY'
      }));

      const warnings: string[] = [];
      const suspiciousNames = ['amount', 'price', 'salary'];
      columns.forEach(c => {
        if (c.type === 'text' && suspiciousNames.some(sn => c.name.toLowerCase().includes(sn))) {
          warnings.push(`Column '${c.name}' detected as text, consider verifying precision if it expects numeric data.`);
        }
      });

      return { columns, detectedFrom: 'information_schema', warnings };
    } catch {
      // Fallback
      const res = await client.query(`SELECT * FROM (${sql}) AS q LIMIT 1`);
      const oidToType = new Map<number, string>();
      const typeRes = await client.query('SELECT oid, typname FROM pg_type');
      typeRes.rows.forEach(r => oidToType.set(r.oid, r.typname));

      const columns: ColumnDef[] = res.fields.map((f, i) => ({
        name: f.name,
        type: oidToType.get(f.dataTypeID) || 'unknown',
        udtName: oidToType.get(f.dataTypeID) || 'unknown',
        nullable: true,
        ordinalPosition: i + 1,
        maxLength: null,
        numericPrecision: null,
        numericScale: null,
        isArray: (oidToType.get(f.dataTypeID) || '').startsWith('_')
      }));

      return { columns, detectedFrom: 'query_result', warnings: [] };
    }
  } finally {
    client.release();
  }
}

export async function getObjectDefinition(
  connId: string,
  schema: string,
  name: string,
  objectType: DestObjectType
): Promise<string> {
  const resolved = await resolveConnForPool(connId);
  const client = await getPooledClient(connId, resolved);
  try {
    let sql = '';
    if (objectType === DestObjectType.VIEW) {
      sql = `
        SELECT
          'CREATE OR REPLACE VIEW "' || $1::text || '"."' || $2::text || '" AS ' ||
          pg_get_viewdef('"' || $1::text || '"."' || $2::text || '"', true) AS def
      `;
    } else if (objectType === DestObjectType.MATVIEW) {
      sql = `
        SELECT
          'CREATE MATERIALIZED VIEW IF NOT EXISTS "' || $1::text || '"."' || $2::text || '" AS ' ||
          pg_get_viewdef('"' || $1::text || '"."' || $2::text || '"', true) ||
          ' WITH NO DATA' AS def
      `;
    }
    const res = await client.query(sql, [schema, name]);
    if (res.rows.length === 0 || !res.rows[0].def) {
       return '';
    }
    return res.rows[0].def;
  } finally {
    client.release();
  }
}

export function buildCreateTableSql(schema: string, name: string, columns: ColumnDef[]): string {
  const colSql = columns.map(c => {
    let type = c.type;
    
    // Handle array types
    if (c.isArray) {
      if (!type.endsWith('[]')) {
        type = `${type.startsWith('_') ? type.substring(1) : type}[]`;
      }
    }

    const lowerCaseType = type.toLowerCase();
    if (lowerCaseType.includes('json')) {
      type = 'jsonb';
    } else if (lowerCaseType.includes('geometry')) {
      type = 'geometry';
    } else if (lowerCaseType.includes('geography')) {
      type = 'geography';
    }

    if (type === 'numeric' && c.numericPrecision != null) {
      type = `numeric(${c.numericPrecision},${c.numericScale || 0})`;
    } else if (type === 'varchar' && c.maxLength != null) {
      type = `varchar(${c.maxLength})`;
    } else if (type === 'bpchar' && c.maxLength != null) {
      type = `char(${c.maxLength})`;
    }

    return `  "${c.name}" ${type} ${c.nullable ? '' : 'NOT NULL'}`;
  }).join(",\n");

  return `CREATE TABLE IF NOT EXISTS "${schema}"."${name}" (\n${colSql}\n);`;
}

export function validateSql(sql: string): void {
  const normalized = sql.trim().toLowerCase();
  
  if (!normalized.startsWith('select')) {
    throw new Error('Only SELECT statements are allowed');
  }

  const blacklisted = [
    'insert', 'update', 'delete', 'drop', 'truncate', 'create', 'alter',
    'grant', 'revoke', 'execute', 'dblink', 'pg_read_file', 'pg_write_file',
    'copy ', 'lo_import', 'lo_export'
  ];

  for (const word of blacklisted) {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(normalized)) {
      throw new Error(`Potentially dangerous keyword detected: ${word.toUpperCase()}`);
    }
  }
}

export async function resolveConnForPool(connId: string): Promise<ResolvedConnection> {
   const conn = await prisma.connection.findUniqueOrThrow({ where: { id: connId } });
   const host = conn.host;
   const port = conn.port;

   if (conn.sshEnabled && conn.sshHost) {
      // NOTE: For SSH tunnel in pooling we don't start it silently here, we assume testing or manual mapping handles it.
   }

   return {
      host,
      port,
      database: conn.database,
      username: conn.username,
      passwordEnc: decryptCredential(conn.passwordEnc),
      sslMode: conn.sslMode
   };
}

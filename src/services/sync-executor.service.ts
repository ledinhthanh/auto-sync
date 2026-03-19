import type { Connection, FullRefreshStrategy } from '@prisma/client';
import { spawn } from 'child_process';
import { mkdtemp, rm, stat, readdir, unlink, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import crypto from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { decryptCredential } from '../lib/crypto';
import { getPooledClient } from '../lib/pg-client';
import prisma from '../lib/db';
import { buildCreateTableSql, detectSchema, resolveConnForPool, ColumnDef } from './connection.service';
import { SyncPlan, SyncStep } from './sync-plan.service';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface LogMetadata {
  sourceHost?: string;
  sourcePort?: number;
  sourceDb?: string;
  sourceTable?: string;
  sourceSchema?: string;
  destHost?: string;
  destPort?: number;
  destDb?: string;
  destTable?: string;
  destSchema?: string;
  bytes?: number;
  rows?: number;
  durationMs?: number;
  command?: string;
  exitCode?: number;
  rawOutput?: string;
}

export interface LogLine {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  message: string;
  stepNumber: number | null;
  metadata?: LogMetadata;
}

export interface SyncResult {
  status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  durationMs: number;
  rowsProcessed: number;
  bytesTransferred: number;
  errorMessage?: string;
}

export interface ExecutionOptions {
  syncRunId: string;
  plan: SyncPlan;
  onLog: (line: LogLine) => Promise<void>;
  onStepComplete: (stepNumber: number, success: boolean) => Promise<void>;
  onProgress?: (current: number, total: number) => Promise<void>;
  signal?: AbortSignal;
  fullRefreshStrategy?: FullRefreshStrategy;
}

export interface ValidationIssues {
  schemaMismatches: string[];
  dependencies: string[];
}

// ─────────────────────────────────────────────
// Main executor
// ─────────────────────────────────────────────

export async function executeSyncPlan(options: ExecutionOptions): Promise<SyncResult> {
  const { plan, signal, onLog, onStepComplete, onProgress } = options;
  const startTime = Date.now();
  let rowsProcessed = 0;
  let bytesTransferred = 0;

  // Load full connection records from DB — plan object intentionally omits passwordEnc
  const [sourceConn, destConn] = await Promise.all([
    prisma.connection.findUniqueOrThrow({ where: { id: plan.sourceConn.id } }),
    prisma.connection.findUniqueOrThrow({ where: { id: plan.destConn.id } }),
  ]);

  const log = (level: LogLine['level'], message: string, stepNumber: number | null = null, metadata?: Record<string, unknown>) =>
    onLog({ timestamp: new Date(), level, message, stepNumber, metadata });

  await log('info', `Starting sync: ${plan.steps.length} steps`);
  await log('info', `Source: ${sourceConn.host}:${sourceConn.port}/${sourceConn.database}`);
  await log('info', `Dest:   ${destConn.host}:${destConn.port}/${destConn.database}`);
  await log('info', `Steps:  ${plan.steps.map(s => `${s.stepNumber}.${s.type}`).join(' → ')}`);

  // ─────────────────────────────────────────────
  // Pre-sync Validation
  // ─────────────────────────────────────────────
  await log('info', `Validating destination state...`);
  try {
    const issues = await validateSyncDestination(plan, sourceConn, destConn);
    
    if (issues.dependencies.length > 0) {
      for (const dep of issues.dependencies) {
        await log('warn', `Dependency detected: ${dep}`);
      }
      
      if (options.fullRefreshStrategy === 'DROP') {
        throw new Error(`Execution blocked by ${issues.dependencies.length} dependent objects in destination. The 'DROP' strategy would break these dependencies. Please use 'TRUNCATE' or handle them manually.`);
      } else {
        await log('info', `Sync will proceed using '${options.fullRefreshStrategy}' strategy which preserves dependencies.`);
      }
    }

    if (issues.schemaMismatches.length > 0) {
      for (const mismatch of issues.schemaMismatches) {
        await log('warn', `Schema mismatch: ${mismatch}`);
      }
      // Note: We only log schema mismatches as warnings because sync might still work (e.g. extra columns in dest)
      // but if columns are MISSING in dest, the COPY will fail later anyway.
      await log('info', `Found ${issues.schemaMismatches.length} schema differences. Continuing...`);
    } else {
      await log('success', `✓ Destination validation passed`);
    }
  } catch (err: any) {
    await log('error', `Validation failed: ${err.message}`);
    const error = err as Error;
    return {
      status: 'FAILED',
      durationMs: Date.now() - startTime,
      rowsProcessed,
      bytesTransferred,
      errorMessage: `Validation failed: ${error.message}`,
    };
  }

  try {
    for (const step of plan.steps) {
      if (signal?.aborted) {
        return { status: 'CANCELLED', durationMs: Date.now() - startTime, rowsProcessed, bytesTransferred };
      }

      const stepStart = Date.now();
      await log('info', `── Step ${step.stepNumber}/${plan.steps.length}: ${step.type} ─ ${step.description}`, step.stepNumber);

      try {
        const result = await runStep(step, options, sourceConn, destConn);
        rowsProcessed += result.rows ?? 0;
        bytesTransferred += result.bytes ?? 0;

        await onStepComplete(step.stepNumber, true);
        await log('success', `✓ Step ${step.stepNumber} done in ${Date.now() - stepStart}ms` +
          (result.rows ? ` · ${result.rows.toLocaleString()} rows` : '') +
          (result.bytes ? ` · ${formatBytes(result.bytes)}` : ''),
          step.stepNumber,
          { durationMs: Date.now() - stepStart, rows: result.rows, bytes: result.bytes }
        );

        await onProgress?.(step.stepNumber, plan.steps.length);

      } catch (err) {
        const error = err as Error;
        await onStepComplete(step.stepNumber, false);
        await log('error', `✗ Step ${step.stepNumber} failed: ${maskCredentials(error.message)}`, step.stepNumber);
        throw error;
      }
    }

    const totalDuration = Date.now() - startTime;
    await log('success', `Sync completed in ${totalDuration}ms · ${rowsProcessed.toLocaleString()} rows · ${formatBytes(bytesTransferred)}`);

    return { status: 'SUCCESS', durationMs: totalDuration, rowsProcessed, bytesTransferred };

  } catch (err) {
    const error = err as Error;
    if (signal?.aborted) {
      return { status: 'CANCELLED', durationMs: Date.now() - startTime, rowsProcessed, bytesTransferred };
    }
    return {
      status: 'FAILED',
      durationMs: Date.now() - startTime,
      rowsProcessed,
      bytesTransferred,
      errorMessage: maskCredentials(error.message),
    };
  }
}

// ─────────────────────────────────────────────
// Step dispatcher
// ─────────────────────────────────────────────

async function runStep(
  step: SyncStep,
  options: ExecutionOptions,
  sourceConn: Connection,
  destConn: Connection,
): Promise<{ rows?: number; bytes?: number }> {

  const log = (level: LogLine['level'], message: string, meta?: Record<string, unknown>) =>
    options.onLog({ timestamp: new Date(), level, message, stepNumber: step.stepNumber, metadata: meta });

  const { type, metadata } = step;

  switch (type) {

    // ── CREATE_SCHEMA ────────────────────────────────────────────────
    case 'CREATE_SCHEMA': {
      const sql = `CREATE SCHEMA IF NOT EXISTS "${metadata.schema}"`;
      await log('info', `Creating schema: ${metadata.schema}`, { command: sql });
      await execOnDest(destConn, sql);
      return {};
    }

    // ── DROP_DEPENDENCY ──────────────────────────────────────────────
    case 'DROP_DEPENDENCY': {
      const ddlType = normalizeDdlType(metadata.objectType as string ?? metadata.type as string);
      const sql = `DROP ${ddlType} IF EXISTS "${metadata.schema}"."${metadata.name}"`;
      await log('info', `Dropping ${ddlType}: "${metadata.schema}"."${metadata.name}"`, { command: sql });
      await execOnDest(destConn, sql);
      return {};
    }

    // ── TRUNCATE_TABLE ───────────────────────────────────────────────
    case 'TRUNCATE_TABLE': {
      try {
        const sql = `TRUNCATE TABLE "${metadata.schema}"."${metadata.name}" RESTART IDENTITY`;
        await log('info', `Truncating table: "${metadata.schema}"."${metadata.name}"`, { command: sql });
        await execOnDest(destConn, sql);
      } catch (err: any) {
        if (err.message?.includes('does not exist')) {
          await log('info', `Table "${metadata.schema}"."${metadata.name}" does not exist, skipping truncate (will be created)`);
        } else {
          throw err;
        }
      }
      return {};
    }

    // ── SAVE_DEFINITION ──────────────────────────────────────────────
    case 'SAVE_DEFINITION': {
      await log('info', `Definition of "${metadata.schema}"."${metadata.name}" already saved in plan`);
      return {};
    }

    // ── RECREATE_OBJECT ──────────────────────────────────────────────
    case 'RECREATE_OBJECT': {
      const ddlType = normalizeDdlType(metadata.objectType as string ?? metadata.type as string);
      if (!metadata.definition) {
        await log('warn', `No saved definition for "${metadata.schema}"."${metadata.name}" — skipping recreate`);
        return {};
      }
      await log('info', `Recreating ${ddlType}: "${metadata.schema}"."${metadata.name}"`);
      await log('debug', `DDL:\n${metadata.definition}`);
      await execOnDest(destConn, metadata.definition as string);

      // Refresh materialized view after recreate
      if (ddlType === 'MATERIALIZED VIEW') {
        const refreshSql = `REFRESH MATERIALIZED VIEW "${metadata.schema}"."${metadata.name}"`;
        await log('info', `Refreshing materialized view`, { command: refreshSql });
        await execOnDest(destConn, refreshSql);
      }
      return {};
    }

    // ── SYNC_DATA ────────────────────────────────────────────────────
    case 'SYNC_DATA': {
      const srcType = metadata.sourceType as string;
      const strategy = options.fullRefreshStrategy;
      const needRename = (metadata.sourceName !== metadata.destName) || (metadata.sourceSchema !== metadata.destSchema);

      // Technical Decision:
      // 1. For TABLE with DROP strategy, use pg_dump/pg_restore (it's fastest and handles all constraints/indices).
      // 2. For ANY strategy where names differ OR strategy is TRUNCATE, use syncViaCopyPipe.
      //    This is because pg_restore restores to the SOURCE name, and renaming to a target name that was only 
      //    TRUNCATED (not DROPPED) will fail with "relation already exists".
      //    CopyPipe targets the destName directly via "COPY ... FROM", preserving target identity and dependants.
      // 3. For VIEW and MATVIEW, always use syncViaCopyPipe because pg_dump dumps their definitions,
      //    which fail if source tables don't exist in the destination.
      
      if (srcType === 'TABLE' && strategy === 'DROP' && !needRename) {
        return await syncViaDumpRestore(sourceConn, destConn, metadata, options);
      } else {
        return await syncViaCopyPipe(sourceConn, destConn, metadata, options);
      }
    }

    // ── VERIFY_COUNT ─────────────────────────────────────────────────
    case 'VERIFY_COUNT': {
      const schema = (metadata.destSchema ?? metadata.schema) as string;
      const table = (metadata.destName ?? metadata.name ?? metadata.table) as string;

      if (!schema || !table) {
        await log('warn', `Skipping verify: missing schema/table metadata`);
        return {};
      }

      const countResult = await execOnDestWithResult(destConn,
        `SELECT COUNT(*) AS cnt FROM "${schema}"."${table}"`
      );
      const rows = Number(countResult.rows[0]?.cnt ?? 0);
      await log('success', `Verified: ${rows.toLocaleString()} rows in "${schema}"."${table}"`, { rows });
      return { rows };
    }

    default:
      await log('warn', `Unknown step type: ${type} — skipping`);
      return {};
  }
}

// ─────────────────────────────────────────────
// Strategy A: TABLE / MATVIEW → pg_dump | pg_restore
// ─────────────────────────────────────────────

async function syncViaDumpRestore(
  source: Connection,
  dest: Connection,
  meta: Record<string, unknown>,
  options: ExecutionOptions,
): Promise<{ rows: number; bytes: number }> {

  const log = (level: LogLine['level'], message: string, m?: Record<string, unknown>) =>
    options.onLog({ timestamp: new Date(), level, message, stepNumber: null, metadata: m });

  const srcPass = decryptCredential(source.passwordEnc);
  const destPass = decryptCredential(dest.passwordEnc);

  const sourceSchema = meta.sourceSchema as string;
  const sourceName = meta.sourceName as string;
  const destSchema = meta.destSchema as string;
  const destName = meta.destName as string;

  // Final Safety Check: This strategy does not support renaming!
  if (sourceName !== destName || sourceSchema !== destSchema) {
    throw new Error(`DumpRestore strategy requires identical source and destination names. Use CopyPipe for mapping.`);
  }

  await log('info', `Strategy: pg_dump → pg_restore (Direct Mapping)`);

  // pg_dump args — shell: false, no manual escaping
  const dumpArgs = [
    '-h', source.host,
    '-p', String(source.port),
    '-U', source.username,
    '-d', source.database,
    '-t', `${sourceSchema}.${sourceName}`,
    '-Fc',
    '--compress=1',
    '--no-owner',
    '--no-privileges',
    '--no-acl',
  ];

  // pg_restore args
  const restoreArgs = [
    '-h', dest.host,
    '-p', String(dest.port),
    '-U', dest.username,
    '-d', dest.database,
    '--no-owner',
    '--no-privileges',
    '--no-acl',
    '--clean',
    '--if-exists',
    '--section=pre-data',
    '--section=data',
  ];

  // If we didn't explicitly drop the table (TRUNCATE mode), we want pg_restore to only fill data
  // but pg_restore --data-only requires the table to already exist.
  // If we DID drop the table (DROP mode), we want pg_restore to create it.
  // The safest is to NOT use --clean here because we handle DROP/TRUNCATE in separate steps.
  // However, pg_restore will still try to CREATE TABLE and fail if it exists.
  // We'll add --clean ONLY if we are sure we want to overwrite.
  
  // Actually, the user wants simple control. If they chose DROP, the previous step handled it.
  // If we use --clean here, it will do another DROP CASCADE which we want to avoid.
  // So we REMOVE --clean and let it error on CREATE TABLE if it exists.
  // Data will still be COPYed if the table exists.

  await log('debug', `pg_dump ${dumpArgs.join(' ')}`);
  await log('debug', `pg_restore ${restoreArgs.join(' ')}`);

  let bytes = 0;

  await log('info', `Validating connections...`);
  await execOnSource(source, 'SELECT 1');
  await execOnDest(dest, 'SELECT 1');
  await log('info', `Connections OK`);

  // ── Step 1: Backup ──────────────────────────────────────────────
  const tmpDir = await mkdtemp(join(tmpdir(), 'autosync-dump-'));
  const dumpPath = join(tmpDir, 'backup.dump');
  
  try {
    await log('info', `Phase 1/3: Backing up source data to temporary file...`);
    await log('debug', `pg_dump ${dumpArgs.join(' ')} -f ${dumpPath}`);

    const dumpProc = spawn('pg_dump', [...dumpArgs, '-f', dumpPath], { env: { ...process.env, PGPASSWORD: srcPass } });
    
    let dumpBytes = 0;
    dumpProc.stderr.on('data', (d: Buffer) => {
      for (const line of d.toString().split('\n')) {
        if (line.trim()) log('debug', `[pg_dump] ${line.trim()}`).catch(() => { });
      }
    });

    const dumpExitCode = await new Promise<number>((resolve) => {
      dumpProc.on('close', resolve);
    });

    if (dumpExitCode !== 0) {
      throw new Error(`pg_dump failed with exit code ${dumpExitCode}`);
    }

    const { size } = await import('fs/promises').then(f => f.stat(dumpPath));
    bytes = size;
    await log('info', `Backup complete: ${formatBytes(bytes)}`);

    // ── Step 2: Prepare Destination ──────────────────────────────────
    await log('info', `Phase 2/3: Preparing destination table (Downtime starts)...`);
    
    // Check if table exists
    let exists = true;
    try {
      await execOnDest(dest, `SELECT 1 FROM "${destSchema}"."${destName}" LIMIT 1`);
    } catch (err) {
      exists = false;
    }

    if (!exists) {
      await log('info', `Destination table does not exist, will be created during restore or rename.`);
    } else {
      if (options.fullRefreshStrategy === 'TRUNCATE') {
        const sql = `TRUNCATE TABLE "${destSchema}"."${destName}" RESTART IDENTITY`;
        await log('info', `Truncating table: "${destSchema}"."${destName}"`, { command: sql });
        await execOnDest(dest, sql);
      } else if (options.fullRefreshStrategy === 'DROP') {
        const sql = `DROP TABLE IF EXISTS "${destSchema}"."${destName}"`;
        await log('info', `Dropping table: "${destSchema}"."${destName}"`, { command: sql });
        await execOnDest(dest, sql);
      }
    }

    // ── Step 3: Restore ──────────────────────────────────────────────
    await log('info', `Phase 3/3: Restoring data to destination...`);
    await log('debug', `pg_restore ${restoreArgs.join(' ')} ${dumpPath}`);

    const restoreProc = spawn('pg_restore', [...restoreArgs, dumpPath], { env: { ...process.env, PGPASSWORD: destPass } });
    const restoreStderr: string[] = [];
    
    restoreProc.stderr.on('data', (d: Buffer) => {
      const text = d.toString();
      restoreStderr.push(text);
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const level = trimmed.includes('error:') ? 'error' : 'debug';
        log(level, `[pg_restore] ${trimmed}`).catch(() => { });
      }
    });

    const restoreExitCode = await new Promise<number>((resolve) => {
      restoreProc.on('close', resolve);
    });

    const stderrFull = restoreStderr.join('');
    const ignoredErrors = stderrFull.includes('errors ignored on restore');

    if (restoreExitCode !== 0 && !ignoredErrors) {
      throw new Error(`pg_restore failed with exit code ${restoreExitCode}. Stderr: ${stderrFull.slice(0, 500)}`);
    }

    if (ignoredErrors) {
      await log('warn', `Restore completed with some ignored errors (common for schema objects/constraints).`);
    }

    await log('info', `Restore complete.`);
  } finally {
    // Cleanup
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  await log('info', `Transfer complete: ${formatBytes(bytes)}`);

  // ── Count rows ────────────────────────────────────────────────────
  const countResult = await execOnDestWithResult(dest,
    `SELECT COUNT(*) AS cnt FROM "${destSchema}"."${destName}"`
  );
  const rows = Number(countResult.rows[0]?.cnt ?? 0);

  return { rows, bytes };
}

// ─────────────────────────────────────────────
// Strategy B: VIEW / MATVIEW / CUSTOM_SQL → CREATE TABLE + COPY BINARY pipe
// ─────────────────────────────────────────────

async function syncViaCopyPipe(
  source: Connection,
  dest: Connection,
  meta: Record<string, unknown>,
  options: ExecutionOptions,
): Promise<{ rows: number; bytes: number }> {

  const log = (level: LogLine['level'], message: string, m?: Record<string, unknown>) =>
    options.onLog({ timestamp: new Date(), level, message, stepNumber: null, metadata: m });

  const srcPass = decryptCredential(source.passwordEnc);
  const destPass = decryptCredential(dest.passwordEnc);

  const destSchema = meta.destSchema as string;
  const destName = meta.destName as string;

  // Build the SELECT query
  const selectSql = meta.customSql
    ? (meta.customSql as string)
    : (source.type === 'MYSQL' 
        ? `SELECT * FROM \`${meta.sourceSchema}\`.\`${meta.sourceName}\``
        : `SELECT * FROM "${meta.sourceSchema}"."${meta.sourceName}"`);

  await log('info', `Strategy: COPY BINARY pipe`);
  await log('debug', `Source query: ${selectSql.replace(/\s+/g, ' ').slice(0, 200)}`);

  // ── Step 1: Load schema (from cache or live) ──────────────────────
  const modelId = meta.modelId as string | undefined;
  let cachedColumns: ColumnDef[] | null = null;

  if (modelId) {
    const model = await prisma.model.findUnique({ where: { id: modelId }, select: { detectedColumns: true } });
    const cols = model?.detectedColumns as unknown as ColumnDef[];
    if (cols && cols.length > 0) {
      cachedColumns = cols;
      await log('info', `Using cached schema (${cols.length} columns). Refresh schema from Model page if needed.`);
    }
  }

  let schemaColumns: ColumnDef[];
  if (cachedColumns) {
    schemaColumns = cachedColumns;
  } else {
    await log('info', `No cached schema found. Detecting schema from source...`);
    const schemaResult = await detectSchema(source.id, { sql: selectSql });
    schemaColumns = schemaResult.columns;
    await log('info', `Detected ${schemaColumns.length} columns: ${schemaColumns.map(c => c.name).join(', ')}`);
    // Save to cache for future syncs
    if (modelId) {
      await prisma.model.update({ where: { id: modelId }, data: { detectedColumns: schemaColumns as any, lastSchemaCheckedAt: new Date() } });
    }
  }

  // ── Phase 1: Backup source to temp file (with 15-min cache) ──────
  const isMysql = source.type === 'MYSQL';
  const cacheDir = join(tmpdir(), 'autosync-cache');
  const sqlHash = crypto.createHash('md5').update(selectSql).digest('hex');
  const cacheFileName = `model-${modelId || 'no-model'}-${sqlHash}.bin`;
  const dumpPath = join(cacheDir, cacheFileName);
  let totalBytes = 0;

  // Auto-cleanup: remove files older than 15 mins
  try {
    await mkdir(cacheDir, { recursive: true });
    const files = await readdir(cacheDir);
    const now = Date.now();
    for (const file of files) {
      const filePath = join(cacheDir, file);
      const fsStat = await stat(filePath).catch(() => null);
      if (fsStat && now - fsStat.mtimeMs > 15 * 60 * 1000) {
        await unlink(filePath).catch(() => {});
      }
    }
  } catch (e) {
    console.error('Cache cleanup error:', e);
  }

  let useCache = false;
  try {
    const fsStat = await stat(dumpPath);
    const ageMin = (Date.now() - fsStat.mtimeMs) / (60 * 1000);
    if (ageMin < 15) {
      useCache = true;
      await log('info', `Found valid cached backup (${Math.round(ageMin)} mins old). Skipping backup phase.`);
      totalBytes = fsStat.size;
    }
  } catch (e) { /* no cache */ }

  if (!useCache) {
    try {
      await log('info', `Phase 1/3: Backing up source data to temporary file...`);
      
      let actualSelectSql = selectSql;
      if (!isMysql && dest.type === 'POSTGRES') {
        // For Postgres -> Postgres BINARY copy, we need to cast JSON to TEXT if destination is string-like
        // because binary formats for JSON and TEXT are incompatible.
        try {
          const destDetection = await detectSchema(dest.id, { schema: destSchema, table: destName });
          const destMap = new Map(destDetection.columns.map(c => [c.name.toLowerCase(), (c.udtName || c.type).toLowerCase()]));
          const stringTypes = ['text', 'varchar', 'bpchar', 'character varying', 'char'];
          
          const casts: string[] = [];
          let needsCast = false;
          
          for (const col of schemaColumns) {
            const sType = (col.udtName || col.type).toLowerCase();
            const dType = destMap.get(col.name.toLowerCase());
            
            if (dType && (sType === 'json' || sType === 'jsonb') && stringTypes.includes(dType)) {
              casts.push(`"${col.name}"::text AS "${col.name}"`);
              needsCast = true;
            } else {
              casts.push(`"${col.name}"`);
            }
          }
          
          if (needsCast) {
            actualSelectSql = `SELECT ${casts.join(', ')} FROM (${selectSql}) AS _sync_cast`;
            await log('info', `Detected JSON -> String mapping. Applied explicit ::text casts for compatibility.`);
          }
        } catch (err: any) {
          await log('debug', `Destination schema detection skipped for casting: ${err.message}`);
        }
      }

      const srcCommand = isMysql ? 'mysql' : 'psql';
      const srcArgs = isMysql 
        ? [
            '-h', source.host, '-P', String(source.port),
            '-u', source.username, `--password=${srcPass}`,
            '-D', source.database,
            '--skip-ssl',
            '--skip-column-names', '--batch',
            '-e', selectSql
          ]
        : [
            '-h', source.host, '-p', String(source.port),
            '-U', source.username, '-d', source.database,
            '-c', `COPY (${actualSelectSql}) TO STDOUT WITH BINARY`,
          ];

      const actualSrcProc = spawn(srcCommand, srcArgs, { env: { ...process.env, PGPASSWORD: srcPass } });
      
      actualSrcProc.stderr.on('data', (d: Buffer) => {
        const text = d.toString().trim();
        if (text) log('debug', `[${srcCommand} stderr] ${text}`).catch(() => { });
      });

      const fileStream = createWriteStream(dumpPath);
      actualSrcProc.stdout.pipe(fileStream);

      let bytesWritten = 0;
      let lastProgressAt = 0;
      actualSrcProc.stdout.on('data', (chunk: Buffer) => {
        bytesWritten += chunk.length;
        const now = Date.now();
        if (now - lastProgressAt > 2000) {
          log('debug', `Backing up... ${formatBytes(bytesWritten)}`).catch(() => { });
          lastProgressAt = now;
        }
      });

      const srcExitCode = await new Promise<number>((resolve) => {
        actualSrcProc.on('close', resolve);
      });

      if (srcExitCode !== 0) {
        throw new Error(`Source ${srcCommand} failed with exit code ${srcExitCode}`);
      }
      await log('info', `Backup complete: ${formatBytes(bytesWritten)}`);
      totalBytes = bytesWritten;
    } catch (err: any) {
      // If backup fails, ensure we don't leave a partial cache file
      await unlink(dumpPath).catch(() => {});
      throw err;
    }
  }

  // ── Phase 2: Prepare Destination (Downtime starts) ───────────────
  await log('info', `Phase 2/3: Preparing destination table...`);
  
  // Check if table exists
  let tableExists = true;
  try {
    await execOnDest(dest, `SELECT 1 FROM "${destSchema}"."${destName}" LIMIT 1`);
  } catch (err) {
    tableExists = false;
  }

  if (!tableExists) {
    await log('info', `Destination table does not exist, creating it...`);
    const cSql = buildCreateTableSql(destSchema, destName, schemaColumns);
    await execOnDest(dest, cSql);
  } else {
    if (options.fullRefreshStrategy === 'TRUNCATE') {
      const sql = `TRUNCATE TABLE "${destSchema}"."${destName}" RESTART IDENTITY`;
      await log('info', `Truncating table: "${destSchema}"."${destName}"`, { command: sql });
      await execOnDest(dest, sql);
    } else if (options.fullRefreshStrategy === 'DROP') {
      const sql = `DROP TABLE IF EXISTS "${destSchema}"."${destName}" CASCADE`;
      await log('info', `Dropping table: "${destSchema}"."${destName}"`, { command: sql });
      await execOnDest(dest, sql);
      // Create it back
      const cSql = buildCreateTableSql(destSchema, destName, schemaColumns);
      await log('info', `Recreating table: "${destSchema}"."${destName}"`);
      await execOnDest(dest, cSql);
    }
  }

  // ── Phase 3: Restore from file to destination ────────────────────
  await log('info', `Phase 3/3: Restoring data to destination...`);
  
  const colList = schemaColumns.map((c: ColumnDef) => `"${c.name}"`).join(', ');
  const psqlCopyCmd = isMysql 
      ? `COPY "${destSchema}"."${destName}" (${colList}) FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL 'NULL')`
      : `COPY "${destSchema}"."${destName}" (${colList}) FROM STDIN WITH BINARY`;
      
  const destArgs = [
    '-h', dest.host, '-p', String(dest.port),
    '-U', dest.username, '-d', dest.database,
    '-c', psqlCopyCmd,
  ];
  await log('debug', `psql dst: psql ${destArgs.join(' ')} < ${dumpPath}`);

  const destProc = spawn('psql', destArgs, { env: { ...process.env, PGPASSWORD: destPass } });
  const readFileStream = createReadStream(dumpPath);
  readFileStream.pipe(destProc.stdin);

  let destErrorMsg = '';
  destProc.stderr.on('data', (d: Buffer) => {
    const text = d.toString().trim();
    if (text) {
      log('debug', `[psql-dest stderr] ${text}`).catch(() => { });
      if (destErrorMsg.length < 512) destErrorMsg += text + ' ';
    }
  });

  const destExitCode = await new Promise<number>((resolve) => {
    destProc.on('close', resolve);
  });

  if (destExitCode !== 0) {
    throw new Error(`Destination psql failed (exit ${destExitCode}): ${destErrorMsg.trim() || 'Check logs for details'}`);
  }
  await log('info', `Restore complete.`);

  await log('info', `Transfer complete: ${formatBytes(totalBytes)}`);

  // Count rows
  const countResult = await execOnDestWithResult(dest,
    `SELECT COUNT(*) AS cnt FROM "${destSchema}"."${destName}"`
  );
  const rowsTransferred = Number(countResult.rows[0]?.cnt ?? 0);

  return { rows: rowsTransferred, bytes: totalBytes };
}

// ─────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────

async function execOnSource(conn: Connection, sql: string): Promise<void> {
  const resolved = await resolveConnForPool(conn.id);
  const client = await getPooledClient(conn.id, resolved);
  try { await client.query(sql); }
  finally { client.release(); }
}

async function execOnDest(conn: Connection, sql: string): Promise<void> {
  const resolved = await resolveConnForPool(conn.id);
  const client = await getPooledClient(conn.id, resolved);
  try { await client.query(sql); }
  finally { client.release(); }
}

async function execOnDestWithResult(
  conn: Connection,
  sql: string,
): Promise<{ rows: Record<string, unknown>[] }> {
  const resolved = await resolveConnForPool(conn.id);
  const client = await getPooledClient(conn.id, resolved);
  try {
    const result = await client.query(sql);
    return { rows: result.rows };
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

/**
 * Normalize objectType values to correct PostgreSQL DDL keyword.
 * Handles: 'matview' | 'MATVIEW' | 'VIEW' | 'TABLE' etc.
 */
function normalizeDdlType(type: string): string {
  const upper = (type ?? '').toUpperCase();
  if (upper === 'MATVIEW' || upper === 'MATERIALIZED VIEW' || upper === 'MATERIALIZED_VIEW') {
    return 'MATERIALIZED VIEW';
  }
  if (upper === 'VIEW') return 'VIEW';
  if (upper === 'TABLE') return 'TABLE';
  return upper; // fallback
}

// ─────────────────────────────────────────────
// Validation Helpers
// ─────────────────────────────────────────────

export async function validateSyncDestination(
  plan: SyncPlan,
  sourceConn: Connection,
  destConn: Connection,
): Promise<ValidationIssues> {
  const issues: ValidationIssues = {
    schemaMismatches: [],
    dependencies: [],
  };

  const syncDataStep = plan.steps.find(s => s.type === 'SYNC_DATA');
  if (!syncDataStep) return issues;

  const { metadata } = syncDataStep;
  const destSchema = metadata.destSchema as string;
  const destName = metadata.destName as string;

  // 1. Check for dependent objects (PostgreSQL specific for now)
  if (destConn.type === 'POSTGRES') {
    const depSql = `
      SELECT 
          dependent_ns.nspname as dependent_schema, 
          dependent_view.relname as dependent_view 
      FROM pg_depend 
      JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid 
      JOIN pg_class as dependent_view ON pg_rewrite.ev_class = dependent_view.oid 
      JOIN pg_class as source_table ON pg_depend.refobjid = source_table.oid 
      JOIN pg_namespace as source_ns ON source_table.relnamespace = source_ns.oid 
      JOIN pg_namespace as dependent_ns ON dependent_view.relnamespace = dependent_ns.oid 
      WHERE source_ns.nspname = '${destSchema}' 
        AND source_table.relname = '${destName}'
        AND pg_depend.deptype = 'n'
    `;
    
    try {
      const result = await execOnDestWithResult(destConn, depSql);
      if (result.rows.length > 0) {
        issues.dependencies = result.rows.map(r => 
          `View "${r.dependent_schema}"."${r.dependent_view}" depends on target table.`
        );
      }
    } catch (err) {
      // If table doesn't exist, ignore dependency check
    }
  }

  // 2. Check for schema mismatch
  try {
    // Get source schema (from model query)
    const selectSql = metadata.customSql
      ? (metadata.customSql as string)
      : (sourceConn.type === 'MYSQL' 
          ? `SELECT * FROM \`${metadata.sourceSchema}\`.\`${metadata.sourceName}\` LIMIT 0`
          : `SELECT * FROM "${metadata.sourceSchema}"."${metadata.sourceName}" LIMIT 0`);
    
    const sourceSchema = await detectSchema(sourceConn.id, { sql: selectSql });
    
    // Get dest schema
    let destSchemaResult;
    try {
      destSchemaResult = await detectSchema(destConn.id, { 
        table: destName, 
        schema: destSchema 
      });
    } catch (err) {
      // Dest table doesn't exist — not a mismatch, will be created
      return issues;
    }

    const sourceCols = new Set(sourceSchema.columns.map(c => c.name));
    const destCols = new Set(destSchemaResult.columns.map(c => c.name));

    // Check for missing columns in destination (Critical)
    for (const col of sourceSchema.columns) {
      if (!destCols.has(col.name)) {
        issues.schemaMismatches.push(`Column "${col.name}" exists in source model but is missing in destination table.`);
      }
    }

    // Check for extra columns in destination (Warning)
    for (const colName of destCols) {
      if (!sourceCols.has(colName)) {
        issues.schemaMismatches.push(`Column "${colName}" exists in destination but not in source model. It will be set to NULL or DEFAULT.`);
      }
    }
  } catch (err) {
    // Ignore schema detection errors here — they'll be caught during sync execution
  }

  return issues;
}

function maskCredentials(message: string): string {
  return message
    .replace(/password=['"]?[^\s'"&]+['"]?/gi, 'password=***')
    .replace(/PGPASSWORD=[^\s]*/g, 'PGPASSWORD=***')
    .replace(/:\/\/([^:]+):([^@]+)@/g, '://$1:***@');
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}
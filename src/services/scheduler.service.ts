import { Queue, Worker, Job as BullJob } from 'bullmq';
import cronParser from 'cron-parser';
import prisma from '../lib/db';
import { getRedis } from '../lib/redis';
import { generateSyncPlan } from './sync-plan.service';
import { executeSyncPlan, LogLine, SyncResult } from './sync-executor.service';
import { invalidateCache } from './dependency.service';
import { Prisma, TriggerBy } from '@prisma/client';

const SYNC_QUEUE_NAME = 'sync-tasks';

export const syncQueue = new Queue(SYNC_QUEUE_NAME, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection: getRedis() as any,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 500,
  }
});

export const syncWorker = new Worker(
  SYNC_QUEUE_NAME,
  async (bullJob: BullJob) => {
    const { syncId, syncRunId } = bullJob.data;
    await processSyncRun(syncId, syncRunId, bullJob);
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connection: getRedis() as any,
    concurrency: 5,
  }
);

export interface ScheduleOptions {
  syncId: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
}

export function validateCron(expression: string): void {
  cronParser.parse(expression);
}

export async function upsertSchedule(options: ScheduleOptions): Promise<void> {
  await removeSchedule(options.syncId);
  if (!options.enabled) return;

  validateCron(options.cronExpression);

  await syncQueue.add(
    'scheduled-sync',
    { syncId: options.syncId, triggeredBy: 'SCHEDULER' },
    {
      repeat: { pattern: options.cronExpression, tz: options.timezone },
      jobId: `schedule:${options.syncId}`,
    }
  );
}

export async function removeSchedule(syncId: string): Promise<void> {
  const repeatables = await syncQueue.getRepeatableJobs();
  const target = repeatables.find(r => r.id === `schedule:${syncId}`);
  if (target) {
    await syncQueue.removeRepeatableByKey(target.key);
  }
}

export async function triggerManualRun(syncId: string, triggeredBy: TriggerBy): Promise<string> {
  const activeRun = await prisma.syncRun.findFirst({
    where: { syncId, status: 'RUNNING' }
  });
  if (activeRun) throw new Error('Sync is already running');

  const syncRun = await prisma.syncRun.create({
    data: { syncId, status: 'PENDING', triggeredBy }
  });

  await syncQueue.add(
    'manual-sync',
    { syncId, syncRunId: syncRun.id, triggeredBy },
    { priority: 1 }
  );

  return syncRun.id;
}

export async function cancelRun(syncRunId: string): Promise<void> {
  const syncRun = await prisma.syncRun.findUniqueOrThrow({ where: { id: syncRunId } });
  if (syncRun.status !== 'RUNNING' && syncRun.status !== 'PENDING') {
    throw new Error('Cannot cancel non-active run');
  }

  const waitingJobs = await syncQueue.getJobs(['waiting', 'delayed']);
  const bullJob = waitingJobs.find(j => j.data.syncRunId === syncRunId);
  if (bullJob) await bullJob.remove();

  await getRedis().publish(`cancel:${syncRunId}`, '1');
  await prisma.syncRun.update({
    where: { id: syncRunId },
    data: { status: 'CANCELLED', finishedAt: new Date() }
  });
}

/**
 * Centrally formats Redis stream log entries into a human-readable high-fidelity log string.
 */
export function formatSyncLogs(logEntries: [string, string[]][]): string {
  return logEntries.map(entry => {
    const fields = entry[1];
    const data: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      data[fields[i]] = fields[i+1];
    }
    
    // 1. Precise time formatting
    const ts = data.ts ? new Date(data.ts).toLocaleTimeString('en-GB') : '??:??:??';
    
    // 2. Pad levels for visual alignment
    const level = (data.level || 'info').toUpperCase().padEnd(5);
    
    // 3. Step indicator
    const step = data.step ? `[Step ${data.step}] ` : ' '.repeat(9);
    
    // 4. Assemble metadata chip if present
    const meta: string[] = [];
    if (data.srcHost) meta.push(`src:${data.srcHost}`);
    if (data.srcDb) meta.push(`db:${data.srcDb}`);
    if (data.srcTable) meta.push(`tbl:${data.srcTable}`);
    if (data.destHost) meta.push(`dest:${data.destHost}`);
    if (data.destDb) meta.push(`destDb:${data.destDb}`);
    if (data.destTable) meta.push(`destTbl:${data.destTable}`);
    if (data.bytes) meta.push(`bytes:${data.bytes}`);
    if (data.rows) meta.push(`rows:${data.rows}`);
    if (data.durationMs) meta.push(`time:${data.durationMs}ms`);
    if (data.exitCode) meta.push(`code:${data.exitCode}`);
    if (data.cmd) meta.push(`cmd:${data.cmd}`);
    
    let metaStr = '';
    if (meta.length > 0) {
      metaStr = ` {${meta.join(', ')}}`;
    }

    // 5. Raw definition / SQL for deep debugging
    let rawStr = '';
    if (data.raw) {
      rawStr = `\n  >>> DATA/SQL: ${data.raw}`;
    }
    
    return `[${ts}] ${level}: ${step}${data.msg}${metaStr}${rawStr}`;
  }).join('\n');
}

async function processSyncRun(syncId: string, syncRunId: string | undefined, bullJob: BullJob): Promise<void> {
  const redis = getRedis();
  let currentRunId = syncRunId;
  let logKey = '';

  try {
    if (!currentRunId) {
      const newRun = await prisma.syncRun.create({
        data: { syncId, status: 'PENDING', triggeredBy: TriggerBy.SCHEDULER }
      });
      currentRunId = newRun.id;
    }

    await prisma.syncRun.update({ where: { id: currentRunId }, data: { status: 'RUNNING' } });

    logKey = `logs:${currentRunId}`;
    
    const onLog = async (line: LogLine) => {
      const fields: string[] = [
        'ts', line.timestamp.toISOString(),
        'level', line.level,
        'msg', line.message,
        'step', String(line.stepNumber ?? '')
      ];
      
      if (line.metadata) {
        if (line.metadata.sourceHost) fields.push('srcHost', line.metadata.sourceHost);
        if (line.metadata.sourceDb) fields.push('srcDb', line.metadata.sourceDb);
        if (line.metadata.sourceTable) fields.push('srcTable', line.metadata.sourceTable);
        if (line.metadata.destHost) fields.push('destHost', line.metadata.destHost);
        if (line.metadata.destDb) fields.push('destDb', line.metadata.destDb);
        if (line.metadata.destTable) fields.push('destTable', line.metadata.destTable);
        if (line.metadata.bytes) fields.push('bytes', String(line.metadata.bytes));
        if (line.metadata.rows) fields.push('rows', String(line.metadata.rows));
        if (line.metadata.durationMs) fields.push('durationMs', String(line.metadata.durationMs));
        if (line.metadata.command) fields.push('cmd', line.metadata.command);
        if (line.metadata.exitCode) fields.push('exitCode', String(line.metadata.exitCode));
        if (line.metadata.rawOutput) fields.push('raw', line.metadata.rawOutput.substring(0, 500));
      }
      
      await redis.xadd(logKey, '*', ...fields);
      await redis.expire(logKey, 86400); 
    };

    const controller = new AbortController();
    const cancelSub = redis.duplicate();
    await cancelSub.subscribe(`cancel:${currentRunId}`);
    cancelSub.on('message', () => controller.abort());

    try {
      const plan = await generateSyncPlan(syncId);

      await onLog({
        timestamp: new Date(),
        level: 'info',
        message: `Plan generated successfully. Sync ID: ${syncId}, Total Steps: ${plan.steps.length}`,
        stepNumber: null,
        metadata: {
          sourceHost: plan.sourceConn.host,
          sourcePort: plan.sourceConn.port,
          sourceDb: plan.sourceConn.database,
          destHost: plan.destConn.host,
          destPort: plan.destConn.port,
          destDb: plan.destConn.database,
          destTable: plan.steps.find(s => s.type === 'SYNC_DATA')?.metadata.destName as string,
          command: 'generateSyncPlan'
        }
      });

      await onLog({
        timestamp: new Date(),
        level: 'info',
        message: `Steps: ${plan.steps.map(s => `${s.stepNumber}.${s.type}`).join(' -> ')}`,
        stepNumber: null
      });

      const result: SyncResult = await executeSyncPlan({
        syncRunId: currentRunId!,
        plan,
        onLog,
        onStepComplete: async (n) => { await bullJob.updateProgress(Math.round((n / plan.steps.length) * 100)); },
        signal: controller.signal,
        fullRefreshStrategy: plan.fullRefreshStrategy,
      });

      // Persist logs from Redis to DB
      let finalLog = "";
      try {
        const logEntriesRaw = await redis.xrange(logKey, '-', '+');
        console.log(`[DEBUG] Fetched ${logEntriesRaw.length} log entries from Redis for run ${currentRunId}`);
        const logEntries = logEntriesRaw as [string, string[]][];
        finalLog = formatSyncLogs(logEntries);
        console.log(`[DEBUG] Formatted log length: ${finalLog.length}`);
      } catch (logErr) {
        console.error("Failed to fetch logs from Redis:", logErr);
      }

      await prisma.syncRun.update({
        where: { id: currentRunId },
        data: {
          status: result.status,
          finishedAt: new Date(),
          durationMs: result.durationMs,
          rowsProcessed: result.rowsProcessed,
          bytesTransferred: result.bytesTransferred,
          errorMessage: result.errorMessage,
          logOutput: finalLog,
          syncPlan: plan as unknown as Prisma.JsonObject,
        }
      });

      await prisma.sync.update({
        where: { id: syncId },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: result.status,
          status: result.status === 'FAILED' ? 'ERROR' : 'ACTIVE',
        }
      });

      await invalidateCache(plan.destConn.id);

      // ── Cascading Sync ──────────────────────────────────────────────
      if (result.status === 'SUCCESS') {
        await triggerCascadingSyncs(syncId);
      }

    } finally {
      // Final log persistence attempt if it was aborted or failed midway
      // We only do this if logOutput is still empty to prevent double update
      if (currentRunId) {
        const check = await prisma.syncRun.findUnique({ where: { id: currentRunId }, select: { logOutput: true } });
        if (check && !check.logOutput) {
          try {
            const logEntriesRaw = await redis.xrange(logKey, '-', '+');
            const logEntries = logEntriesRaw as [string, string[]][];
            const finalLog = formatSyncLogs(logEntries);
            
            if (finalLog) {
              await prisma.syncRun.update({
                where: { id: currentRunId },
                data: { logOutput: finalLog }
              });
            }
          } catch (e) {
            console.error("Final log recovery failed:", e);
          }
        }
      }
      cancelSub.disconnect();
    }

  } catch (err: unknown) {
    const error = err as Error;
    console.error('Sync execution failed:', error);
    
    if (currentRunId) {
      // Ensure at least one error log exists in Redis for visibility
      try {
        const fields: string[] = [
          'ts', new Date().toISOString(),
          'level', 'error',
          'msg', `CRITICAL SYSTEM FAILURE: ${error.message}`,
          'step', ''
        ];
        await redis.xadd(logKey, '*', ...fields);
      } catch (logErr) {
        console.error("Failed to add manual failure log:", logErr);
      }

      let finalLog = "";
      try {
        const logEntriesRaw = await redis.xrange(logKey, '-', '+');
        console.log(`[DEBUG] [CATCH] Fetched ${logEntriesRaw.length} log entries from Redis for run ${currentRunId}`);
        const logEntries = logEntriesRaw as [string, string[]][];
        finalLog = formatSyncLogs(logEntries);
        console.log(`[DEBUG] [CATCH] Formatted log length: ${finalLog.length}`);
      } catch (e) {
        console.error("Failed to fetch logs from Redis:", e);
      }

      await prisma.syncRun.update({
        where: { id: currentRunId },
        data: { 
          status: 'FAILED', 
          finishedAt: new Date(), 
          errorMessage: error.message,
          logOutput: finalLog || undefined
        }
      });
    }
  }
}

/**
 * Triggers dependent models if they have autoSync enabled.
 * Adds a 5-second delay between chains.
 */
async function triggerCascadingSyncs(parentSyncId: string): Promise<void> {
  const parentSync = await prisma.sync.findUnique({
    where: { id: parentSyncId },
    select: { modelId: true }
  });

  if (!parentSync) return;

  // Find all models that depend on this parent model and have autoSync enabled
  const dependencies = await prisma.modelDependency.findMany({
    where: {
      modelId: parentSync.modelId,
      autoSync: true
    },
    include: {
      dependent: {
        include: {
          syncs: {
            where: { status: 'ACTIVE' }
          }
        }
      }
    }
  });

  for (const dep of dependencies) {
    // For each dependent model, trigger its active syncs
    for (const sync of dep.dependent.syncs) {
      console.log(`[CASCADING] Triggering dependent sync ${sync.id} for model ${dep.dependent.id} (5s delay)`);
      
      const syncRun = await prisma.syncRun.create({
        data: { 
          syncId: sync.id, 
          status: 'PENDING', 
          triggeredBy: TriggerBy.API // or maybe add a CASCADING type?
        }
      });

      await syncQueue.add(
        'cascading-sync',
        { syncId: sync.id, syncRunId: syncRun.id, triggeredBy: TriggerBy.API },
        { 
          delay: 5000,
          priority: 2 // Slightly lower priority than manual
        }
      );
    }
  }
}

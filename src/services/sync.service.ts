import prisma from '../lib/db';
import { 
  Sync, 
  SyncMode, 
  TriggerBy, 
  SyncRun,
  FullRefreshStrategy
} from '@prisma/client';
import { refreshModelStatus } from './model.service';
import { upsertSchedule, removeSchedule, triggerManualRun as triggerQueueRun } from './scheduler.service';

export interface SyncCreateInput {
  workspaceId: string;
  modelId: string;
  name?: string;
  destConnId: string;
  destSchema?: string;
  destName: string;
  syncMode?: SyncMode;
  fullRefreshStrategy?: FullRefreshStrategy;
  incrementalCol?: string;
  schedule?: string;
  scheduleEnabled?: boolean;
  timezone?: string;
}

export async function createSync(input: SyncCreateInput): Promise<Sync> {
  const model = await prisma.model.findUniqueOrThrow({ where: { id: input.modelId } });
  
  const syncName = input.name || `${model.name} to ${input.destName}`;
  
  const sync = await prisma.sync.create({
    data: {
      workspaceId: input.workspaceId,
      modelId: input.modelId,
      name: syncName,
      destConnId: input.destConnId,
      destSchema: input.destSchema || 'public',
      destName: input.destName,
      syncMode: input.syncMode || 'FULL_REFRESH',
      fullRefreshStrategy: input.fullRefreshStrategy || 'TRUNCATE',
      incrementalCol: input.incrementalCol,
      schedule: input.schedule,
      scheduleEnabled: input.scheduleEnabled ?? false,
      timezone: input.timezone || 'UTC',
      status: 'ACTIVE',
    }
  });

  if (sync.schedule && sync.scheduleEnabled) {
    await upsertSchedule({
      syncId: sync.id,
      cronExpression: sync.schedule,
      timezone: sync.timezone,
      enabled: true
    });
  }

  await refreshModelStatus(input.modelId);
  return sync;
}

export async function updateSync(syncId: string, input: Partial<SyncCreateInput>): Promise<Sync> {
  const oldSync = await prisma.sync.findUniqueOrThrow({ where: { id: syncId } });
  
  const sync = await prisma.sync.update({
    where: { id: syncId },
    data: {
      name: input.name,
      destConnId: input.destConnId,
      destSchema: input.destSchema,
      destName: input.destName,
      syncMode: input.syncMode,
      fullRefreshStrategy: input.fullRefreshStrategy,
      incrementalCol: input.incrementalCol,
      schedule: input.schedule,
      scheduleEnabled: input.scheduleEnabled,
      timezone: input.timezone,
    }
  });

  if (sync.schedule && sync.scheduleEnabled) {
    await upsertSchedule({
      syncId: sync.id,
      cronExpression: sync.schedule,
      timezone: sync.timezone,
      enabled: true
    });
  } else if (oldSync.scheduleEnabled && !sync.scheduleEnabled) {
    await removeSchedule(sync.id);
  }

  return sync;
}

export async function toggleSync(syncId: string, enabled: boolean): Promise<Sync> {
  const sync = await prisma.sync.update({
    where: { id: syncId },
    data: { scheduleEnabled: enabled }
  });

  if (enabled && sync.schedule) {
    await upsertSchedule({
      syncId: sync.id,
      cronExpression: sync.schedule,
      timezone: sync.timezone,
      enabled: true
    });
  } else {
    await removeSchedule(syncId);
  }

  return sync;
}

export async function triggerRun(syncId: string, triggeredBy: TriggerBy): Promise<string> {
  return triggerQueueRun(syncId, triggeredBy);
}

export async function getSyncRuns(syncId: string, limit: number = 20): Promise<SyncRun[]> {
  return prisma.syncRun.findMany({
    where: { syncId },
    orderBy: { startedAt: 'desc' },
    take: limit
  });
}

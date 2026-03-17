import {
  Connection,
  DestObjectType,
  FullRefreshStrategy
} from '@prisma/client';
import prisma from '../lib/db';
import { getObjectDefinition } from './connection.service';
import { analyzeDependencies } from './dependency.service';

export type StepType =
  | 'SAVE_DEFINITION'
  | 'DROP_DEPENDENCY'
  | 'TRUNCATE_TABLE'
  | 'CREATE_SCHEMA'
  | 'SYNC_DATA'
  | 'RECREATE_OBJECT'
  | 'REFRESH_MATVIEW'
  | 'VERIFY_COUNT';

export interface SyncStep {
  stepNumber: number;
  type: StepType;
  description: string;
  metadata: Record<string, unknown>;
}

export interface SyncPlan {
  syncId: string;
  modelId: string;
  workspaceId: string;
  sourceConn: Connection;
  destConn: Connection;
  steps: SyncStep[];
  warnings: string[];
  fullRefreshStrategy: FullRefreshStrategy;
}

export async function generateSyncPlan(syncId: string): Promise<SyncPlan> {
  const sync = await prisma.sync.findUniqueOrThrow({
    where: { id: syncId },
    include: {
      model: { include: { sourceConn: true } },
      destConn: true
    }
  });

  const { model, destConn } = sync;
  const plan: SyncPlan = {
    syncId,
    modelId: model.id,
    workspaceId: sync.workspaceId,
    sourceConn: model.sourceConn,
    destConn: destConn,
    steps: [],
    warnings: [],
    fullRefreshStrategy: (sync as any).fullRefreshStrategy
  };

  let currentStep = 1;

  // Step: Create Schema if not exists
  plan.steps.push({
    stepNumber: currentStep++,
    type: 'CREATE_SCHEMA',
    description: `Ensure schema ${sync.destSchema} exists`,
    metadata: { schema: sync.destSchema }
  });

  // No separate DROP/TRUNCATE steps here. 
  // We've moved this logic into the SYNC_DATA executor to minimize downtime.
  // The executor will dump source data to a file first, then truncate/drop, then restore.

  // Step: Sync Data
  plan.steps.push({
    stepNumber: currentStep++,
    type: 'SYNC_DATA',
    description: `Sync data from ${model.sourceType} to ${sync.destSchema}.${sync.destName}`,
    metadata: {
      sourceType: model.sourceType,
      sourceSchema: model.sourceSchema,
      sourceName: model.sourceName,
      customSql: model.customSql,
      destSchema: sync.destSchema,
      destName: sync.destName,
      syncMode: sync.syncMode,
      incrementalCol: sync.incrementalCol,
      columns: model.detectedColumns,
      modelId: model.id
    }
  });

  // Step: Verify
  plan.steps.push({
    stepNumber: currentStep++,
    type: 'VERIFY_COUNT',
    description: `Verify row counts match between source and destination`,
    metadata: {
      sourceConnId: model.sourceConnId,
      destConnId: destConn.id,
      modelId: model.id,
      syncId: sync.id,
      schema: sync.destSchema,
      name: sync.destName
    }
  });

  // Warnings
  if (model.schemaStatus === 'DRIFTED') {
    plan.warnings.push('Source schema has changed since last detection. Sync might fail or lose data.');
  }

  return plan;
}

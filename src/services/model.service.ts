import prisma from '../lib/db';
import { 
  SourceType, 
  Model, 
  ModelStatus,
  Prisma
} from '@prisma/client';
import { 
  detectSchema as detectPgSchema, 
  previewData as previewPgData 
} from './connection.service';

export interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey?: boolean;
}

export interface ModelCreateInput {
  workspaceId: string;
  name: string;
  description?: string;
  tags?: string[];
  sourceConnId: string;
  sourceType: SourceType;
  sourceSchema?: string;
  sourceName?: string;
  customSql?: string;
}

export interface BulkModelCreateInput {
  workspaceId: string;
  sourceConnId: string;
  objects: Array<{
    schema: string;
    name: string;
    type?: string;
  }>;
}

export async function createModel(input: ModelCreateInput): Promise<Model> {
  const model = await prisma.model.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description,
      tags: input.tags || [],
      sourceConnId: input.sourceConnId,
      sourceType: input.sourceType,
      sourceSchema: input.sourceSchema,
      sourceName: input.sourceName,
      customSql: input.customSql,
      status: 'DRAFT',
    }
  });

  // Auto-detect schema on creation
  try {
    await detectModelSchema(model.id);
  } catch (err) {
    console.error(`Failed to auto-detect schema for model ${model.id}:`, err);
  }

  return prisma.model.findUniqueOrThrow({ where: { id: model.id } });
}

export async function bulkCreateModels(input: BulkModelCreateInput): Promise<Model[]> {
  // Fetch existing models for this connection to prevent duplicates
  const existingModels = await prisma.model.findMany({
    where: {
      sourceConnId: input.sourceConnId,
      sourceType: { in: ['TABLE', 'VIEW', 'MATVIEW'] },
    },
    select: {
      sourceSchema: true,
      sourceName: true,
    }
  });

  const existingSet = new Set(
    existingModels.map(m => `${m.sourceSchema}.${m.sourceName}`)
  );

  const newObjects = input.objects.filter(
    obj => !existingSet.has(`${obj.schema}.${obj.name}`)
  );

  const models = await Promise.all(
    newObjects.map(obj => {
      let sourceType: SourceType = 'TABLE';
      if (obj.type) {
        const t = obj.type.toUpperCase();
        if (t === 'VIEW') sourceType = 'VIEW';
        else if (t === 'MATVIEW' || t === 'MATERIALIZED VIEW') sourceType = 'MATVIEW';
      }
      
      return createModel({
        workspaceId: input.workspaceId,
        name: `${obj.schema}_${obj.name}`,
        sourceConnId: input.sourceConnId,
        sourceType,
        sourceSchema: obj.schema,
        sourceName: obj.name,
      });
    })
  );

  return models;
}

export interface SchemaDiff {
  added: ColumnDef[];
  removed: ColumnDef[];
  changed: Array<{ column: string; oldType: string; newType: string }>;
}

export async function detectModelSchema(modelId: string): Promise<{
  columns: ColumnDef[];
  changed: boolean;
  diff: SchemaDiff | null;
}> {
  const model = await prisma.model.findUniqueOrThrow({
    where: { id: modelId },
    include: { sourceConn: true }
  });

  let detection: { columns: ColumnDef[] };
  
  if (model.sourceType === 'CUSTOM_SQL') {
    if (!model.customSql) throw new Error('Custom SQL is required for this model type');
    detection = await detectPgSchema(model.sourceConnId, { sql: model.customSql });
  } else {
    if (!model.sourceSchema || !model.sourceName) {
      throw new Error('Schema and Object Name are required for table/view models');
    }
    detection = await detectPgSchema(model.sourceConnId, { 
      schema: model.sourceSchema, 
      table: model.sourceName 
    });
  }

  const newColumns: ColumnDef[] = detection.columns.map((c: ColumnDef) => ({
    name: c.name,
    type: c.type,
    nullable: c.nullable,
    isPrimaryKey: c.isPrimaryKey
  }));

  const oldColumns = (model.detectedColumns as unknown as ColumnDef[]) || [];
  const diff = calculateSchemaDiff(oldColumns, newColumns);
  const isInitial = oldColumns.length === 0;
  const changed = isInitial ? false : (diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0);

  await prisma.model.update({
    where: { id: modelId },
    data: {
      detectedColumns: newColumns as unknown as Prisma.InputJsonValue,
      lastSchemaCheckedAt: new Date(),
      schemaStatus: changed ? 'DRIFTED' : 'SYNCED'
    }
  });

  return { columns: newColumns, changed, diff };
}

function calculateSchemaDiff(oldCols: ColumnDef[], newCols: ColumnDef[]): SchemaDiff {
  const diff: SchemaDiff = { added: [], removed: [], changed: [] };
  const oldMap = new Map(oldCols.map(c => [c.name, c]));
  const newMap = new Map(newCols.map(c => [c.name, c]));

  for (const [name, nCol] of newMap) {
    const oCol = oldMap.get(name);
    if (!oCol) {
      diff.added.push(nCol);
    } else if (oCol.type !== nCol.type) {
      diff.changed.push({ column: name, oldType: oCol.type, newType: nCol.type });
    }
  }

  for (const [name, oCol] of oldMap) {
    if (!newMap.has(name)) {
      diff.removed.push(oCol);
    }
  }

  return diff;
}

export async function previewModel(modelId: string): Promise<unknown> {
  const model = await prisma.model.findUniqueOrThrow({ where: { id: modelId } });

  if (model.sourceType === 'CUSTOM_SQL') {
    return previewPgData(model.sourceConnId, { sql: model.customSql! });
  } else {
    return previewPgData(model.sourceConnId, { schema: model.sourceSchema!, name: model.sourceName! });
  }
}

export async function refreshModelStatus(modelId: string): Promise<ModelStatus> {
  const model = await prisma.model.findUniqueOrThrow({
    where: { id: modelId },
    include: { syncs: true }
  });

  if (model.syncs.length === 0) {
    await prisma.model.update({ where: { id: modelId }, data: { status: 'DRAFT' } });
    return 'DRAFT';
  }

  const syncStatuses = model.syncs.map(s => s.status);
  
  let newStatus: ModelStatus = 'ACTIVE';
  if (syncStatuses.some(s => s === 'ERROR')) {
    newStatus = 'ERROR';
  } else if (syncStatuses.every(s => s === 'PAUSED' || s === 'DISABLED')) {
    newStatus = 'PAUSED';
  }

  await prisma.model.update({ where: { id: modelId }, data: { status: newStatus } });
  return newStatus;
}

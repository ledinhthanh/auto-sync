import prisma from '../lib/db';

export interface AddDependencyInput {
  modelId: string;
  dependentId: string;
  autoSync?: boolean;
}

export async function addDependency(input: AddDependencyInput) {
  // Prevent self-dependency
  if (input.modelId === input.dependentId) {
    throw new Error('A model cannot depend on itself');
  }

  // Check for circular dependency (simple 1-level check for now, can be expanded)
  const existing = await prisma.modelDependency.findFirst({
    where: {
      modelId: input.dependentId,
      dependentId: input.modelId
    }
  });

  if (existing) {
    throw new Error('Circular dependency detected');
  }

  return await prisma.modelDependency.create({
    data: {
      modelId: input.modelId,
      dependentId: input.dependentId,
      autoSync: input.autoSync ?? true
    },
    include: {
      dependent: true
    }
  });
}

export async function addDependencies(modelId: string, dependentIds: string[], autoSync?: boolean) {
  const results = [];
  for (const dependentId of dependentIds) {
    try {
      const dep = await addDependency({ modelId, dependentId, autoSync });
      results.push(dep);
    } catch (err) {
      console.error(`Failed to add dependency ${modelId} -> ${dependentId}:`, err);
    }
  }
  return results;
}

export async function removeDependency(id: string) {
  return await prisma.modelDependency.delete({
    where: { id }
  });
}

export async function updateDependency(id: string, autoSync: boolean) {
  return await prisma.modelDependency.update({
    where: { id },
    data: { autoSync }
  });
}

export async function listDependents(modelId: string) {
  return await prisma.modelDependency.findMany({
    where: { modelId },
    include: {
      dependent: {
        include: {
          syncs: {
            where: { status: 'ACTIVE' }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });
}

export async function listDependencies(dependentId: string) {
  return await prisma.modelDependency.findMany({
    where: { dependentId },
    include: {
      model: true
    },
    orderBy: { createdAt: 'asc' }
  });
}

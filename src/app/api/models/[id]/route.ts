import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const model = await prisma.model.findUnique({
    where: { id: params.id },
    include: {
      sourceConn: true,
      syncs: {
        include: {
          destConn: { select: { id: true, name: true } }
        }
      },
      dependencies: {
        include: {
          dependent: {
            include: {
              syncs: {
                where: { status: 'ACTIVE' }
              }
            }
          }
        }
      }
    }
  });

  if (!model) {
    return NextResponse.json({ error: 'Model not found' }, { status: 404 });
  }

  return NextResponse.json(model);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const model = await prisma.model.update({
      where: { id: params.id },
      data: {
        name: body.name,
        description: body.description,
        tags: body.tags,
        customSql: body.customSql,
        sourceSchema: body.sourceSchema,
        sourceName: body.sourceName,
      }
    });
    return NextResponse.json(model);
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Only allow deletion if no syncs exist
    const syncCount = await prisma.sync.count({ where: { modelId: params.id } });
    if (syncCount > 0) {
      return NextResponse.json({ error: 'Cannot delete model with active syncs' }, { status: 400 });
    }

    // Check if other models depend on this one
    const dependentCount = await prisma.modelDependency.count({ where: { modelId: params.id } });
    if (dependentCount > 0) {
      return NextResponse.json({ error: 'Cannot delete model because other models depend on it' }, { status: 400 });
    }

    await prisma.$transaction([
      // Delete dependencies this model has on others
      prisma.modelDependency.deleteMany({ where: { dependentId: params.id } }),
      // Finally delete the model
      prisma.model.delete({ where: { id: params.id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

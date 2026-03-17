import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { bulkCreateModels } from '@/services/model.service';
import { createSync } from '@/services/sync.service';
import { ConnectionRole } from '@prisma/client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sourceConnId, objects, autoCreateSyncJob, destConnId } = body;
    let { workspaceId } = body;

    if (!sourceConnId || !objects || !Array.isArray(objects)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!workspaceId) {
       let workspace = await prisma.workspace.findFirst();
       if (!workspace) {
         workspace = await prisma.workspace.create({
           data: { name: "Default Workspace", slug: "default-ws" }
         });
       }
       workspaceId = workspace.id;
    }

    const models = await bulkCreateModels({
      workspaceId,
      sourceConnId,
      objects
    });

    // Auto-create sync jobs if requested
    if (autoCreateSyncJob && models.length > 0) {
      let targetDestId = destConnId;

      // Fallback: Find the first available DESTINATION or BOTH connection if none provided
      if (!targetDestId) {
        const fallbackDest = await prisma.connection.findFirst({
          where: {
            workspaceId,
            role: { in: [ConnectionRole.DESTINATION, ConnectionRole.BOTH] },
          },
          orderBy: { createdAt: 'desc' },
        });
        targetDestId = fallbackDest?.id;
      }

      if (targetDestId) {
        await Promise.allSettled(
          models.map(model =>
            createSync({
              workspaceId,
              modelId: model.id,
              destConnId: targetDestId,
              destSchema: model.sourceSchema || 'public',
              destName: model.sourceName || model.name,
              syncMode: 'FULL_REFRESH',
              fullRefreshStrategy: 'TRUNCATE',
              scheduleEnabled: false,
            })
          )
        );
      }
    }

    return NextResponse.json(models, { status: 201 });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("POST /api/models/bulk error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

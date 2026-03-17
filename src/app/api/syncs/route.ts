import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let workspaceId = searchParams.get('workspaceId');

  if (!workspaceId) {
    const workspace = await prisma.workspace.findFirst();
    if (!workspace) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 });
    }
    workspaceId = workspace.id;
  }

  const syncs = await prisma.sync.findMany({
    where: { workspaceId },
    include: {
      model: { select: { name: true, sourceType: true, sourceConn: { select: { name: true } } } },
      destConn: { select: { name: true, type: true } },
      runs: {
        where: { status: { in: ['PENDING', 'RUNNING'] } },
        take: 1
      }
    },
    orderBy: { updatedAt: 'desc' }
  });

  const syncsWithStatus = syncs.map(sync => {
    const isRunning = sync.runs && sync.runs.length > 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { runs, ...rest } = sync;
    return {
      ...rest,
      status: isRunning ? 'RUNNING' : sync.status
    };
  });

  return NextResponse.json(syncsWithStatus);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, modelId, destConnId, destSchema, destName, syncMode, fullRefreshStrategy, scheduleEnabled, schedule } = body;

    // Validate required fields
    if (!name || !modelId || !destConnId || !destName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get workspaceId from the model to link the sync properly
    const model = await prisma.model.findUnique({
      where: { id: modelId },
      select: { workspaceId: true }
    });

    if (!model) {
       return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const newSync = await prisma.sync.create({
      data: {
        workspaceId: model.workspaceId,
        modelId,
        name,
        destConnId,
        destSchema: destSchema || 'public',
        destName,
        syncMode: syncMode || 'FULL_REFRESH',
        fullRefreshStrategy: fullRefreshStrategy || 'TRUNCATE',
        scheduleEnabled: scheduleEnabled || false,
        schedule: scheduleEnabled ? schedule : null,
        status: 'DRAFT'
      }
    });

    return NextResponse.json(newSync, { status: 201 });
  } catch (error) {
    console.error("Failed to create sync:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

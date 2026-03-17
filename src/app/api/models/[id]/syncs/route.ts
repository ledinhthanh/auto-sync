import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { createSync } from '@/services/sync.service';
import { SyncMode } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const syncs = await prisma.sync.findMany({
    where: { modelId: params.id },
    include: {
      destConn: { select: { name: true, type: true } }
    },
    orderBy: { updatedAt: 'desc' }
  });
  return NextResponse.json(syncs);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const sync = await createSync({
      workspaceId: body.workspaceId,
      modelId: params.id,
      name: body.name,
      destConnId: body.destConnId,
      destSchema: body.destSchema,
      destName: body.destName,
      syncMode: body.syncMode as SyncMode,
      incrementalCol: body.incrementalCol,
      schedule: body.schedule,
      scheduleEnabled: body.scheduleEnabled,
      timezone: body.timezone
    });
    return NextResponse.json(sync, { status: 201 });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

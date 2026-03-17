import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { updateSync } from '@/services/sync.service';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sync = await prisma.sync.findUnique({
    where: { id: params.id },
    include: {
      model: { include: { sourceConn: true } },
      destConn: true
    }
  });

  if (!sync) {
    return NextResponse.json({ error: 'Sync not found' }, { status: 404 });
  }

  return NextResponse.json(sync);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const sync = await updateSync(params.id, body);
    return NextResponse.json(sync);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.$transaction([
      // Delete child records first to avoid FK constraint violations
      prisma.syncRun.deleteMany({ where: { syncId: params.id } }),
      prisma.destObject.deleteMany({ where: { syncId: params.id } }),
      prisma.sync.delete({ where: { id: params.id } }),
    ]);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

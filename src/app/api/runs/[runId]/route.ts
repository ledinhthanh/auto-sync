import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { runId: string } }) {
  const run = await prisma.syncRun.findUnique({
    where: { id: params.runId },
    include: {
      sync: {
        include: {
          model: true,
          destConn: true
        }
      }
    }
  });

  if (!run) {
    return NextResponse.json({ error: 'SyncRun not found' }, { status: 404 });
  }

  return NextResponse.json(run);
}

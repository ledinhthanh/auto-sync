import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const runs = await prisma.syncRun.findMany({
      include: {
        sync: {
            select: { name: true }
        }
      },
      orderBy: { startedAt: 'desc' },
      take: 100 // Limit for now
    });

    const formattedRuns = runs.map(run => ({
      id: run.id,
      jobName: run.sync.name,
      status: run.status,
      triggeredBy: run.triggeredBy,
      startedAt: run.startedAt,
      durationMs: run.durationMs,
      rowsProcessed: run.rowsProcessed,
      bytesTransferred: run.bytesTransferred,
      errorMessage: run.errorMessage,
      logOutput: run.logOutput
    }));

    return NextResponse.json(formattedRuns);
  } catch (error) {
    console.error("Failed to fetch history:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

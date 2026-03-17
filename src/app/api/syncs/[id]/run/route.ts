import { NextRequest, NextResponse } from 'next/server';
import { triggerRun } from '@/services/sync.service';
import { TriggerBy } from '@prisma/client';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const runId = await triggerRun(params.id, TriggerBy.MANUAL);
    return NextResponse.json({ runId });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

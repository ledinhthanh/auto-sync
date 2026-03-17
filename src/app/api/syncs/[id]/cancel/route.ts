import { NextRequest, NextResponse } from 'next/server';
import { cancelRun } from '@/services/scheduler.service';

export async function POST(req: NextRequest) {
  try {
    const { runId } = await req.json();
    if (!runId) return NextResponse.json({ error: 'runId is required' }, { status: 400 });
    
    await cancelRun(runId);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { generateSyncPlan } from '@/services/sync-plan.service';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const plan = await generateSyncPlan(params.id);
    return NextResponse.json(plan);
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

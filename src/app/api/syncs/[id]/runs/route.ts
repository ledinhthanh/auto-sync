import { NextRequest, NextResponse } from 'next/server';
import { getSyncRuns } from '@/services/sync.service';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  
  try {
    const runs = await getSyncRuns(params.id, limit);
    return NextResponse.json(runs);
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { toggleSync } from '@/services/sync.service';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { enabled } = await req.json();
    const sync = await toggleSync(params.id, !!enabled);
    return NextResponse.json(sync);
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

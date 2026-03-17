import { NextRequest, NextResponse } from 'next/server';
import { detectModelSchema } from '@/services/model.service';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const result = await detectModelSchema(params.id);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

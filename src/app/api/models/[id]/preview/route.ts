import { NextRequest, NextResponse } from 'next/server';
import { previewModel } from '@/services/model.service';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await previewModel(params.id);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`Error previewing model ${params.id}:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

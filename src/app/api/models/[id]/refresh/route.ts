import { NextRequest, NextResponse } from 'next/server';
import { detectModelSchema } from '@/services/model.service';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const result = await detectModelSchema(id);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Failed to refresh model schema:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to refresh schema' },
      { status: 500 }
    );
  }
}

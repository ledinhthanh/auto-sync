import { NextRequest, NextResponse } from 'next/server';
import { autoFixSchema } from '@/services/sync-validator.service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { modelId, destConnId, destSchema, destName } = body;

    if (!modelId || !destConnId || !destName) {
      return NextResponse.json({ error: 'Missing required configuration' }, { status: 400 });
    }

    const result = await autoFixSchema(
      modelId,
      destConnId,
      destSchema || 'public',
      destName
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Schema auto-fix API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { generateSyncPlan } from '@/services/sync-plan.service';
import { validateSyncDestination } from '@/services/sync-executor.service';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const syncId = params.id;

    // 1. Load sync and connections
    const sync = await prisma.sync.findUnique({
      where: { id: syncId },
      include: {
        model: { include: { sourceConn: true } },
        destConn: true,
      },
    });

    if (!sync) {
      return NextResponse.json({ error: 'Sync job not found' }, { status: 404 });
    }

    // 2. Generate plan
    const plan = await generateSyncPlan(syncId);

    // 3. Run validation
    const issues = await validateSyncDestination(
        plan, 
        sync.model.sourceConn, 
        sync.destConn
    );

    const hasErrors = issues.dependencies.length > 0;
    
    return NextResponse.json({
      success: !hasErrors,
      issues,
      message: hasErrors 
        ? 'Validation failed with blocking issues.' 
        : 'Validation passed (some warnings may exist).'
    });

  } catch (error: any) {
    console.error('Validation API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

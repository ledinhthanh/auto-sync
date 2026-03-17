import { NextRequest, NextResponse } from 'next/server';
import { addDependency, addDependencies, listDependents } from '../../../../../services/dependency-management.service';

/**
 * GET: List dependents of a model
 * POST: Add new dependent(s) to a model
 */

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const dependents = await listDependents(params.id);
    return NextResponse.json(dependents);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { dependentId, dependentIds, autoSync } = body;

    if (dependentIds && Array.isArray(dependentIds)) {
      const results = await addDependencies(params.id, dependentIds, autoSync);
      return NextResponse.json(results);
    }

    if (!dependentId) {
      return NextResponse.json({ error: 'dependentId or dependentIds is required' }, { status: 400 });
    }

    const dependency = await addDependency({
      modelId: params.id,
      dependentId,
      autoSync
    });

    return NextResponse.json(dependency);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

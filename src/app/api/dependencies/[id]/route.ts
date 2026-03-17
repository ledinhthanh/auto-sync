import { NextRequest, NextResponse } from 'next/server';
import { removeDependency, updateDependency } from '../../../../services/dependency-management.service';

/**
 * PATCH: Update dependency autoSync flag
 * DELETE: Remove dependency
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { autoSync } = body;

    const dependency = await updateDependency(params.id, autoSync);
    return NextResponse.json(dependency);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await removeDependency(params.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

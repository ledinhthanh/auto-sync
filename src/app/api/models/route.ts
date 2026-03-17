import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { createModel } from '@/services/model.service';
import { SourceType } from '@prisma/client';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let workspaceId = searchParams.get('workspaceId');

  if (!workspaceId) {
    const workspace = await prisma.workspace.findFirst();
    if (!workspace) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 });
    }
    workspaceId = workspace.id;
  }

  const models = await prisma.model.findMany({
    where: { workspaceId },
    include: {
      sourceConn: { select: { name: true, type: true } },
      _count: { select: { syncs: true } }
    },
    orderBy: { updatedAt: 'desc' }
  });

  return NextResponse.json(models);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      name, 
      description, 
      tags, 
      sourceConnId, 
      sourceType, 
      sourceSchema, 
      sourceName, 
      customSql 
    } = body;
    let { workspaceId } = body;

    if (!workspaceId) {
       let workspace = await prisma.workspace.findFirst();
       if (!workspace) {
         workspace = await prisma.workspace.create({
           data: { name: "Default Workspace", slug: "default-ws" }
         });
       }
       workspaceId = workspace.id;
    }

    if (!name || !sourceConnId || !sourceType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const model = await createModel({
      workspaceId,
      name,
      description,
      tags,
      sourceConnId,
      sourceType: sourceType as SourceType,
      sourceSchema,
      sourceName,
      customSql
    });

    return NextResponse.json(model, { status: 201 });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { listObjects, testConnection } from "@/services/connection.service";
import prisma from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const { searchParams } = new URL(req.url);
    const schema = searchParams.get("schema");

    if (!id) {
      return NextResponse.json({ error: "Connection ID required" }, { status: 400 });
    }

    // If no schema provided, fetch objects from all schemas
    if (!schema) {
      const allObjects = await listObjects(id);
      const conn = await prisma.connection.findUniqueOrThrow({ where: { id } });
      const testRes = await testConnection(conn);
      return NextResponse.json({ 
        objects: allObjects,
        schemas: testRes.schemas 
      });
    }

    // Otherwise return objects in that specific schema
    const objects = await listObjects(id, schema);
    return NextResponse.json({ objects });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("GET /api/connections/[id]/objects error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

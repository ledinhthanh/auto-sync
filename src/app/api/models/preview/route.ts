import { NextResponse } from "next/server";
import { previewData } from "@/services/connection.service";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { connId, schema, name, sql } = body;

    if (!connId) {
      return NextResponse.json({ error: "Connection ID required" }, { status: 400 });
    }

    const input = sql ? { sql } : { schema, name };
    const result = await previewData(connId, input);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    console.error("POST /api/models/preview error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

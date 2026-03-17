import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { encryptCredential } from "@/lib/crypto";
import { closePool } from "@/lib/pg-client";
import { closeMySQLPool } from "@/lib/mysql-client";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, name, type, role, host, port, database, username, password, sslMode, sshEnabled, sshHost, sshPort, sshUser } = body;

    if (!id) {
      return NextResponse.json({ error: "Connection ID required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      name,
      type,
      role,
      host,
      port: Number(port),
      database,
      username,
      sslMode,
      sshEnabled: !!sshEnabled,
      sshHost: sshHost || null,
      sshPort: sshPort ? Number(sshPort) : null,
      sshUser: sshUser || null,
    };

    if (password) {
      updateData.passwordEnc = encryptCredential(password);
    }

    const connection = await prisma.connection.update({
      where: { id },
      data: updateData,
    });

    // Invalidate pools
    await closePool(id);
    await closeMySQLPool(id);

    return NextResponse.json(connection);
  } catch (error: unknown) {
    const err = error as Error;
    console.error("PUT /api/connections/[id] error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Connection ID required" }, { status: 400 });
    }

    await prisma.connection.delete({
      where: { id },
    });

    // Invalidate pools
    await closePool(id);
    await closeMySQLPool(id);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("DELETE /api/connections/[id] error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

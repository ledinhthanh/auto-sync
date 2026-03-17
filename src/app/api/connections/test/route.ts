import { NextResponse } from "next/server";
import { testConnection as testConnService } from "@/services/connection.service";
import { encryptCredential } from "@/lib/crypto";
import prisma from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    let passwordEnc = body.password ? encryptCredential(body.password) : null;
    let sshKeyEnc = body.sshKey ? encryptCredential(body.sshKey) : null;

    // If editing and credentials are empty, fetch from DB
    if (body.id) {
      const existing = await prisma.connection.findUnique({
        where: { id: body.id },
        select: { passwordEnc: true, sshKeyEnc: true }
      });
      
      if (existing) {
        if (!passwordEnc) passwordEnc = existing.passwordEnc;
        if (!sshKeyEnc) sshKeyEnc = existing.sshKeyEnc;
      }
    }

    console.log(`[DEBUG] POST /api/connections/test starting for host=${body.host} db=${body.database}`);

    const tempConnection = {
      id: body.id || "temp-test",
      name: body.name || "Test",
      type: body.type,
      role: body.role || "BOTH",
      host: body.host,
      port: Number(body.port),
      database: body.database,
      username: body.username,
      passwordEnc,
      sslMode: body.sslMode || "disable",
      sshEnabled: !!body.sshEnabled,
      sshHost: body.sshHost || null,
      sshPort: body.sshPort ? Number(body.sshPort) : null,
      sshUser: body.sshUser || null,
      sshKeyEnc,
      status: "ACTIVE" as const,
      workspaceId: "temp",
    };

    console.log(`[DEBUG] Calling testConnService with host=${tempConnection.host}, port=${tempConnection.port}, user=${tempConnection.username}`);
    const result = await testConnService(tempConnection as Parameters<typeof testConnService>[0]);
    console.log(`[DEBUG] testConnService result: success=${result.success}, error=${result.error || 'none'}`);

    if (result.success) {
      return NextResponse.json({
        success: true,
        serverVersion: result.serverVersion,
        latencyMs: result.latencyMs,
      });
    } else {
      console.warn(`[WARN] Connection test failed for ${body.host}: ${result.error}`);
      return NextResponse.json({
        success: false,
        error: result.error || "Connection failed",
      }, { status: 400 });
    }
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`[ERROR] POST /api/connections/test exception:`, err);
    return NextResponse.json({
      success: false,
      error: err.message || "Connection failed",
    }, { status: 400 });
  }
}

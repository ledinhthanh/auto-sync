import prisma from "@/lib/db";
import { NextResponse } from "next/server";
import { encryptCredential } from "@/lib/crypto";

export async function GET() {
    try {
        const connections = await prisma.connection.findMany({
            orderBy: { createdAt: "desc" },
        });

        // Map internal DB status to UI format
        return NextResponse.json(connections);
    } catch (error: unknown) {
        console.error("GET /api/connections error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // Auto-create default workspace if it doesn't exist (simplifies onboarding)
        let workspace = await prisma.workspace.findFirst();
        if (!workspace) {
            workspace = await prisma.workspace.create({
                data: { name: "Default Workspace", slug: "default-ws" }
            });
        }

        const connection = await prisma.connection.create({
            data: {
                workspaceId: workspace.id,
                name: body.name,
                type: body.type, // POSTGRES | MYSQL
                role: body.role, // SOURCE | DESTINATION | BOTH
                host: body.host,
                port: Number(body.port),
                database: body.database,
                username: body.username,
                passwordEnc: body.password ? encryptCredential(body.password) : "",
                status: "ACTIVE",
                sslMode: body.sslMode || "disable"
            }
        });

        return NextResponse.json(connection, { status: 201 });
    } catch (error: unknown) {
        console.error("POST /api/connections error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

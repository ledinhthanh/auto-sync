import prisma from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const jobs = await prisma.sync.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                model: {
                    include: {
                        sourceConn: { select: { name: true, type: true } }
                    }
                },
                destConn: { select: { name: true, type: true } },
            }
        });
        return NextResponse.json(jobs);
    } catch (error: unknown) {
        console.error("GET /api/jobs error:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const workspace = await prisma.workspace.findFirst();
        if (!workspace) {
            return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
        }

        const job = await prisma.sync.create({
            data: {
                workspaceId: workspace.id,
                name: body.name,
                modelId: body.modelId, // Updated to use modelId as per Sync schema
                destConnId: body.destConnId,
                destSchema: body.destSchema || "public",
                destName: body.destName,
                syncMode: body.syncMode || "FULL_REFRESH",
                status: "DRAFT",
                schedule: body.schedule,
                scheduleEnabled: body.scheduleEnabled || false,
            }
        });

        return NextResponse.json(job, { status: 201 });
    } catch (error: unknown) {
        console.error("POST /api/jobs error:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Internal Server Error" }, { status: 500 });
    }
}

import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { getRedis } from '@/lib/redis';

export async function GET(req: NextRequest, { params }: { params: { runId: string } }) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const redis = getRedis().duplicate();
      const logKey = `logs:${params.runId}`;

      // 1. Send existing logs first
      const existing = await redis.xrange(logKey, '-', '+');
      for (const [, fields] of existing) {
        const data = parseRedisStreamEntry(fields);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      // 2. Subscribe to new logs
      let lastId = existing.length > 0 ? existing[existing.length - 1][0] : '$';

      const poll = setInterval(async () => {
        const newEntries = await redis.xread('COUNT', 100, 'STREAMS', logKey, lastId);
        if (newEntries) {
          for (const [, entries] of newEntries) {
            for (const [id, fields] of entries) {
              const data = parseRedisStreamEntry(fields);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
              lastId = id;
            }
          }
        }

        // 3. Check if run is finished to terminate the stream
        const run = await prisma.syncRun.findUnique({ where: { id: params.runId } });
        if (run && !['RUNNING', 'PENDING'].includes(run.status)) {
          clearInterval(poll);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'DONE', status: run.status })}\n\n`));
          controller.close();
          redis.disconnect();
        }
      }, 500); 

      req.signal.addEventListener('abort', () => {
        clearInterval(poll);
        redis.disconnect();
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}

function parseRedisStreamEntry(fields: string[]) {
  const obj: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    obj[fields[i]] = fields[i + 1];
  }
  return {
    timestamp: obj.ts,
    level: obj.level,
    message: obj.msg,
    stepNumber: obj.step ? parseInt(obj.step, 10) : null,
    metadata: {
      sourceHost: obj.srcHost,
      sourceDb: obj.srcDb,
      sourceTable: obj.srcTable,
      destHost: obj.destHost,
      destDb: obj.destDb,
      destTable: obj.destTable,
      bytes: obj.bytes ? parseInt(obj.bytes, 10) : undefined,
      rows: obj.rows ? parseInt(obj.rows, 10) : undefined,
      durationMs: obj.durationMs ? parseInt(obj.durationMs, 10) : undefined,
      command: obj.cmd,
      exitCode: obj.exitCode ? parseInt(obj.exitCode, 10) : undefined,
      rawOutput: obj.raw
    }
  };
}

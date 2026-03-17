import prisma from '../src/lib/db';
import { createModel, detectModelSchema } from '../src/services/model.service';
import { createSync, triggerRun } from '../src/services/sync.service';
import { getRedis } from '../src/lib/redis';

async function main() {
  console.log('--- STARTING INTEGRATION TEST ---');

  // 1. Setup Mock Workspace and Connections if needed
  let workspace = await prisma.workspace.findFirst();
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: { name: 'Test Workspace', slug: 'test' }
    });
  }

  const sourceConn = await prisma.connection.findFirst({
    where: { workspaceId: workspace.id, role: { in: ['SOURCE', 'BOTH'] } }
  });
  const destConn = await prisma.connection.findFirst({
    where: { workspaceId: workspace.id, role: { in: ['DESTINATION', 'BOTH'] } }
  });

  if (!sourceConn || !destConn) {
    console.error('Please ensure you have at least one source and one destination connection in the DB.');
    process.exit(1);
  }

  // 2. Create Model
  console.log(`Creating Model from source: ${sourceConn.name}`);
  const model = await createModel({
    workspaceId: workspace.id,
    name: 'Test Model Faculty',
    sourceConnId: sourceConn.id,
    sourceType: 'TABLE',
    sourceSchema: 'public',
    sourceName: 'faculty'
  });
  console.log(`Model created: ${model.id}`);

  // 3. Detect Schema
  console.log('Detecting schema...');
  const detection = await detectModelSchema(model.id);
  console.log(`Detected ${detection.columns.length} columns.`);

  // 4. Create Sync
  console.log(`Creating Sync to destination: ${destConn.name}`);
  const sync = await createSync({
    workspaceId: workspace.id,
    modelId: model.id,
    destConnId: destConn.id,
    destSchema: 'public',
    destName: 'dim_faculty_test',
    syncMode: 'FULL_REFRESH'
  });
  console.log(`Sync created: ${sync.id}`);

  // 5. Trigger Run
  console.log('Triggering manual run...');
  const syncRunId = await triggerRun(sync.id, 'MANUAL');
  console.log(`SyncRun triggered: ${syncRunId}`);

  // 6. Monitor Status (Simple Poll)
  console.log('Monitoring run status...');
  let attempts = 0;
  while (attempts < 30) {
    const run = await prisma.syncRun.findUnique({ where: { id: syncRunId } });
    console.log(`Run status: ${run?.status}`);
    
    if (run?.status === 'SUCCESS' || run?.status === 'FAILED') {
      console.log('Run finished.');
      if (run.status === 'FAILED') {
        console.error(`Error: ${run.errorMessage}`);
      } else {
        console.log(`Rows: ${run.rowsProcessed}, Duration: ${run.durationMs}ms`);
      }
      break;
    }

    await new Promise(r => setTimeout(r, 2000));
    attempts++;
  }

  // 7. Cleanup (Optional or for next test)
  console.log('--- TEST FINISHED ---');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

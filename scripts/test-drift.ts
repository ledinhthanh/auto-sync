import prisma from '../src/lib/db';
import { detectModelSchema } from '../src/services/model.service';
import { execSync } from 'child_process';

async function main() {
  console.log('--- STARTING DRIFT TEST ---');
  
  // 1. Get the last created model
  const model = await prisma.model.findFirst({
    orderBy: { createdAt: 'desc' }
  });

  if (!model) {
    console.error('No model found. Run test-sync.ts first.');
    process.exit(1);
  }

  console.log(`Testing drift for model: ${model.name} (${model.id})`);
  console.log(`Current schema status: ${model.schemaStatus}`);

  // 2. Alter source table (Add a column)
  console.log('Altering source table: adding column "office_number"...');
  try {
    execSync('docker exec -i autosync-db_source-1 psql -U source_user -d source_db -c "ALTER TABLE faculty ADD COLUMN IF NOT EXISTS office_number TEXT;"');
    console.log('Table altered.');
  } catch (err: any) {
    console.error(`Failed to alter table: ${err.message}`);
    process.exit(1);
  }

  // 3. Detect Schema
  console.log('Detecting schema again...');
  const result = await detectModelSchema(model.id);
  
  console.log(`Detected columns: ${result.columns.length}`);
  console.log(`Changed: ${result.changed}`);
  if (result.diff) {
    console.log('Diff detected:', JSON.stringify(result.diff, null, 2));
  }

  // 4. Check status in DB
  const updatedModel = await prisma.model.findUnique({ where: { id: model.id } });
  console.log(`Updated schema status: ${updatedModel?.schemaStatus}`);

  if (updatedModel?.schemaStatus === 'DRIFTED') {
    console.log('SUCCESS: Drift detected correctly.');
  } else {
    console.error('FAILURE: Drift NOT detected.');
  }

  console.log('--- DRIFT TEST FINISHED ---');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

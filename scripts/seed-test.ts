import prisma from '../src/lib/db';
import { encryptCredential } from '../src/lib/crypto';

async function main() {
  console.log('--- SEEDING CONNECTIONS ---');
  
  let workspace = await prisma.workspace.findFirst();
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: { name: 'Test Workspace', slug: 'test' }
    });
  }

  const sourcePasswordEnc = encryptCredential('source_password');
  const destPasswordEnc = encryptCredential('dest_password');

  // Source Connection
  await prisma.connection.upsert({
    where: { id: 'test-source-id' },
    update: { passwordEnc: sourcePasswordEnc }, // MUST UPDATE THIS
    create: {
      id: 'test-source-id',
      workspaceId: workspace.id,
      name: 'Source DB',
      type: 'POSTGRES',
      role: 'SOURCE',
      host: 'localhost',
      port: 5434,
      database: 'source_db',
      username: 'source_user',
      passwordEnc: sourcePasswordEnc,
      status: 'ACTIVE'
    }
  });

  // Destination Connection
  await prisma.connection.upsert({
    where: { id: 'test-dest-id' },
    update: { passwordEnc: destPasswordEnc }, // MUST UPDATE THIS
    create: {
      id: 'test-dest-id',
      workspaceId: workspace.id,
      name: 'Dest DB',
      type: 'POSTGRES',
      role: 'DESTINATION',
      host: 'localhost',
      port: 5435,
      database: 'dest_db',
      username: 'dest_user',
      passwordEnc: destPasswordEnc,
      status: 'ACTIVE'
    }
  });

  console.log('--- SEEDING FINISHED ---');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

import prisma from './src/lib/db';

async function main() {
  console.log('Prisma Models:', Object.keys(prisma).filter(k => !k.startsWith('$') && !k.startsWith('_')));
  const destObject = await prisma.destObject.findFirst();
  console.log('DestObject Fields:', destObject ? Object.keys(destObject) : 'No records');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

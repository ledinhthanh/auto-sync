import { PrismaClient, SourceType } from '@prisma/client';
import { Client } from 'pg';
import mysql from 'mysql2/promise';
import { decryptCredential } from '../src/lib/crypto'; // Assuming this exists

const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration to fix misidentified TABLEs to VIEWs/MATVIEWs...');

  const models = await prisma.model.findMany({
    where: {
      sourceType: 'TABLE',
    },
    include: {
      sourceConn: true,
    },
  });

  console.log(`Found ${models.length} models with sourceType="TABLE" to check.`);

  let updatedCount = 0;

  for (const model of models) {
    if (!model.sourceSchema || !model.sourceName) continue;

    try {
      let type: string | null = null;
      const pass = decryptCredential(model.sourceConn.passwordEnc);

      if (model.sourceConn.type === 'POSTGRES') {
        const client = new Client({
          host: model.sourceConn.host,
          port: model.sourceConn.port,
          database: model.sourceConn.database,
          user: model.sourceConn.username,
          password: pass,
          ssl: model.sourceConn.sslMode === 'require' || model.sourceConn.sslMode === 'prefer' ? { rejectUnauthorized: false } : undefined,
        });
        await client.connect();

        try {
          const res = await client.query(`
            SELECT CASE c.relkind
              WHEN 'v' THEN 'VIEW'
              WHEN 'm' THEN 'MATVIEW'
              ELSE 'TABLE'
            END as type
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 AND c.relname = $2
          `, [model.sourceSchema, model.sourceName]);
          
          if (res.rows.length > 0) {
            type = res.rows[0].type;
          }
        } finally {
          await client.end();
        }
      } else if (model.sourceConn.type === 'MYSQL') {
        const conn = await mysql.createConnection({
          host: model.sourceConn.host,
          port: model.sourceConn.port,
          database: model.sourceConn.database,
          user: model.sourceConn.username,
          password: pass,
        });

        try {
          const dbName = model.sourceSchema || model.sourceConn.database;
          const [rows]: any = await conn.query(`
            SELECT TABLE_TYPE
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
          `, [dbName, model.sourceName]);

          if (rows && rows.length > 0) {
            type = rows[0].TABLE_TYPE.toUpperCase().includes('VIEW') ? 'VIEW' : 'TABLE';
          }
        } finally {
          await conn.end();
        }
      }

      if (type && type !== 'TABLE') {
        await prisma.model.update({
          where: { id: model.id },
          data: { sourceType: type as SourceType },
        });
        console.log(`Updated model ${model.sourceSchema}.${model.sourceName} to ${type}`);
        updatedCount++;
      }
    } catch (e: any) {
      console.error(`Failed to check model ${model.sourceSchema}.${model.sourceName}: ${e.message}`);
    }
  }

  console.log(`Migration complete. Updated ${updatedCount} models.`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

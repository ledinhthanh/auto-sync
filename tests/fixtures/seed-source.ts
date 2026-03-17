import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

async function main() {
  const client = new Client({
    host: process.env.SOURCE_DB_HOST,
    port: parseInt(process.env.SOURCE_DB_PORT || '5444', 10),
    user: process.env.SOURCE_DB_USER,
    password: process.env.SOURCE_DB_PASS,
    database: process.env.SOURCE_DB_NAME,
  });

  try {
    await client.connect();
    console.log('Connected to source test DB');

    await client.query('DROP VIEW IF EXISTS faculty_view CASCADE');
    await client.query('DROP MATERIALIZED VIEW IF EXISTS faculty_matview CASCADE');
    await client.query('DROP TABLE IF EXISTS faculty CASCADE');
    await client.query('DROP TABLE IF EXISTS complex_types CASCADE');
    await client.query('DROP TABLE IF EXISTS incremental_test CASCADE');

    await client.query(
      'CREATE TABLE faculty (' +
      'id SERIAL PRIMARY KEY, ' +
      'name TEXT NOT NULL, ' +
      'department TEXT, ' +
      'salary NUMERIC(10, 2), ' +
      'is_active BOOLEAN DEFAULT true, ' +
      'created_at TIMESTAMPTZ DEFAULT NOW())'
    );

    const insertResult = await client.query(
      "INSERT INTO faculty (name, department, salary) VALUES " +
      "('John Doe', 'Computer Science', 85000), " +
      "('Jane Smith', 'Mathematics', 78000), " +
      "('Bob Wilson', 'Physics', 82000) RETURNING *"
    );
    console.log('Inserted faculty:', insertResult.rowCount, 'rows');

    await client.query(
      'CREATE TABLE complex_types (' +
      'id SERIAL PRIMARY KEY, ' +
      'tags TEXT[], ' +
      'metadata JSONB, ' +
      'scores INTEGER[], ' +
      'data BYTEA, ' +
      'is_enabled BOOLEAN DEFAULT true, ' +
      'created_at TIMESTAMPTZ DEFAULT NOW(), ' +
      'amount NUMERIC(15, 4))'
    );

    await client.query(
      "INSERT INTO complex_types (tags, metadata, scores, data, amount) VALUES " +
      "(ARRAY['a', 'b'], '{\"key\": \"value\", \"nested\": {\"foo\": \"bar\"}}', ARRAY[1, 2, 3], '\\xdeadbeef', 1234.5678), " +
      "(ARRAY['x', 'y', 'z'], '{\"active\": true}', ARRAY[10, 20], '\\xcafe', 999.99)"
    );

    await client.query(
      'CREATE TABLE incremental_test (' +
      'id SERIAL PRIMARY KEY, ' +
      'val TEXT, ' +
      'updated_at TIMESTAMPTZ DEFAULT NOW())'
    );

    await client.query(
      "INSERT INTO incremental_test (val) VALUES ('v1'), ('v2')"
    );

    await client.query('CREATE VIEW faculty_view AS SELECT id, name FROM faculty');
    await client.query('CREATE MATERIALIZED VIEW faculty_matview AS SELECT department, AVG(salary) as avg_salary FROM faculty GROUP BY department');

    const verify = await client.query('SELECT count(*) as cnt FROM faculty');
    console.log('Verification - faculty rows:', verify.rows[0].cnt);

    console.log('Source DB seeding completed');
  } catch (err) {
    console.error('Failed to seed source DB:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

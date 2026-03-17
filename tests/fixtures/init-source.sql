-- Clean up
DROP VIEW IF EXISTS faculty_view CASCADE;
DROP MATERIALIZED VIEW IF EXISTS faculty_matview CASCADE;
DROP TABLE IF EXISTS faculty CASCADE;
DROP TABLE IF EXISTS complex_types CASCADE;
DROP TABLE IF EXISTS incremental_test CASCADE;

-- 1. Simple Table: faculty (for basic sync)
CREATE TABLE faculty (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT,
  salary NUMERIC(10, 2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO faculty (name, department, salary) VALUES
  ('John Doe', 'Computer Science', 85000),
  ('Jane Smith', 'Mathematics', 78000),
  ('Bob Wilson', 'Physics', 82000);

-- 2. Complex Types Table (array, jsonb, numeric, boolean, timestamptz)
CREATE TABLE complex_types (
  id SERIAL PRIMARY KEY,
  tags TEXT[],
  metadata JSONB,
  scores INTEGER[],
  data BYTEA,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  amount NUMERIC(15, 4)
);
INSERT INTO complex_types (tags, metadata, scores, data, amount) VALUES
  (ARRAY['a', 'b'], '{"key": "value", "nested": {"foo": "bar"}}', ARRAY[1, 2, 3], '\xdeadbeef', 1234.5678),
  (ARRAY['x', 'y', 'z'], '{"active": true}', ARRAY[10, 20], '\xcafe', 999.99);

-- 3. Incremental Sync Table
CREATE TABLE incremental_test (
  id SERIAL PRIMARY KEY,
  val TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO incremental_test (val) VALUES ('v1'), ('v2');

-- 4. Views for dependency testing
CREATE VIEW faculty_view AS SELECT id, name FROM faculty;
CREATE MATERIALIZED VIEW faculty_matview AS SELECT department, AVG(salary) as avg_salary FROM faculty GROUP BY department;

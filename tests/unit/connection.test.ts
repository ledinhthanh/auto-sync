import { describe, it, expect } from 'vitest';
import { buildCreateTableSql, validateSql } from '../../src/services/connection.service';
import { maskCredentials } from '../../src/lib/crypto';

describe('connection.service - buildCreateTableSql', () => {
  it('should generate basic CREATE TABLE SQL', () => {
    const columns = [
      { name: 'id', type: 'int4', isArray: false, nullable: false, numericPrecision: null, numericScale: null, maxLength: null },
      { name: 'name', type: 'text', isArray: false, nullable: true, numericPrecision: null, numericScale: null, maxLength: null }
    ];
    const sql = buildCreateTableSql('public', 'test_table', columns as any);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "public"."test_table"');
    expect(sql).toContain('"id" int4 NOT NULL');
    expect(sql).toContain('"name" text');
  });

  it('should handle numeric precision and scale', () => {
    const columns = [
      { name: 'amount', type: 'numeric', isArray: false, nullable: false, numericPrecision: 10, numericScale: 2, maxLength: null }
    ];
    const sql = buildCreateTableSql('public', 'orders', columns as any);
    expect(sql).toContain('"amount" numeric(10,2) NOT NULL');
  });

  it('should handle varchar length', () => {
    const columns = [
      { name: 'code', type: 'varchar', isArray: false, nullable: true, numericPrecision: null, numericScale: null, maxLength: 50 }
    ];
    const sql = buildCreateTableSql('public', 'codes', columns as any);
    expect(sql).toContain('"code" varchar(50)');
  });

  it('should handle array types', () => {
    const columns = [
      { name: 'tags', type: '_text', isArray: true, nullable: true, numericPrecision: null, numericScale: null, maxLength: null }
    ];
    const sql = buildCreateTableSql('public', 'posts', columns as any);
    expect(sql).toContain('"tags" text[]');
  });
});

describe('lib/crypto - maskCredentials', () => {
  it('should mask postgresql connection string password', () => {
    const input = 'postgresql://user:secret-pass@localhost:5432/mydb';
    const output = maskCredentials(input);
    expect(output).toBe('postgresql://user:****@localhost:5432/mydb');
  });

  it('should mask PGPASSWORD env var', () => {
    const input = 'PGPASSWORD=mysecret bash script.sh';
    const output = maskCredentials(input);
    expect(output).toBe('PGPASSWORD=**** bash script.sh');
  });

  it('should return original string if no credentials found', () => {
    const input = 'Hello World';
    const output = maskCredentials(input);
    expect(output).toBe('Hello World');
  });
});

describe('connection.service - validateSql', () => {
  it('should allow valid SELECT queries', () => {
    expect(() => validateSql('SELECT * FROM users')).not.toThrow();
    expect(() => validateSql('  select id, name from public.data where id > 10 ')).not.toThrow();
  });

  it('should block non-SELECT queries', () => {
    expect(() => validateSql('INSERT INTO users VALUES (1)')).toThrow('Only SELECT statements are allowed');
    expect(() => validateSql('DROP TABLE users')).toThrow('Only SELECT statements are allowed');
  });

  it('should block dangerous keywords', () => {
    expect(() => validateSql('SELECT * FROM users; DROP TABLE accounts')).toThrow('Potentially dangerous keyword detected: DROP');
    expect(() => validateSql('SELECT pg_read_file(\'/etc/passwd\')')).toThrow('Potentially dangerous keyword detected: PG_READ_FILE');
  });
});

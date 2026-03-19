import prisma from '../lib/db';
import { detectSchema, resolveConnForPool, ColumnDef } from './connection.service';
import { ResolvedConnection, getPooledClient } from '../lib/pg-client';

export interface SchemaValidationResult {
  status: 'MATCH' | 'MISMATCH' | 'MISSING_SOURCE_SCHEMA' | 'MISSING_DEST_TABLE' | 'ERROR';
  errors: SchemaValidationError[];
  warnings: string[];
}

export interface SchemaValidationError {
  column: string;
  type: 'MISSING_IN_DEST' | 'TYPE_MISMATCH' | 'NULLABILITY_MISMATCH' | 'EXTRA_IN_DEST';
  expected?: string;
  actual?: string;
}

/**
 * Validates that the destination table schema is compatible with the source model.
 */
export async function validateTruncateSchema(
  modelId: string,
  destConnId: string,
  destSchema: string,
  destName: string
): Promise<SchemaValidationResult> {
  try {
    const model = await prisma.model.findUniqueOrThrow({
      where: { id: modelId }
    });

    const sourceColumns = (model.detectedColumns as unknown as ColumnDef[]) || [];
    if (sourceColumns.length === 0) {
      return { status: 'MISSING_SOURCE_SCHEMA', errors: [], warnings: ['Source model has no detected schema yet.'] };
    }

    // Detect dest schema
    let destDetection;
    try {
      destDetection = await detectSchema(destConnId, { schema: destSchema, table: destName });
    } catch (err) {
      // If table is missing, it's not a mismatch, just a "will be created" state.
      return { 
        status: 'MATCH', 
        errors: [], 
        warnings: [`Destination table "${destSchema}"."${destName}" does not exist and will be automatically created using the model schema.`] 
      };
    }

    const destColumns = destDetection.columns;
    const result: SchemaValidationResult = {
      status: 'MATCH',
      errors: [],
      warnings: []
    };

    const sourceMap = new Map(sourceColumns.map(c => [c.name.toLowerCase(), c]));
    const destMap = new Map(destColumns.map(c => [c.name.toLowerCase(), c]));

    // Check every source column exists in dest
    for (const [name, sCol] of sourceMap) {
      const dCol = destMap.get(name);
      if (!dCol) {
        result.errors.push({
          column: sCol.name,
          type: 'MISSING_IN_DEST'
        });
        continue;
      }

      // Type Check (loose)
      // Normalize types for comparison if needed. For now, basic check.
      const sType = sCol.type.toLowerCase();
      const dType = (dCol.udtName || dCol.type).toLowerCase();
      
      if (!isTypeCompatible(sType, dType)) {
        result.errors.push({
          column: sCol.name,
          type: 'TYPE_MISMATCH',
          expected: sType,
          actual: dType
        });
      }

      // Nullability Check (Warning only, but can be error)
      if (!sCol.nullable && dCol.nullable === true) {
        result.warnings.push(`Column "${sCol.name}" is NOT NULL in source but NULLABLE in destination.`);
      } else if (sCol.nullable && dCol.nullable === false) {
        result.errors.push({
          column: sCol.name,
          type: 'NULLABILITY_MISMATCH',
          expected: 'NULLABLE',
          actual: 'NOT NULL'
        });
      }
    }

    // Check for extra columns in dest (optional, but good to know)
    for (const [name, dCol] of destMap) {
      if (!sourceMap.has(name)) {
        // Legacy airbyte columns can be automatically dropped
        if (name.startsWith('_airbyte')) {
          result.errors.push({
            column: dCol.name,
            type: 'EXTRA_IN_DEST',
            expected: 'DROP (legacy airbyte column)',
            actual: 'present'
          });
        } else if (dCol.nullable === false) {
          result.errors.push({
            column: dCol.name,
            type: 'EXTRA_IN_DEST',
            expected: 'NULLABLE or DEFAULT',
            actual: 'NOT NULL (No Default)'
          });
        } else {
          result.warnings.push(`Destination has extra column "${dCol.name}" which will be ignored.`);
        }
      }
    }

    if (result.errors.length > 0) {
      result.status = 'MISMATCH';
    }

    return result;
  } catch (err: any) {
    console.error('Schema validation error:', err);
    return { status: 'ERROR', errors: [], warnings: [err.message] };
  }
}

function isTypeCompatible(source: string, dest: string): boolean {
  if (source === dest) return true;

  // Normalize PostgreSQL type aliases to their canonical names
  // This prevents false-positive mismatches for types that are binary-identical
  const normalize = (t: string): string => {
    t = t.trim().toLowerCase();
    t = t.replace(/char\(\d+\)/, 'text');
    t = t.replace('character varying', 'varchar');
    
    // Timestamp aliases — all binary identical in PG
    if (t === 'timestamp without time zone') t = 'timestamp';
    if (t === 'timestamp with time zone') t = 'timestamptz';
    
    // Boolean aliases
    if (t === 'bool') t = 'boolean';
    
    // Integer aliases
    if (t === 'int' || t === 'int4') t = 'integer';
    if (t === 'int8') t = 'bigint';
    if (t === 'int2') t = 'smallint';
    if (t === 'float4') t = 'real';
    if (t === 'float8' || t === 'double precision') t = 'float8';

    return t;
  };

  const s = normalize(source);
  const d = normalize(dest);

  if (s === d) return true;

  // Broad compatibility groups (same binary storage)
  // For PostgreSQL BINARY COPY, types must be EXACTly the same or share the same format.
  
  // Text-like types are binary compatible (4-byte length + content)
  const string = ['text', 'varchar', 'bpchar']; 
  if (string.includes(s) && string.includes(d)) return true;

  // JSON -> String compatibility (text serialization)
  const json = ['json', 'jsonb'];
  if (json.includes(s) && string.includes(d)) return true;

  // UUID, JSON, JSONB, and individual numeric types are NOT binary compatible with each other.
  // Integer types (int2, int4, int8) are NOT binary compatible with each other.
  // float4 and float8 are NOT binary compatible with each other.
  
  return false;
}

/**
 * Attempts to automatically fix schema mismatches by running ALTER TABLE statements.
 */
export async function autoFixSchema(
  modelId: string,
  destConnId: string,
  destSchema: string,
  destName: string
): Promise<{ success: boolean; executedSql: string[]; error?: string }> {
  const result = await validateTruncateSchema(modelId, destConnId, destSchema, destName);
  
  if (result.status === 'MATCH' || result.status === 'MISSING_SOURCE_SCHEMA' || result.status === 'MISSING_DEST_TABLE') {
    return { success: true, executedSql: [] };
  }

  if (result.status === 'ERROR') {
    return { success: false, executedSql: [], error: result.warnings[0] || 'Unknown validation error' };
  }

  const model = await prisma.model.findUniqueOrThrow({ where: { id: modelId } });
  const sourceColumns = (model.detectedColumns as unknown as ColumnDef[]) || [];
  const sourceMap = new Map(sourceColumns.map(c => [c.name.toLowerCase(), c]));

  const statements: string[] = [];
  const targetTable = `"${destSchema}"."${destName}"`;

  for (const err of result.errors) {
    const sCol = sourceMap.get(err.column.toLowerCase());

    if (err.type === 'MISSING_IN_DEST') {
      if (!sCol) continue;
      // Get the correct postgres type mapped from our sync system
      let type = sCol.type;
      if (sCol.isArray) {
        if (!type.endsWith('[]')) {
          type = `${type.startsWith('_') ? type.substring(1) : type}[]`;
        }
      }
      
      const lowerCaseType = type.toLowerCase();
      if (lowerCaseType.includes('json')) type = 'jsonb';
      else if (lowerCaseType.includes('geometry')) type = 'geometry';
      else if (lowerCaseType.includes('geography')) type = 'geography';
      
      if (type === 'numeric' && sCol.numericPrecision !== null) {
        type = `numeric(${sCol.numericPrecision},${sCol.numericScale || 0})`;
      } else if (type === 'varchar' && sCol.maxLength !== null) {
        type = `varchar(${sCol.maxLength})`;
      } else if (type === 'bpchar' && sCol.maxLength !== null) {
        type = `char(${sCol.maxLength})`;
      }

      statements.push(`ALTER TABLE ${targetTable} ADD COLUMN "${sCol.name}" ${type} ${sCol.nullable ? '' : 'NOT NULL'}`);
    } 
    else if (err.type === 'NULLABILITY_MISMATCH') {
       statements.push(`ALTER TABLE ${targetTable} ALTER COLUMN "${err.column}" DROP NOT NULL`);
    }
    else if (err.type === 'EXTRA_IN_DEST') {
       if (err.column.toLowerCase().startsWith('_airbyte')) {
         // Drop legacy airbyte columns that are no longer needed
         statements.push(`ALTER TABLE ${targetTable} DROP COLUMN IF EXISTS "${err.column}"`);
       } else {
         // For other extra NOT NULL columns, relax the constraint so COPY can insert NULLs
         statements.push(`ALTER TABLE ${targetTable} ALTER COLUMN "${err.column}" DROP NOT NULL`);
       }
    }
    else if (err.type === 'TYPE_MISMATCH') {
       if (!sCol) continue;
       const expectedType = err.expected || sCol.type;
       statements.push(`ALTER TABLE ${targetTable} ALTER COLUMN "${err.column}" TYPE ${expectedType} USING "${err.column}"::${expectedType}`);
    }
  }

  if (statements.length === 0) {
    return { success: true, executedSql: [] };
  }

  const resolved = await resolveConnForPool(destConnId);
  // ResolvedConnection structure: { host, port, database, user, password, ssl }
  // To check if it is postgres, we look at the original connection.
  const destConn = await prisma.connection.findUnique({ where: { id: destConnId } });
  
  if (destConn?.type !== 'POSTGRES') {
     return { success: false, executedSql: [], error: 'Auto-fix is currently only supported for PostgreSQL destinations.' };
  }

  const client = await getPooledClient(destConnId, resolved);
  
  try {
    await client.query('BEGIN');
    for (const sql of statements) {
      await client.query(sql);
    }
    await client.query('COMMIT');
    return { success: true, executedSql: statements };
  } catch (error: any) {
    await client.query('ROLLBACK');
    return { success: false, executedSql: statements, error: error.message };
  } finally {
    client.release();
  }
}

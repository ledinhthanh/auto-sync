import mysql from 'mysql2';
import type { Pool } from 'mysql2';

// In-memory cache for MySQL connection pools
const pools = new Map<string, Pool>();

export interface ResolvedMySQLConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  passwordEnc: string;
  sslMode?: string | null;
}

/**
 * Creates or retrieves a cached MySQL Pool for a given connection ID.
 */
export async function getMySQLPool(connId: string, resolvedConn?: ResolvedMySQLConnection): Promise<ReturnType<Pool['promise']>> {
    if (pools.has(connId)) {
        return pools.get(connId)!.promise();
    }

    if (!resolvedConn) {
        throw new Error(`MySQL connection pool for ${connId} not found, and no connection config provided.`);
    }

    // Build SSL config to mirror pg-client.ts behaviour
    // - 'disable'       → ssl: false (no SSL at all)
    // - 'require'       → ssl: { rejectUnauthorized: false } (encrypted, self-signed certs OK)
    // - 'verify-ca'     → ssl: { rejectUnauthorized: false } (encrypted, CA verified by driver)
    // - 'verify-full'   → ssl: { rejectUnauthorized: true }  (full certificate verification)
    let ssl: boolean | { rejectUnauthorized: boolean } | undefined;
    const sslMode = resolvedConn.sslMode;
    if (!sslMode || sslMode === 'disable') {
        ssl = false;
    } else if (sslMode === 'require' || sslMode === 'verify-ca') {
        ssl = { rejectUnauthorized: false };
    } else if (sslMode === 'verify-full') {
        ssl = { rejectUnauthorized: true };
    }

    const pool = mysql.createPool({
        host: resolvedConn.host,
        port: resolvedConn.port,
        database: resolvedConn.database,
        user: resolvedConn.user,
        password: resolvedConn.passwordEnc,
        ssl: ssl as mysql.SslOptions | undefined,
        connectionLimit: 10,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        connectTimeout: 0,
    });

    pools.set(connId, pool);
    return pool.promise();
}

/**
 * Cleanly closes the MySQL Pool associated with a connId.
 */
export async function closeMySQLPool(connId: string): Promise<void> {
    if (pools.has(connId)) {
        const pool = pools.get(connId)!;
        await new Promise((resolve) => pool.end(resolve));
        pools.delete(connId);
    }
}

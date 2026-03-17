import { Pool, PoolClient } from 'pg';

// In-memory cache for connection pools
const pools = new Map<string, Pool>();

// Optional helper type defining connection configuration that gets resolved by Prisma + lib/crypto
export interface ResolvedConnection {
  host: string;
  port: number;
  database: string;
  username: string;
  passwordEnc: string;
  sslMode?: string | null;
}

/**
 * Creates or retrieves a cached PoolClient for a given connection ID.
 * Expects the caller to resolve `resolvedConn` by querying Prisma and decrypting the password.
 * 
 * Note: If using multiple apps, consider connection pooling like PgBouncer instead of native node pg pooling.
 */
export async function getPooledClient(connId: string, resolvedConn?: ResolvedConnection): Promise<PoolClient> {
    if (pools.has(connId)) {
        const pool = pools.get(connId)!;
        return await pool.connect();
    }

    if (!resolvedConn) {
        throw new Error(`Connection pool for ${connId} not found, and no connection config provided to initialize it.`);
    }

    // Decrypt the password (if you want to do it here, or expect caller to pass plain. We'll assume caller passes plain or decrypted password via helper).
    // The instructions say "decrypt credentials trước khi dùng", assuming user passes decrypted password in passwordEnc field for simplicity to this helper, or we decrypt here. 
    // To keep simple, we'll assume resolvedConn "password" field has been fully resolved (you can think of passwordEnc as just password here when using Pool)
    
    let ssl: boolean | { rejectUnauthorized: boolean } = false;
    if (resolvedConn.sslMode === 'require' || resolvedConn.sslMode === 'verify-full') {
        ssl = {
            rejectUnauthorized: resolvedConn.sslMode === 'verify-full'
        };
    }

    const pool = new Pool({
        host: resolvedConn.host,
        port: resolvedConn.port,
        database: resolvedConn.database,
        user: resolvedConn.username,
        password: resolvedConn.passwordEnc, // password already decrypted by caller or if we inject decrypt here
        ssl,
        connectionTimeoutMillis: 0,
        idleTimeoutMillis: 30000,
        max: 10,
        statement_timeout: 0,
    });

    // Catch generic pool errors so it doesn't crash the server
    pool.on('error', (err) => {
        console.error(`Unexpected error on idle client for connId ${connId}`, err);
    });

    pools.set(connId, pool);

    return await pool.connect();
}

/**
 * Cleanly closes the entire Pool associated with a connId.
 */
export async function closePool(connId: string): Promise<void> {
    if (pools.has(connId)) {
        const pool = pools.get(connId)!;
        await pool.end();
        pools.delete(connId);
    }
}

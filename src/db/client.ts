import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

let pool: Pool | null = null;
let db: Database | null = null;

export function getPool(): Pool {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL is not set');
        }
        pool = new Pool({ connectionString });
    }
    return pool;
}

export function getDb(): Database {
    if (!db) {
        db = drizzle(getPool(), { schema });
    }
    return db;
}

export async function connectDatabase(): Promise<void> {
    const client = await getPool().connect();
    try {
        await client.query('SELECT 1');
    } finally {
        client.release();
    }
}

export async function isDatabaseHealthy(): Promise<boolean> {
    try {
        const client = await getPool().connect();
        try {
            await client.query('SELECT 1');
            return true;
        } finally {
            client.release();
        }
    } catch {
        return false;
    }
}

export async function closeDatabase(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
        db = null;
    }
}

/**
 * Ensure Postgres schema from SQL files under ./drizzle (idempotent DDL).
 * Structural migrations only.
 */
export async function runMigrations(): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.join(process.cwd(), 'drizzle');
    if (!fs.existsSync(dir)) {
        console.warn(`Migration directory not found at ${dir}; skipping schema ensure`);
        return;
    }
    const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    if (files.length === 0) {
        console.warn(`No .sql files in ${dir}; skipping schema ensure`);
        return;
    }

    const client = await getPool().connect();
    try {
        await client.query(`CREATE TABLE IF NOT EXISTS bot_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
        for (const file of files) {
            const applied = await client.query('SELECT 1 FROM bot_schema_migrations WHERE name = $1', [file]);
            if (applied.rowCount) continue;
            await client.query('BEGIN');
            try {
                await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
                await client.query('INSERT INTO bot_schema_migrations (name) VALUES ($1)', [file]);
                await client.query('COMMIT');
                console.log(`Applied migration (${file})`);
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            }
        }
    } finally {
        client.release();
    }
}

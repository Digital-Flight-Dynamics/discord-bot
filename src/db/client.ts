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
 * Not Mongo→Postgres data import — only structural migrations.
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
        for (const file of files) {
            const sql = fs.readFileSync(path.join(dir, file), 'utf8');
            await client.query(sql);
            console.log(`Schema ensured (${file})`);
        }
    } finally {
        client.release();
    }
}

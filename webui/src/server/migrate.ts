import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const pool = new pg.Pool({ connectionString: databaseUrl });
const migrationsDirectory = join(import.meta.dir, '../../drizzle');

try {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS atc_migrations (
            name text PRIMARY KEY,
            applied_at timestamp with time zone DEFAULT now() NOT NULL
        )
    `);

    const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
        const alreadyApplied = await pool.query('SELECT 1 FROM atc_migrations WHERE name = $1', [file]);
        if (alreadyApplied.rowCount) continue;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(await Bun.file(join(migrationsDirectory, file)).text());
            await client.query('INSERT INTO atc_migrations (name) VALUES ($1)', [file]);
            await client.query('COMMIT');
            console.log(`Applied ${file}`);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
} finally {
    await pool.end();
}

/**
 * Apply SQL migrations in ./drizzle against DATABASE_URL.
 * Usage: DATABASE_URL=... bun run db:migrate
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

dotenv.config();

async function main() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error('DATABASE_URL is required');
        process.exit(1);
    }

    const dir = path.join(process.cwd(), 'drizzle');
    const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

    const pool = new Pool({ connectionString: url });
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS bot_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
        for (const file of files) {
            const applied = await pool.query('SELECT 1 FROM bot_schema_migrations WHERE name = $1', [file]);
            if (applied.rowCount) continue;
            const client = await pool.connect();
            try {
                console.log(`Applying ${file}...`);
                await client.query('BEGIN');
                await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
                await client.query('INSERT INTO bot_schema_migrations (name) VALUES ($1)', [file]);
                await client.query('COMMIT');
                console.log(`  OK ${file}`);
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        }
        console.log('Migrations complete');
    } finally {
        await pool.end();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

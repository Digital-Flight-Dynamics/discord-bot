/**
 * Apply SQL migrations in ./drizzle against DATABASE_URL.
 * Usage: DATABASE_URL=... npx ts-node scripts/run-migrate.ts
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
        for (const file of files) {
            const sql = fs.readFileSync(path.join(dir, file), 'utf8');
            console.log(`Applying ${file}...`);
            await pool.query(sql);
            console.log(`  OK ${file}`);
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

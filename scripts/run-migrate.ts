/**
 * Apply SQL migrations in ./drizzle against DATABASE_URL.
 * Usage: DATABASE_URL=... bun run db:migrate
 */
import dotenv from 'dotenv';
import { closeDatabase, runMigrations } from '../src/db/client';

dotenv.config();

async function main() {
    try {
        await runMigrations();
        console.log('Migrations complete');
    } finally {
        await closeDatabase();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

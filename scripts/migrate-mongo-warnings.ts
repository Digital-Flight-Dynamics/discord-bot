/**
 * OPTIONAL one-shot: legacy Mongo warnings → PostgreSQL.
 * Not used by the bot at runtime (Postgres only). Kept for a possible later data import.
 *
 * Requires the `mongodb` package installed ad-hoc if you run this:
 *   npm i -D mongodb
 *   MONGO_URI=... DATABASE_URL=... GUILD_ID=... npx ts-node scripts/migrate-mongo-warnings.ts
 *   ... --dry-run
 */
import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import { Pool } from 'pg';

dotenv.config();

type MongoWarning = {
    _id: ObjectId | string;
    userId?: string;
    reason?: string;
    moderatorId?: string;
    actionTaken?: string;
    timestamp?: Date | string;
    warnIndex?: number;
};

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const mongoUri = process.env.MONGO_URI || process.env.DATABASE_TOKEN;
    const pgUrl = process.env.DATABASE_URL;
    const guildId = process.env.GUILD_ID;

    if (!mongoUri) {
        console.error('MONGO_URI (or legacy DATABASE_TOKEN) is required');
        process.exit(1);
    }
    if (!pgUrl) {
        console.error('DATABASE_URL is required');
        process.exit(1);
    }
    if (!guildId) {
        console.error('GUILD_ID is required for migrated rows');
        process.exit(1);
    }

    const mongo = new MongoClient(mongoUri);
    const pool = new Pool({ connectionString: pgUrl });

    try {
        await mongo.connect();
        const db = mongo.db();
        const col = db.collection<MongoWarning>('warnings');
        const total = await col.countDocuments();
        console.log(`Found ${total} Mongo warnings`);

        const docs = await col.find({}).toArray();
        let inserted = 0;
        let skipped = 0;
        let failed = 0;

        for (const doc of docs) {
            const legacyId = String(doc._id);
            const userId = doc.userId || 'unknown';
            const moderatorId = doc.moderatorId || null;
            const reason = doc.reason || 'None';
            const privateNote = doc.actionTaken || null;
            const createdAt = doc.timestamp ? new Date(doc.timestamp) : new Date();

            if (dryRun) {
                console.log(`[dry-run] would migrate ${legacyId} user=${userId} reason=${reason}`);
                inserted++;
                continue;
            }

            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                const existing = await client.query('SELECT id FROM warnings WHERE legacy_mongo_id = $1', [legacyId]);
                if (existing.rowCount && existing.rowCount > 0) {
                    await client.query('ROLLBACK');
                    skipped++;
                    continue;
                }

                const subject = await client.query(
                    `INSERT INTO identity_snapshots (discord_user_id, username, display_name, pronouns, bio, urls)
                     VALUES ($1, NULL, NULL, NULL, NULL, '[]'::jsonb)
                     RETURNING id`,
                    [userId],
                );
                const subjectId = subject.rows[0].id;

                let moderatorSnapId: string | null = null;
                if (moderatorId) {
                    const mod = await client.query(
                        `INSERT INTO identity_snapshots (discord_user_id, username, display_name, pronouns, bio, urls)
                         VALUES ($1, NULL, NULL, NULL, NULL, '[]'::jsonb)
                         RETURNING id`,
                        [moderatorId],
                    );
                    moderatorSnapId = mod.rows[0].id;
                }

                await client.query(
                    `INSERT INTO warnings (
                        guild_id, subject_snapshot_id, moderator_snapshot_id, reason, private_note,
                        created_at, legacy_mongo_id
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                    [guildId, subjectId, moderatorSnapId, reason, privateNote, createdAt, legacyId],
                );

                await client.query('COMMIT');
                inserted++;
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`Failed ${legacyId}:`, err);
                failed++;
            } finally {
                client.release();
            }
        }

        console.log(JSON.stringify({ dryRun, total, inserted, skipped, failed }, null, 2));
    } finally {
        await mongo.close().catch(() => undefined);
        await pool.end().catch(() => undefined);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

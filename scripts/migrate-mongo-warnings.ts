/**
 * OPTIONAL one-shot: legacy Mongo warnings → PostgreSQL.
 * Not used by the bot at runtime (Postgres only). Kept for a possible later data import.
 *
 * The `mongodb` package is a development dependency:
 *   MONGO_URI=... DATABASE_URL=... GUILD_ID=... bun scripts/migrate-mongo-warnings.ts
 *   ... --dry-run
 */
import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import { Pool } from 'pg';
import { buildActionIdCandidate } from '../src/lib/actionId';

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

        let inserted = 0;
        let skipped = 0;
        let failed = 0;

        for await (const doc of col.find({}).batchSize(500)) {
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
                    `INSERT INTO identity_snapshots (discord_user_id, username, display_name)
                     VALUES ($1, NULL, NULL)
                     RETURNING id`,
                    [userId],
                );
                const subjectId = subject.rows[0].id;

                let moderatorSnapId: string | null = null;
                if (moderatorId) {
                    const mod = await client.query(
                        `INSERT INTO identity_snapshots (discord_user_id, username, display_name)
                         VALUES ($1, NULL, NULL)
                         RETURNING id`,
                        [moderatorId],
                    );
                    moderatorSnapId = mod.rows[0].id;
                }

                const warning = await client.query(
                    `INSERT INTO warnings (
                        guild_id, subject_snapshot_id, moderator_snapshot_id, reason, private_note,
                        created_at, legacy_mongo_id
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
                     RETURNING id`,
                    [guildId, subjectId, moderatorSnapId, reason, privateNote, createdAt, legacyId],
                );
                const warningId = warning.rows[0].id as string;
                let actionId: string | null = null;
                for (let attempt = 0; attempt < 32 && !actionId; attempt++) {
                    const candidate = buildActionIdCandidate('warning', createdAt);
                    const reserved = await client.query(
                        `INSERT INTO action_ids (action_id, record_type, record_uuid, guild_id)
                         VALUES ($1, 'warning', $2, $3)
                         ON CONFLICT DO NOTHING RETURNING action_id`,
                        [candidate, warningId, guildId],
                    );
                    if (reserved.rowCount) actionId = candidate;
                }
                if (!actionId) throw new Error(`Failed to allocate an action ID for ${legacyId}`);
                await client.query('UPDATE warnings SET action_id = $1 WHERE id = $2', [actionId, warningId]);

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

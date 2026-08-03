import pg from 'pg';
import { config } from './config';
import type { AppealAnswers, AppealStatus, PublicAction, PublicAppealSummary } from './domain';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export type ModerationPreset = {
    id: string;
    name: string;
    reason: string;
    durationMs: number | null;
    durationToken: string | null;
};

export async function listModerationPresets(): Promise<ModerationPreset[]> {
    const result = await pool.query<{
        id: string;
        name: string;
        reason: string;
        duration_ms: string | number | null;
        duration_token: string | null;
    }>(
        `SELECT id, name, reason, duration_ms, duration_token
           FROM moderation_presets
          WHERE guild_id = $1
          ORDER BY lower(name), name`,
        [config.discordGuildId],
    );
    return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        reason: row.reason,
        durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
        durationToken: row.duration_token,
    }));
}

export const managedBotSettingDefinitions = [
    {
        key: 'weather.avwx_api_key',
        category: 'Weather integrations',
        label: 'AVWX API key',
        description: 'Used by the .metar and .taf commands to retrieve aviation weather reports.',
        help: 'Paste a new key to replace the saved credential. Existing secrets are never returned to the browser.',
        maxLength: 512,
    },
] as const;

export type ManagedBotSettingKey = (typeof managedBotSettingDefinitions)[number]['key'];

export type ManagedBotSetting = {
    key: ManagedBotSettingKey;
    category: string;
    label: string;
    description: string;
    help: string;
    configured: boolean;
    maskedValue: string | null;
    updatedAt: string | null;
};

function maskSettingValue(value: string): string {
    return `••••••••${value.slice(-4)}`;
}

export async function listManagedBotSettings(guildId = config.discordGuildId): Promise<ManagedBotSetting[]> {
    const keys = managedBotSettingDefinitions.map((definition) => definition.key);
    const result = await pool.query<{
        setting_key: ManagedBotSettingKey;
        setting_value: string;
        updated_at: Date;
    }>(
        `SELECT setting_key, setting_value, updated_at
           FROM bot_settings
          WHERE guild_id = $1 AND setting_key = ANY($2::text[])`,
        [guildId, keys],
    );
    const stored = new Map(result.rows.map((row) => [row.setting_key, row]));
    return managedBotSettingDefinitions.map((definition) => {
        const row = stored.get(definition.key);
        const value = row?.setting_value.trim() || '';
        return {
            ...definition,
            configured: Boolean(value),
            maskedValue: value ? maskSettingValue(value) : null,
            updatedAt: row?.updated_at.toISOString() || null,
        };
    });
}

export type ManagedBotSettingUpdate = {
    value?: string;
    clear?: boolean;
};

export async function updateManagedBotSettings(
    updates: Partial<Record<ManagedBotSettingKey, ManagedBotSettingUpdate>>,
    updatedByDiscordUserId: string,
    guildId = config.discordGuildId,
): Promise<ManagedBotSetting[]> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const [key, update] of Object.entries(updates) as Array<[ManagedBotSettingKey, ManagedBotSettingUpdate | undefined]>) {
            if (!update) continue;
            const definition = managedBotSettingDefinitions.find((item) => item.key === key);
            if (!definition) throw new Error(`Unsupported bot setting: ${key}`);
            if (update.clear) {
                await client.query(
                    `INSERT INTO bot_settings (guild_id, setting_key, setting_value, updated_at, updated_by_discord_user_id)
                     VALUES ($1, $2, '', now(), $3)
                     ON CONFLICT (guild_id, setting_key)
                     DO UPDATE SET setting_value = '',
                                   updated_at = now(),
                                   updated_by_discord_user_id = EXCLUDED.updated_by_discord_user_id`,
                    [guildId, key, updatedByDiscordUserId],
                );
                continue;
            }
            if (typeof update.value !== 'string') continue;
            const value = update.value.trim();
            if (!value) continue;
            if (value.length > definition.maxLength) throw new Error(`${definition.label} is too long.`);
            await client.query(
                `INSERT INTO bot_settings (guild_id, setting_key, setting_value, updated_at, updated_by_discord_user_id)
                 VALUES ($1, $2, $3, now(), $4)
                 ON CONFLICT (guild_id, setting_key)
                 DO UPDATE SET setting_value = EXCLUDED.setting_value,
                               updated_at = now(),
                               updated_by_discord_user_id = EXCLUDED.updated_by_discord_user_id`,
                [guildId, key, value, updatedByDiscordUserId],
            );
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
    return listManagedBotSettings(guildId);
}

type ActionRow = {
    action_id: string;
    kind: PublicAction['kind'];
    reason: string;
    private_note: string | null;
    created_at: Date;
    expires_at: Date | null;
    duration_ms: string | number | null;
    resolution_status: string | null;
    resolution_public_note: string | null;
    ended_at: Date | null;
    appeal_id: string | null;
    appeal_status: AppealStatus | null;
    appeal_submitted_at: Date | null;
    appeal_decided_at: Date | null;
    discord_user_id?: string;
    username?: string | null;
    display_name?: string | null;
    moderator_user_id?: string | null;
    moderator_username?: string | null;
    moderator_display_name?: string | null;
};

const actionsCte = `
    WITH actions AS (
        SELECT w.action_id, 'warning'::text AS kind, w.reason, w.private_note, w.created_at,
               w.record_expires_at AS expires_at,
               NULL::bigint AS duration_ms, NULL::text AS duration_token,
               w.resolution_status, w.resolution_public_note,
               w.removed_at AS ended_at, s.discord_user_id, s.username, s.display_name,
               w.moderator_snapshot_id, w.guild_id
          FROM warnings w
          JOIN identity_snapshots s ON s.id = w.subject_snapshot_id
        UNION ALL
        SELECT k.action_id, 'kick', k.reason, k.private_note, k.created_at, k.record_expires_at, NULL::bigint, NULL::text,
               k.resolution_status, k.resolution_public_note, k.resolved_at,
               s.discord_user_id, s.username, s.display_name, k.moderator_snapshot_id, k.guild_id
          FROM kicks k
          JOIN identity_snapshots s ON s.id = k.subject_snapshot_id
        UNION ALL
        SELECT b.action_id, 'ban', b.reason, b.private_notes,
               b.created_at,
               b.record_expires_at AS expires_at,
               b.duration_ms, b.duration_token,
               b.resolution_status, b.resolution_public_note, b.lifted_at,
               s.discord_user_id, s.username, s.display_name, b.moderator_snapshot_id, b.guild_id
          FROM bans b
          JOIN identity_snapshots s ON s.id = b.subject_snapshot_id
        UNION ALL
        SELECT t.action_id, 'timeout', t.reason, t.private_note, t.created_at,
               t.record_expires_at AS expires_at, t.duration_ms, t.duration_token,
               t.resolution_status, t.resolution_public_note, t.resolved_at,
               s.discord_user_id, s.username, s.display_name, t.moderator_snapshot_id, t.guild_id
          FROM timeouts t
          JOIN identity_snapshots s ON s.id = t.subject_snapshot_id
    )
`;

const actionSelect = `
    ${actionsCte}
    SELECT a.action_id, a.kind, a.reason, a.private_note, a.created_at, a.expires_at, a.duration_ms,
           a.resolution_status, a.resolution_public_note, a.ended_at,
           a.discord_user_id, a.username, a.display_name,
           moderator.discord_user_id AS moderator_user_id,
           moderator.username AS moderator_username,
           moderator.display_name AS moderator_display_name,
           appeal.id AS appeal_id, appeal.status AS appeal_status,
           appeal.submitted_at AS appeal_submitted_at,
           appeal.decided_at AS appeal_decided_at
      FROM actions a
      LEFT JOIN identity_snapshots moderator ON moderator.id = a.moderator_snapshot_id
      LEFT JOIN LATERAL (
          SELECT id, status, submitted_at, decided_at
            FROM atc_appeals
           WHERE guild_id = a.guild_id
             AND action_id = a.action_id
             AND discord_user_id = a.discord_user_id
           ORDER BY submitted_at DESC
           LIMIT 1
      ) appeal ON true
`;

const actionQuery = `
    ${actionSelect}
     WHERE a.discord_user_id = $1
       AND a.guild_id = $2
       AND a.action_id IS NOT NULL
       AND (a.expires_at IS NULL OR a.expires_at > now())
`;

function mapAction(row: ActionRow): PublicAction {
    return {
        actionId: row.action_id,
        kind: row.kind,
        reason: row.reason,
        createdAt: row.created_at.toISOString(),
        expiresAt: row.expires_at?.toISOString() ?? null,
        durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
        resolutionStatus: row.resolution_status,
        resolutionPublicNote: row.resolution_public_note,
        endedAt: row.ended_at?.toISOString() ?? null,
        appealId: row.appeal_id,
        appealStatus: row.appeal_status,
        appealSubmittedAt: row.appeal_submitted_at?.toISOString() ?? null,
        appealDecidedAt: row.appeal_decided_at?.toISOString() ?? null,
    };
}

export async function listActionsForUser(discordUserId: string): Promise<PublicAction[]> {
    const result = await pool.query<ActionRow>(`${actionQuery} ORDER BY a.created_at DESC`, [discordUserId, config.discordGuildId]);
    return result.rows.map(mapAction);
}

export async function findActionForUser(discordUserId: string, actionId: string): Promise<PublicAction | null> {
    const result = await pool.query<ActionRow>(`${actionQuery} AND regexp_replace(upper(a.action_id), '[^A-Z0-9]', '', 'g') = regexp_replace(upper($3), '[^A-Z0-9]', '', 'g') LIMIT 1`, [
        discordUserId,
        config.discordGuildId,
        actionId,
    ]);
    return result.rows[0] ? mapAction(result.rows[0]) : null;
}

export async function listAppealsForUserAction(
    discordUserId: string,
    actionId: string,
): Promise<PublicAppealSummary[]> {
    const result = await pool.query<{
        id: string;
        status: AppealStatus;
        submitted_at: Date;
        review_started_at: Date | null;
        decided_at: Date | null;
    }>(
        `SELECT id, status, submitted_at, review_started_at, decided_at
           FROM atc_appeals
          WHERE discord_user_id = $1
            AND guild_id = $2
            AND upper(action_id) = upper($3)
          ORDER BY submitted_at DESC`,
        [discordUserId, config.discordGuildId, actionId],
    );
    return result.rows.map((row) => ({
        id: row.id,
        status: row.status,
        submittedAt: row.submitted_at.toISOString(),
        reviewStartedAt: row.review_started_at?.toISOString() ?? null,
        decidedAt: row.decided_at?.toISOString() ?? null,
    }));
}

export type ModeratorAction = PublicAction & {
    subjectUserId: string;
    subjectUsername: string | null;
    subjectDisplayName: string | null;
    privateNote: string | null;
    moderatorUserId: string | null;
    moderatorUsername: string | null;
    moderatorDisplayName: string | null;
    modLogUrl: string | null;
    modThreadUrl: string | null;
    activityCount: number;
    latestActivity: { label: string; at: string } | null;
};

export type Paginated<T> = {
    items: T[];
    total: number;
    page: number;
    limit: 10 | 25;
    pages: number;
};

export type ModeratorAppeal = {
    id: string;
    actionId: string;
    kind: PublicAction['kind'];
    status: AppealStatus;
    submittedAt: string;
    reviewStartedAt: string | null;
    decidedAt: string | null;
    subjectUserId: string;
    subjectUsername: string | null;
    subjectDisplayName: string | null;
};

export type ModerationAuditEntry = {
    id: string;
    actionId: string;
    actionKind: PublicAction['kind'];
    activity: string;
    details: string;
    moderatorUserId: string | null;
    moderatorUsername: string | null;
    moderatorDisplayName: string | null;
    subjectUserId: string;
    subjectUsername: string | null;
    subjectDisplayName: string | null;
    createdAt: string;
};

type ActionActivityRow = {
    action_id: string;
    change_type: string;
    created_at: Date;
};

function mapModeratorAction(
    row: ActionRow,
    activities: Map<string, ActionActivityRow[]>,
    modLogs: Map<string, { channel_id: string; message_id: string; thread_id: string | null }>,
): ModeratorAction {
    const actionActivities = activities.get(row.action_id) || [];
    const modLog = modLogs.get(row.action_id);
    return {
        ...mapAction(row),
        subjectUserId: row.discord_user_id || '',
        subjectUsername: row.username || null,
        subjectDisplayName: row.display_name || null,
        privateNote: row.private_note,
        moderatorUserId: row.moderator_user_id || null,
        moderatorUsername: row.moderator_username || null,
        moderatorDisplayName: row.moderator_display_name || null,
        modLogUrl: modLog
            ? `https://discord.com/channels/${config.discordGuildId}/${modLog.channel_id}/${modLog.message_id}`
            : null,
        modThreadUrl: modLog?.thread_id
            ? `https://discord.com/channels/${config.discordGuildId}/${modLog.thread_id}`
            : null,
        activityCount: actionActivities.length,
        latestActivity: actionActivities[0]
            ? { label: actionActivities[0].change_type, at: actionActivities[0].created_at.toISOString() }
            : null,
    };
}

async function attachModeratorActivity(rows: ActionRow[]): Promise<ModeratorAction[]> {
    const actionIds = rows.map((row) => row.action_id);
    if (!actionIds.length) return [];
    const [auditResult, modLogResult] = await Promise.all([
        pool.query<ActionActivityRow>(
            `SELECT action_id, change_type, created_at
               FROM (
                   SELECT action_id, change_type, created_at
                     FROM moderation_action_audits
                    WHERE guild_id = $1 AND action_id = ANY($2::text[])
                   UNION ALL
                   SELECT action_id, 'Appeal submitted', submitted_at
                     FROM atc_appeals
                    WHERE guild_id = $1 AND action_id = ANY($2::text[])
                   UNION ALL
                   SELECT action_id, 'Appeal entered review', review_started_at
                     FROM atc_appeals
                    WHERE guild_id = $1 AND action_id = ANY($2::text[]) AND review_started_at IS NOT NULL
                   UNION ALL
                   SELECT action_id,
                          CASE status WHEN 'approved' THEN 'Appeal approved' ELSE 'Appeal denied' END,
                          decided_at
                     FROM atc_appeals
                    WHERE guild_id = $1
                      AND action_id = ANY($2::text[])
                      AND status IN ('approved', 'denied')
                      AND decided_at IS NOT NULL
               ) activity
              ORDER BY created_at DESC`,
            [config.discordGuildId, actionIds],
        ),
        pool.query<{ action_id: string; channel_id: string; message_id: string; thread_id: string | null }>(
            `SELECT action_id, channel_id, message_id, thread_id
               FROM mod_log_messages
              WHERE guild_id = $1 AND action_id = ANY($2::text[]) AND message_deleted = false AND thread_deleted = false`,
            [config.discordGuildId, actionIds],
        ),
    ]);
    const activities = new Map<string, ActionActivityRow[]>();
    for (const activity of auditResult.rows) {
        const list = activities.get(activity.action_id) || [];
        list.push(activity);
        activities.set(activity.action_id, list);
    }
    const modLogs = new Map(modLogResult.rows.map((row) => [row.action_id, row]));
    return rows.map((row) => mapModeratorAction(row, activities, modLogs));
}

export async function getModerationDashboard() {
    const [metrics, latest] = await Promise.all([
        pool.query<{
            total_actions: string;
            actions_30d: string;
            users_30d: string;
            open_appeals: string;
        }>(
            `${actionsCte}
             SELECT
                 count(*) FILTER (WHERE guild_id = $1 AND action_id IS NOT NULL) AS total_actions,
                 count(*) FILTER (WHERE guild_id = $1 AND action_id IS NOT NULL AND created_at >= now() - interval '30 days') AS actions_30d,
                 count(DISTINCT discord_user_id) FILTER (WHERE guild_id = $1 AND action_id IS NOT NULL AND created_at >= now() - interval '30 days') AS users_30d,
                 (SELECT count(*) FROM atc_appeals WHERE guild_id = $1 AND status IN ('submitted', 'review')) AS open_appeals
               FROM actions`,
            [config.discordGuildId],
        ),
        pool.query<ActionRow>(
            `${actionSelect}
             WHERE a.guild_id = $1 AND a.action_id IS NOT NULL
             ORDER BY a.created_at DESC
             LIMIT 8`,
            [config.discordGuildId],
        ),
    ]);
    const row = metrics.rows[0]!;
    return {
        metrics: {
            totalActions: Number(row.total_actions),
            actions30d: Number(row.actions_30d),
            users30d: Number(row.users_30d),
            openAppeals: Number(row.open_appeals),
        },
        latestActions: await attachModeratorActivity(latest.rows),
    };
}

export async function searchModerationUsers(query: string) {
    const normalized = query.trim();
    if (normalized.length < 2) return [];
    const exactId = /^\d{17,20}$/.test(normalized);
    const result = await pool.query<{
        discord_user_id: string;
        username: string | null;
        display_name: string | null;
        action_count: string;
        latest_action_at: Date | null;
    }>(
        `${actionsCte}
         SELECT discord_user_id,
                max(username) FILTER (WHERE username IS NOT NULL) AS username,
                max(display_name) FILTER (WHERE display_name IS NOT NULL) AS display_name,
                count(*) AS action_count,
                max(created_at) AS latest_action_at
           FROM actions
          WHERE guild_id = $1
            AND action_id IS NOT NULL
            AND (${exactId ? 'discord_user_id = $2' : "username ILIKE $2 OR display_name ILIKE $2"})
          GROUP BY discord_user_id
          ORDER BY latest_action_at DESC
          LIMIT 20`,
        [config.discordGuildId, exactId ? normalized : `%${normalized}%`],
    );
    return result.rows.map((row) => ({
        id: row.discord_user_id,
        username: row.username,
        displayName: row.display_name,
        actionCount: Number(row.action_count),
        latestActionAt: row.latest_action_at?.toISOString() || null,
    }));
}

export async function searchModerationActions(query = '', page = 1, limit: 10 | 25 = 10): Promise<Paginated<ModeratorAction>> {
    const normalized = query.trim();
    const offset = (page - 1) * limit;
    const where = `
        a.guild_id = $1
        AND a.action_id IS NOT NULL
        AND ($2 = '' OR a.action_id ILIKE $3 OR a.reason ILIKE $3 OR a.username ILIKE $3 OR a.display_name ILIKE $3 OR a.discord_user_id = $2)
    `;
    const [result, countResult] = await Promise.all([
        pool.query<ActionRow>(
            `${actionSelect}
             WHERE ${where}
             ORDER BY a.created_at DESC
             LIMIT $4 OFFSET $5`,
            [config.discordGuildId, normalized, `%${normalized}%`, limit, offset],
        ),
        pool.query<{ count: string }>(
            `${actionsCte}
             SELECT count(*) AS count
               FROM actions a
              WHERE ${where}`,
            [config.discordGuildId, normalized, `%${normalized}%`],
        ),
    ]);
    const total = Number(countResult.rows[0]?.count || 0);
    return {
        items: await attachModeratorActivity(result.rows),
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function searchModerationAppeals(query = '', status = '', page = 1, limit: 10 | 25 = 10): Promise<Paginated<ModeratorAppeal>> {
    const normalized = query.trim();
    const normalizedStatus = ['submitted', 'review', 'approved', 'denied'].includes(status) ? status : '';
    const offset = (page - 1) * limit;
    const where = `a.guild_id = $1 AND a.action_id IS NOT NULL
        AND ($2 = '' OR ap.id::text ILIKE $3 OR a.action_id ILIKE $3 OR a.username ILIKE $3 OR a.display_name ILIKE $3 OR a.discord_user_id = $2)
        AND ($4 = '' OR ap.status = $4)`;
    const select = `${actionsCte}
        SELECT ap.id, ap.status, ap.submitted_at, ap.review_started_at, ap.decided_at,
               a.action_id, a.kind, a.discord_user_id AS subject_user_id,
               a.username, a.display_name
          FROM actions a
          JOIN atc_appeals ap ON a.guild_id = ap.guild_id AND upper(a.action_id) = upper(ap.action_id)`;
    const params = [config.discordGuildId, normalized, `%${normalized}%`, normalizedStatus];
    const [result, countResult] = await Promise.all([
        pool.query(select + ` WHERE ${where} ORDER BY ap.submitted_at DESC LIMIT $5 OFFSET $6`, [...params, limit, offset]),
        pool.query(`${actionsCte} SELECT count(*) AS count FROM actions a JOIN atc_appeals ap ON a.guild_id = ap.guild_id AND upper(a.action_id) = upper(ap.action_id) WHERE ${where}`, params),
    ]);
    const total = Number(countResult.rows[0]?.count || 0);
    return {
        items: result.rows.map((row) => ({
            id: row.id, actionId: row.action_id, kind: row.kind, status: row.status,
            submittedAt: row.submitted_at.toISOString(), reviewStartedAt: row.review_started_at?.toISOString() || null,
            decidedAt: row.decided_at?.toISOString() || null, subjectUserId: row.subject_user_id,
            subjectUsername: row.username, subjectDisplayName: row.display_name,
        })),
        total, page, limit, pages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function getAppealDetail(appealId: string) {
    const result = await pool.query<{
        id: string; status: AppealStatus; submitted_at: Date; review_started_at: Date | null; decided_at: Date | null;
        answers: Record<string, string>; discord_user_id: string; action_id: string; kind: PublicAction['kind'];
        username: string | null; display_name: string | null;
    }>(`${actionsCte}
        SELECT ap.id, ap.status, ap.submitted_at, ap.review_started_at, ap.decided_at, ap.answers,
               ap.discord_user_id, a.action_id, a.kind, a.username, a.display_name
          FROM atc_appeals ap JOIN actions a ON a.guild_id = ap.guild_id AND upper(a.action_id) = upper(ap.action_id)
         WHERE ap.guild_id = $1 AND ap.id = $2 LIMIT 1`, [config.discordGuildId, appealId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
        id: row.id, status: row.status, submittedAt: row.submitted_at.toISOString(),
        reviewStartedAt: row.review_started_at?.toISOString() || null, decidedAt: row.decided_at?.toISOString() || null,
        answers: row.answers, discordUserId: row.discord_user_id, actionId: row.action_id, kind: row.kind,
        subjectUsername: row.username, subjectDisplayName: row.display_name,
    };
}

export async function listModeratorActionsForUser(discordUserId: string): Promise<ModeratorAction[]> {
    const result = await pool.query<ActionRow>(
        `${actionSelect}
         WHERE a.guild_id = $1
           AND a.discord_user_id = $2
           AND a.action_id IS NOT NULL
         ORDER BY a.created_at DESC`,
        [config.discordGuildId, discordUserId],
    );
    return attachModeratorActivity(result.rows);
}

export async function getModerationAction(actionId: string) {
    const result = await pool.query<ActionRow>(
        `${actionSelect}
         WHERE a.guild_id = $1 AND regexp_replace(upper(a.action_id), '[^A-Z0-9]', '', 'g') = regexp_replace(upper($2), '[^A-Z0-9]', '', 'g')
         LIMIT 1`,
        [config.discordGuildId, actionId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const [action] = await attachModeratorActivity([row]);
    const [audits, appeals] = await Promise.all([
        pool.query<{
            id: string;
            change_type: string;
            old_value: string | null;
            new_value: string | null;
            rationale: string;
            moderator_user_id: string;
            created_at: Date;
        }>(
            `SELECT id, change_type, old_value, new_value, rationale, moderator_user_id, created_at
               FROM moderation_action_audits
              WHERE guild_id = $1 AND action_id = $2
              ORDER BY created_at DESC`,
            [config.discordGuildId, row.action_id],
        ),
        listAppealsForUserAction(row.discord_user_id || '', row.action_id),
    ]);
    return {
        action,
        audits: audits.rows.map((audit) => ({
            id: audit.id,
            label: audit.change_type,
            oldValue: audit.old_value,
            newValue: audit.new_value,
            rationale: audit.rationale,
            moderatorUserId: audit.moderator_user_id,
            createdAt: audit.created_at.toISOString(),
        })),
        appeals,
    };
}

export async function listModerationLogs(page = 1, limit: 10 | 25 = 10): Promise<Paginated<ModerationAuditEntry>> {
    const offset = (page - 1) * limit;
    const result = await pool.query<{
        id: string;
        action_id: string;
        action_kind: PublicAction['kind'];
        activity: string;
        details: string;
        moderator_user_id: string | null;
        moderator_username: string | null;
        moderator_display_name: string | null;
        subject_user_id: string;
        subject_username: string | null;
        subject_display_name: string | null;
        created_at: Date;
        total_count: string;
    }>(
        `${actionsCte},
         audit_entries AS (
             SELECT 'created:' || a.action_id AS id,
                    a.guild_id,
                    a.action_id,
                    a.kind AS action_kind,
                    'Issued ' || CASE a.kind WHEN 'warning' THEN 'warning' WHEN 'timeout' THEN 'timeout' ELSE a.kind END AS activity,
                    a.reason AS details,
                    a.moderator_snapshot_id,
                    NULL::text AS moderator_user_id,
                    a.discord_user_id AS subject_user_id,
                    a.username AS subject_username,
                    a.display_name AS subject_display_name,
                    a.created_at
               FROM actions a
              WHERE a.action_id IS NOT NULL
             UNION ALL
             SELECT audit.id::text,
                    audit.guild_id,
                    audit.action_id,
                    a.kind,
                    audit.change_type,
                    audit.rationale,
                    audit.moderator_snapshot_id,
                    audit.moderator_user_id,
                    a.discord_user_id,
                    a.username,
                    a.display_name,
                    audit.created_at
               FROM moderation_action_audits audit
               JOIN actions a ON a.guild_id = audit.guild_id AND a.action_id = audit.action_id
         )
         SELECT entry.id,
                entry.action_id,
                entry.action_kind,
                entry.activity,
                entry.details,
                coalesce(moderator.discord_user_id, entry.moderator_user_id) AS moderator_user_id,
                moderator.username AS moderator_username,
                moderator.display_name AS moderator_display_name,
                entry.subject_user_id,
                entry.subject_username,
                entry.subject_display_name,
                entry.created_at,
                count(*) OVER() AS total_count
           FROM audit_entries entry
           LEFT JOIN identity_snapshots moderator ON moderator.id = entry.moderator_snapshot_id
          WHERE entry.guild_id = $1
          ORDER BY entry.created_at DESC
          LIMIT $2 OFFSET $3`,
        [config.discordGuildId, limit, offset],
    );
    const total = Number(result.rows[0]?.total_count || 0);
    return {
        items: result.rows.map((row) => ({
            id: row.id,
            actionId: row.action_id,
            actionKind: row.action_kind,
            activity: row.activity,
            details: row.details,
            moderatorUserId: row.moderator_user_id,
            moderatorUsername: row.moderator_username,
            moderatorDisplayName: row.moderator_display_name,
            subjectUserId: row.subject_user_id,
            subjectUsername: row.subject_username,
            subjectDisplayName: row.subject_display_name,
            createdAt: row.created_at.toISOString(),
        })),
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
    };
}

export type SessionUser = {
    id: string;
    username: string;
    globalName: string | null;
    avatarHash: string | null;
};

export async function createOauthState(input: {
    stateHash: string;
    browserHash: string;
    codeVerifier: string;
    returnTo: string;
    expiresAt: Date;
}): Promise<void> {
    await pool.query(
        `INSERT INTO atc_oauth_states (state_hash, browser_hash, code_verifier, return_to, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [input.stateHash, input.browserHash, input.codeVerifier, input.returnTo, input.expiresAt],
    );
}

export async function consumeOauthState(
    stateHash: string,
    browserHash: string,
): Promise<{ codeVerifier: string; returnTo: string } | null> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query<{ code_verifier: string; return_to: string }>(
            `DELETE FROM atc_oauth_states
              WHERE state_hash = $1 AND browser_hash = $2 AND expires_at > now()
          RETURNING code_verifier, return_to`,
            [stateHash, browserHash],
        );
        await client.query('COMMIT');
        return result.rows[0] ? { codeVerifier: result.rows[0].code_verifier, returnTo: result.rows[0].return_to } : null;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function createSession(tokenHash: string, user: SessionUser, expiresAt: Date): Promise<void> {
    await pool.query(
        `INSERT INTO atc_sessions
            (token_hash, discord_user_id, username, global_name, avatar_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tokenHash, user.id, user.username, user.globalName, user.avatarHash, expiresAt],
    );
}

export async function findSession(tokenHash: string): Promise<SessionUser | null> {
    const result = await pool.query<{
        discord_user_id: string;
        username: string;
        global_name: string | null;
        avatar_hash: string | null;
    }>(
        `SELECT discord_user_id, username, global_name, avatar_hash
           FROM atc_sessions
          WHERE token_hash = $1 AND expires_at > now()`,
        [tokenHash],
    );
    const row = result.rows[0];
    return row ? { id: row.discord_user_id, username: row.username, globalName: row.global_name, avatarHash: row.avatar_hash } : null;
}

export async function cleanupExpiredAtcData(): Promise<void> {
    await Promise.all([
        pool.query('DELETE FROM atc_oauth_states WHERE expires_at <= now()'),
        pool.query('DELETE FROM atc_sessions WHERE expires_at <= now()'),
        pool.query('DELETE FROM atc_appeal_windows WHERE expires_at <= now()'),
    ]);
}

export async function deleteSession(tokenHash: string): Promise<void> {
    await pool.query('DELETE FROM atc_sessions WHERE token_hash = $1', [tokenHash]);
}

export async function createAppealWindow(input: {
    sessionHash: string;
    discordUserId: string;
    actionId: string;
    mathPrompt: string;
    mathAnswer: string;
}): Promise<{ id: string; openedAt: Date }> {
    const result = await pool.query<{ id: string; opened_at: Date }>(
        `INSERT INTO atc_appeal_windows
            (session_hash, discord_user_id, action_id, expires_at, math_prompt, math_answer)
         VALUES ($1, $2, $3, now() + interval '30 minutes', $4, $5)
         RETURNING id, opened_at`,
        [input.sessionHash, input.discordUserId, input.actionId, input.mathPrompt, input.mathAnswer],
    );
    return { id: result.rows[0]!.id, openedAt: result.rows[0]!.opened_at };
}

type AppealWindowRow = {
    id: string;
    opened_at: Date;
    math_answer: string;
    answers: AppealAnswers | null;
    prepared_at: Date | null;
    consumed_at: Date | null;
};

export async function findAppealWindow(id: string, sessionHash: string, discordUserId: string, actionId: string) {
    const result = await pool.query<AppealWindowRow>(
        `SELECT id, opened_at, math_answer, answers, prepared_at, consumed_at
           FROM atc_appeal_windows
          WHERE id = $1 AND session_hash = $2 AND discord_user_id = $3
            AND upper(action_id) = upper($4) AND expires_at > now()`,
        [id, sessionHash, discordUserId, actionId],
    );
    return result.rows[0] ?? null;
}

export async function prepareAppealWindow(input: {
    id: string;
    answers: AppealAnswers;
}): Promise<void> {
    await pool.query(
        `UPDATE atc_appeal_windows
            SET answers = $2, prepared_at = now()
          WHERE id = $1 AND consumed_at IS NULL`,
        [input.id, JSON.stringify(input.answers)],
    );
}

export async function submitAppeal(input: {
    windowId: string;
    sessionHash: string;
    discordUserId: string;
    actionId: string;
    answers: AppealAnswers;
}): Promise<{ id: string; submittedAt: string }> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const consumed = await client.query(
            `UPDATE atc_appeal_windows
                SET consumed_at = now()
              WHERE id = $1 AND session_hash = $2 AND discord_user_id = $3
                AND upper(action_id) = upper($4) AND consumed_at IS NULL
          RETURNING id`,
            [input.windowId, input.sessionHash, input.discordUserId, input.actionId],
        );
        if (!consumed.rowCount) throw new Error('Appeal window is no longer valid.');

        const result = await client.query<{ id: string; submitted_at: Date }>(
            `INSERT INTO atc_appeals (action_id, guild_id, discord_user_id, answers)
             VALUES ($1, $2, $3, $4)
             RETURNING id, submitted_at`,
            [input.actionId, config.discordGuildId, input.discordUserId, JSON.stringify(input.answers)],
        );
        await client.query('COMMIT');
        return { id: result.rows[0]!.id, submittedAt: result.rows[0]!.submitted_at.toISOString() };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export type PublicAppeal = {
    id: string;
    actionId: string;
    status: AppealStatus;
    answers: AppealAnswers;
    submittedAt: string;
    reviewStartedAt: string | null;
    decidedAt: string | null;
    decisionNote: string | null;
};

export async function findAppealForUser(discordUserId: string, actionId: string, appealId: string): Promise<PublicAppeal | null> {
    const result = await pool.query<{
        id: string;
        action_id: string;
        status: AppealStatus;
        answers: AppealAnswers;
        submitted_at: Date;
        review_started_at: Date | null;
        decided_at: Date | null;
        decision_note: string | null;
    }>(
        `SELECT id, action_id, status, answers, submitted_at, review_started_at, decided_at, decision_note
           FROM atc_appeals
          WHERE id = $1 AND upper(action_id) = upper($2) AND discord_user_id = $3`,
        [appealId, actionId, discordUserId],
    );
    const row = result.rows[0];
    return row
        ? {
              id: row.id,
              actionId: row.action_id,
              status: row.status,
              answers: row.answers,
              submittedAt: row.submitted_at.toISOString(),
              reviewStartedAt: row.review_started_at?.toISOString() ?? null,
              decidedAt: row.decided_at?.toISOString() ?? null,
              decisionNote: row.decision_note,
          }
        : null;
}

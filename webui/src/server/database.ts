import pg from 'pg';
import { config } from './config';
import type { AppealAnswers, AppealStatus, PublicAction, PublicAppealSummary } from './domain';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

type ActionRow = {
    action_id: string;
    kind: PublicAction['kind'];
    reason: string;
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
};

const actionQuery = `
    WITH actions AS (
        SELECT w.action_id, 'warning'::text AS kind, w.reason, w.created_at, w.expires_at,
               NULL::bigint AS duration_ms, w.resolution_status, w.resolution_public_note,
               w.removed_at AS ended_at, s.discord_user_id, w.guild_id
          FROM warnings w
          JOIN identity_snapshots s ON s.id = w.subject_snapshot_id
        UNION ALL
        SELECT k.action_id, 'kick', k.reason, k.created_at, NULL, NULL,
               k.resolution_status, k.resolution_public_note, k.resolved_at,
               s.discord_user_id, k.guild_id
          FROM kicks k
          JOIN identity_snapshots s ON s.id = k.subject_snapshot_id
        UNION ALL
        SELECT b.action_id, 'ban', b.reason, b.created_at, b.expires_at, NULL,
               b.resolution_status, b.resolution_public_note, b.lifted_at,
               s.discord_user_id, b.guild_id
          FROM bans b
          JOIN identity_snapshots s ON s.id = b.subject_snapshot_id
        UNION ALL
        SELECT t.action_id, 'timeout', t.reason, t.created_at, t.expires_at, t.duration_ms,
               t.resolution_status, t.resolution_public_note, t.resolved_at,
               s.discord_user_id, t.guild_id
          FROM timeouts t
          JOIN identity_snapshots s ON s.id = t.subject_snapshot_id
    )
    SELECT a.action_id, a.kind, a.reason, a.created_at, a.expires_at, a.duration_ms,
           a.resolution_status, a.resolution_public_note, a.ended_at,
           appeal.id AS appeal_id, appeal.status AS appeal_status,
           appeal.submitted_at AS appeal_submitted_at,
           appeal.decided_at AS appeal_decided_at
      FROM actions a
      LEFT JOIN LATERAL (
          SELECT id, status, submitted_at, decided_at
            FROM atc_appeals
           WHERE action_id = a.action_id AND discord_user_id = a.discord_user_id
           ORDER BY submitted_at DESC
           LIMIT 1
      ) appeal ON true
     WHERE a.discord_user_id = $1
       AND a.guild_id = $2
       AND a.action_id IS NOT NULL
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
    const result = await pool.query<ActionRow>(`${actionQuery} AND upper(a.action_id) = upper($3) LIMIT 1`, [
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

export type SessionUser = {
    id: string;
    username: string;
    globalName: string | null;
    avatarHash: string | null;
};

export async function createOauthState(input: {
    stateHash: string;
    codeVerifier: string;
    returnTo: string;
    expiresAt: Date;
}): Promise<void> {
    await pool.query(
        `INSERT INTO atc_oauth_states (state_hash, code_verifier, return_to, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [input.stateHash, input.codeVerifier, input.returnTo, input.expiresAt],
    );
}

export async function consumeOauthState(stateHash: string): Promise<{ codeVerifier: string; returnTo: string } | null> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query<{ code_verifier: string; return_to: string }>(
            `DELETE FROM atc_oauth_states
              WHERE state_hash = $1 AND expires_at > now()
          RETURNING code_verifier, return_to`,
            [stateHash],
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

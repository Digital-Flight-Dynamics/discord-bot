import { resolve, sep } from 'node:path';
import { Elysia } from 'elysia';
import {
    buildDiscordAuthorizeUrl,
    endSession,
    expiredOauthBrowserCookie,
    expiredSessionCookie,
    finishDiscordOauth,
    getRequestSession,
    oauthBrowserCookie,
    readOauthBrowserToken,
    sessionCookie,
} from './server/auth';
import { config } from './server/config';
import {
    createAppealWindow,
    cleanupExpiredAtcData,
    findActionForUser,
    findAppealForUser,
    findAppealWindow,
    getModerationAction,
    getAppealDetail,
    getModerationDashboard,
    listAppealsForUserAction,
    listManagedBotSettings,
    listActionsForUser,
    listModerationPresets,
    listModeratorActionsForUser,
    listModerationLogs,
    prepareAppealWindow,
    searchModerationActions,
    searchModerationAppeals,
    searchModerationUsers,
    submitAppeal,
    updateManagedBotSettings,
} from './server/database';
import {
    actionStatus,
    appealEligibility,
    normalizeCaptchaAnswer,
    safeReturnPath,
    validateAppealAnswers,
    type DiscordMemberProfile,
    type ModeratorAccess,
} from './server/domain';
import { callBotAtc, publishAtcEvent } from './server/events';

const distDirectory = resolve(import.meta.dir, '../dist');
const indexFile = resolve(distDirectory, 'index.html');
const publicPagePaths = new Set(['/logged-out', '/privacy-policy', '/community-rules']);
const browserContentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' https://cdn.discordapp.com data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
].join('; ');

function json(data: unknown, status = 200): Response {
    return Response.json(data, {
        status,
        headers: {
            'cache-control': 'no-store',
            'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
        },
    });
}

function redirect(location: string, headers?: HeadersInit): Response {
    const responseHeaders = new Headers(headers);
    responseHeaders.set('location', location);
    return new Response(null, { status: 302, headers: responseHeaders });
}

function oauthCallbackHeaders(sessionToken?: string): Headers {
    const headers = new Headers();
    if (sessionToken) headers.append('set-cookie', sessionCookie(sessionToken));
    headers.append('set-cookie', expiredOauthBrowserCookie());
    return headers;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Something went wrong.';
}

function isDatabaseConflict(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function randomInteger(min: number, max: number): number {
    const range = max - min + 1;
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return min + (values[0]! % range);
}

async function authenticated(request: Request) {
    const session = await getRequestSession(request);
    if (!session) return { response: json({ error: 'Authentication required.' }, 401), session: null };
    return { response: null, session };
}

const noModeratorAccess: ModeratorAccess = {
    moderator: false,
    management: false,
    developer: false,
    messageTools: false,
};

async function memberProfile(userId: string): Promise<DiscordMemberProfile | null> {
    return callBotAtc<DiscordMemberProfile>({ operation: 'member.get', userId }).catch(() => null);
}

async function moderatorAuthenticated(request: Request, messageTools = false) {
    const auth = await authenticated(request);
    if (!auth.session) return { ...auth, access: noModeratorAccess };
    const profile = await memberProfile(auth.session.user.id);
    const access = profile?.access || noModeratorAccess;
    if (!access.moderator || (messageTools && !access.messageTools)) {
        return {
            response: json({ error: messageTools ? 'Management or developer access is required.' : 'Moderator access is required.' }, 403),
            session: null,
            access,
        };
    }
    return { ...auth, access };
}

async function managementAuthenticated(request: Request) {
    const auth = await authenticated(request);
    if (!auth.session) return { ...auth, access: noModeratorAccess };
    const profile = await memberProfile(auth.session.user.id);
    const access = profile?.access || noModeratorAccess;
    if (!access.management) {
        return {
            response: json({ error: 'Management access is required.' }, 403),
            session: null,
            access,
        };
    }
    return { ...auth, access };
}

async function botToolResponse(body: Record<string, unknown>): Promise<Response> {
    try {
        return json(await callBotAtc(body));
    } catch (error) {
        return json({ error: errorMessage(error) }, 400);
    }
}

function pagination(request: Request): { page: number; limit: 10 | 25 } {
    const params = new URL(request.url).searchParams;
    const requestedPage = Number(params.get('page') || 1);
    return {
        page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
        limit: params.get('limit') === '25' ? 25 : 10,
    };
}

function staticFile(pathname: string): Response | null {
    const relative = pathname.replace(/^\/+/, '');
    const filename = resolve(distDirectory, relative);
    if (filename !== distDirectory && !filename.startsWith(`${distDirectory}${sep}`)) return null;
    const file = Bun.file(filename);
    return file.size > 0
        ? new Response(file, {
              headers: {
                  'cache-control': pathname.startsWith('/_astro/') ? 'public, max-age=31536000, immutable' : 'no-cache',
                  'content-security-policy': browserContentSecurityPolicy,
              },
          })
        : null;
}

function appShell(): Response {
    return new Response(Bun.file(indexFile), {
        headers: {
            'cache-control': 'no-cache',
            'content-security-policy': browserContentSecurityPolicy,
        },
    });
}

const app = new Elysia()
    .get('/health', () => json({ status: 'ok' }))
    .get('/auth/discord/start', async ({ request }) => {
        const url = new URL(request.url);
        const authorization = await buildDiscordAuthorizeUrl(url.searchParams.get('returnTo'));
        return redirect(authorization.url, { 'set-cookie': oauthBrowserCookie(authorization.browserToken) });
    })
    .get('/auth/discord/callback', async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!code || !state) {
            return redirect('/logged-out?error=Discord%20sign-in%20was%20cancelled.', oauthCallbackHeaders());
        }
        try {
            const result = await finishDiscordOauth(code, state, readOauthBrowserToken(request));
            return redirect(result.returnTo, oauthCallbackHeaders(result.token));
        } catch (error) {
            console.error('Discord OAuth callback failed:', errorMessage(error));
            return redirect(`/logged-out?error=${encodeURIComponent(errorMessage(error))}`, oauthCallbackHeaders());
        }
    })
    .post('/auth/logout', async ({ request }) => {
        await endSession(request);
        return new Response(null, {
            status: 204,
            headers: { 'set-cookie': expiredSessionCookie() },
        });
    })
    .get('/api/me', async ({ request }) => {
        const auth = await authenticated(request);
        if (!auth.session) return auth.response;
        const user = auth.session.user;
        const profile = await memberProfile(user.id);
        return json({
            id: user.id,
            username: user.username,
            displayName: user.globalName || user.username,
            avatarUrl: user.avatarHash
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatarHash}.webp?size=128`
                : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) >> 22n) % 6}.png`,
            access: profile?.access || noModeratorAccess,
        });
    })
    .get('/api/moderation/dashboard', async ({ request }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        return json(await getModerationDashboard());
    })
    .get('/api/moderation/users/search', async ({ request }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        const query = new URL(request.url).searchParams.get('q')?.trim() || '';
        if (query.length < 2) return json([]);
        const [discordUsers, recordedUsers] = await Promise.all([
            callBotAtc<DiscordMemberProfile[]>({ operation: 'member.search', query }),
            searchModerationUsers(query),
        ]);
        const records = new Map(recordedUsers.map((user) => [user.id, user]));
        const combined = new Map<string, Record<string, unknown>>();
        for (const user of discordUsers) combined.set(user.id, { ...user, record: records.get(user.id) || null });
        const missingRecords = recordedUsers
            .filter((user) => !combined.has(user.id))
            .slice(0, Math.max(0, 10 - combined.size));
        const hydratedRecords = await Promise.all(
            missingRecords.map(async (record) => ({
                record,
                profile: await memberProfile(record.id),
            })),
        );
        for (const { record, profile } of hydratedRecords) {
            combined.set(record.id, profile
                ? { ...profile, record }
                : {
                      id: record.id,
                      username: record.username || record.id,
                      displayName: record.displayName || record.username || record.id,
                      avatarUrl: null,
                      isMember: false,
                      roles: [],
                      access: noModeratorAccess,
                      databaseOnly: true,
                      record,
                  });
        }
        return json([...combined.values()].slice(0, 10));
    })
    .get('/api/moderation/users/:userId', async ({ request, params }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        const [profile, actions] = await Promise.all([
            memberProfile(params.userId),
            listModeratorActionsForUser(params.userId),
        ]);
        if (!profile && actions.length === 0) return json({ error: 'User not found.' }, 404);
        return json({
            profile: profile || {
                id: params.userId,
                username: params.userId,
                displayName: params.userId,
                globalName: null,
                avatarUrl: null,
                createdAt: null,
                joinedAt: null,
                isMember: false,
                roles: [],
                access: noModeratorAccess,
            },
            actions,
        });
    })
    .get('/api/moderation/logs', async ({ request }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        const { page, limit } = pagination(request);
        return json(await listModerationLogs(page, limit));
    })
    .get('/api/moderation/actions', async ({ request }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        const query = new URL(request.url).searchParams.get('q') || '';
        const { page, limit } = pagination(request);
        return json(await searchModerationActions(query, page, limit));
    })
    .get('/api/moderation/appeals', async ({ request }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        const params = new URL(request.url).searchParams;
        const { page, limit } = pagination(request);
        return json(await searchModerationAppeals(params.get('q') || '', params.get('status') || '', page, limit));
    })
    .get('/api/moderation/appeals/:appealId', async ({ request, params }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        const result = await getAppealDetail(params.appealId);
        return result ? json(result) : json({ error: 'Appeal not found.' }, 404);
    })
    .get('/api/moderation/actions/:actionId', async ({ request, params }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        const result = await getModerationAction(params.actionId);
        return result ? json(result) : json({ error: 'Action not found.' }, 404);
    })
    .put('/api/moderation/actions/:actionId/edit', async ({ request, params, body }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
        const kind = input.kind;
        const newValue = typeof input.newValue === 'string' ? input.newValue.trim() : '';
        const rationale = typeof input.rationale === 'string' ? input.rationale.trim() : '';
        const notificationMode = input.notificationMode === 'notify' || input.notificationMode === 'silent-edit' ? input.notificationMode : 'no';
        if (!['reason', 'note', 'duration', 'expiration'].includes(String(kind))) return json({ error: 'Unsupported moderation edit.' }, 400);
        if (!newValue || (kind !== 'note' && !rationale)) return json({ error: kind === 'note' ? 'A new value is required.' : 'A new value and rationale are required.' }, 400);
        try {
            return json(await callBotAtc({ operation: 'moderation.update', actorUserId: auth.session.user.id, actionId: params.actionId, kind, newValue, rationale, notificationMode }));
        } catch (error) {
            return json({ error: errorMessage(error) }, 400);
        }
    })
    .put('/api/moderation/actions/:actionId/private-note', async ({ request, params, body }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        const note = body && typeof body === 'object' ? (body as Record<string, unknown>).note : undefined;
        if (typeof note !== 'string') return json({ error: 'A private note is required.' }, 400);
        const privateNote = note.trim();
        if (privateNote.length > 500) return json({ error: 'Private notes can be at most 500 characters.' }, 400);
        try {
            return json(await callBotAtc({
                operation: 'moderation.update',
                actorUserId: auth.session.user.id,
                actionId: params.actionId,
                kind: 'note',
                newValue: privateNote,
                rationale: 'Quick private note update.',
                notificationMode: 'no',
            }));
        } catch (error) {
            return json({ error: errorMessage(error) }, 400);
        }
    })
    .put('/api/moderation/actions/:actionId/revoke', async ({ request, params, body }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
        const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
        const publicNote = typeof input.publicNote === 'string' ? input.publicNote.trim() : null;
        if (!reason) return json({ error: 'A reason is required to revoke an action.' }, 400);
        try {
            return json(await callBotAtc({ operation: 'moderation.revoke', actorUserId: auth.session.user.id, actionId: params.actionId, reason, publicNote }));
        } catch (error) {
            return json({ error: errorMessage(error) }, 400);
        }
    })
    .put('/api/moderation/appeals/:appealId/review', async ({ request, params, body }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
        const actionId = typeof input.actionId === 'string' ? input.actionId.trim() : '';
        if (!actionId) return json({ error: 'An action ID is required.' }, 400);
        try { return json(await callBotAtc({ operation: 'appeal.review', actorUserId: auth.session.user.id, actionId, appealId: params.appealId })); }
        catch (error) { return json({ error: errorMessage(error) }, 400); }
    })
    .put('/api/moderation/appeals/:appealId/deny', async ({ request, params, body }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
        const actionId = typeof input.actionId === 'string' ? input.actionId.trim() : '';
        const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
        const publicNote = typeof input.publicNote === 'string' ? input.publicNote.trim() : null;
        if (!actionId || !reason) return json({ error: 'An action ID and reason are required.' }, 400);
        try { return json(await callBotAtc({ operation: 'appeal.deny', actorUserId: auth.session.user.id, actionId, appealId: params.appealId, reason, publicNote })); }
        catch (error) { return json({ error: errorMessage(error) }, 400); }
    })
    .put('/api/moderation/appeals/:appealId/approve', async ({ request, params, body }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
        const actionId = typeof input.actionId === 'string' ? input.actionId.trim() : '';
        const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
        const publicNote = typeof input.publicNote === 'string' ? input.publicNote.trim() : null;
        if (!actionId || !reason) return json({ error: 'An action ID and reason are required.' }, 400);
        try { return json(await callBotAtc({ operation: 'appeal.approve', actorUserId: auth.session.user.id, actionId, appealId: params.appealId, reason, publicNote })); }
        catch (error) { return json({ error: errorMessage(error) }, 400); }
    })
    .get('/api/moderation/tools/member/:userId', async ({ request, params }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        if (!/^\d{17,20}$/.test(params.userId)) return json({ error: 'Enter a valid Discord user ID.' }, 400);
        const profile = await memberProfile(params.userId);
        return profile ? json(profile) : json({ error: 'Discord user not found.' }, 404);
    })
    .get('/api/moderation/tools/presets', async ({ request }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        return json(await listModerationPresets());
    })
    .get('/api/moderation/tools/channels', async ({ request }) => {
        const auth = await moderatorAuthenticated(request, true);
        if (!auth.session) return auth.response;
        return botToolResponse({
            operation: 'message.channels',
            actorUserId: auth.session.user.id,
        });
    })
    .get('/api/moderation/settings', async ({ request }) => {
        const auth = await managementAuthenticated(request);
        if (!auth.session) return auth.response;
        return json({ settings: await listManagedBotSettings() });
    })
    .post('/api/moderation/settings', async ({ request, body }) => {
        const auth = await managementAuthenticated(request);
        if (!auth.session) return auth.response;
        const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
        const rawSettings = input.settings;
        if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
            return json({ error: 'Settings payload is invalid.' }, 400);
        }
        const updates: Record<string, { value?: string; clear?: boolean }> = {};
        for (const [key, rawUpdate] of Object.entries(rawSettings)) {
            if (!rawUpdate || typeof rawUpdate !== 'object' || Array.isArray(rawUpdate)) continue;
            const update = rawUpdate as Record<string, unknown>;
            updates[key] = {
                ...(typeof update.value === 'string' ? { value: update.value } : {}),
                ...(update.clear === true ? { clear: true } : {}),
            };
        }
        try {
            return json({ settings: await updateManagedBotSettings(updates, auth.session.user.id) });
        } catch (error) {
            return json({ error: errorMessage(error) }, 400);
        }
    })
    .post('/api/moderation/tools/action', async ({ request, body }) => {
        const auth = await moderatorAuthenticated(request);
        if (!auth.session) return auth.response;
        const input = body as Record<string, unknown>;
        return botToolResponse({
            operation: 'moderation.execute',
            actorUserId: auth.session.user.id,
            targetUserId: input.targetUserId,
            kind: input.kind,
            reason: input.reason,
            durationMs: input.durationMs,
            recordExpiresAt: input.expiration,
            privateNote: input.privateNote,
        });
    })
    .post('/api/moderation/tools/message', async ({ request, body }) => {
        const auth = await moderatorAuthenticated(request, true);
        if (!auth.session) return auth.response;
        const input = body as Record<string, unknown>;
        return botToolResponse({
            operation: 'message.send',
            actorUserId: auth.session.user.id,
            channelId: input.channelId,
            content: input.content,
            embeds: input.embeds,
            title: input.title,
            description: input.description,
        });
    })
    .post('/api/moderation/tools/message-get', async ({ request, body }) => {
        const auth = await moderatorAuthenticated(request, true);
        if (!auth.session) return auth.response;
        const input = body as Record<string, unknown>;
        return botToolResponse({
            operation: 'message.get',
            actorUserId: auth.session.user.id,
            channelId: input.channelId,
            messageId: input.messageId,
        });
    })
    .post('/api/moderation/tools/message-edit', async ({ request, body }) => {
        const auth = await moderatorAuthenticated(request, true);
        if (!auth.session) return auth.response;
        const input = body as Record<string, unknown>;
        return botToolResponse({
            operation: 'message.edit',
            actorUserId: auth.session.user.id,
            channelId: input.channelId,
            messageId: input.messageId,
            content: input.content,
            embeds: input.embeds,
            title: input.title,
            description: input.description,
        });
    })
    .get('/api/actions', async ({ request }) => {
        const auth = await authenticated(request);
        if (!auth.session) return auth.response;
        return json(await listActionsForUser(auth.session.user.id));
    })
    .get('/api/actions/:actionId', async ({ request, params }) => {
        const auth = await authenticated(request);
        if (!auth.session) return auth.response;
        const action = await findActionForUser(auth.session.user.id, params.actionId);
        if (!action) return json({ error: 'Action not found.' }, 404);
        const appeals = await listAppealsForUserAction(auth.session.user.id, action.actionId);
        return json({ ...action, appeals });
    })
    .post('/api/actions/:actionId/appeal-window', async ({ request, params }) => {
        const auth = await authenticated(request);
        if (!auth.session) return auth.response;
        const action = await findActionForUser(auth.session.user.id, params.actionId);
        if (!action) return json({ error: 'Action not found.' }, 404);
        const eligibility = appealEligibility(action);
        if (!eligibility.allowed) return json({ error: eligibility.reason || 'This action cannot be appealed.' }, 409);

        const left = randomInteger(3, 12);
        const right = randomInteger(2, 9);
        const operation = randomInteger(0, 1) === 0 ? '+' : '×';
        const answer = operation === '+' ? left + right : left * right;
        const window = await createAppealWindow({
            sessionHash: auth.session.tokenHash,
            discordUserId: auth.session.user.id,
            actionId: action.actionId,
            mathPrompt: `${left} ${operation} ${right}`,
            mathAnswer: String(answer),
        });
        return json({
            windowId: window.id,
            mathPrompt: `${left} ${operation} ${right}`,
            termsAvailableAt: new Date(window.openedAt.getTime() + config.appealTermsDelayMs).toISOString(),
        });
    })
    .post('/api/actions/:actionId/appeal-prepare', async ({ request, params, body }) => {
        const auth = await authenticated(request);
        if (!auth.session) return auth.response;
        const input = body as Record<string, unknown>;
        const windowId = typeof input?.windowId === 'string' ? input.windowId : '';
        const window = await findAppealWindow(windowId, auth.session.tokenHash, auth.session.user.id, params.actionId);
        if (!window || window.consumed_at) return json({ error: 'Your appeal session expired. Please start again.' }, 400);
        if (Date.now() - window.opened_at.getTime() < config.appealTermsDelayMs) {
            return json({ error: 'Please read the terms before continuing.' }, 400);
        }
        if (input.termsAccepted !== true) return json({ error: 'You must accept the appeal terms.' }, 400);
        if (normalizeCaptchaAnswer(input.mathAnswer) !== normalizeCaptchaAnswer(window.math_answer)) {
            return json({ error: 'The math answer was incorrect.' }, 400);
        }
        const action = await findActionForUser(auth.session.user.id, params.actionId);
        if (!action) return json({ error: 'Action not found.' }, 404);
        const answers = validateAppealAnswers(input.answers, action.kind);
        if (!answers) {
            return json({ error: 'Some answers are missing or do not contain enough detail.' }, 400);
        }

        await prepareAppealWindow({
            id: window.id,
            answers,
        });
        return json({ ready: true });
    })
    .post('/api/actions/:actionId/appeals', async ({ request, params, body }) => {
        const auth = await authenticated(request);
        if (!auth.session) return auth.response;
        const input = body as Record<string, unknown>;
        const windowId = typeof input?.windowId === 'string' ? input.windowId : '';
        const window = await findAppealWindow(windowId, auth.session.tokenHash, auth.session.user.id, params.actionId);
        if (!window?.prepared_at || !window.answers || window.consumed_at) {
            return json({ error: 'Your appeal session expired. Please start again.' }, 400);
        }
        const action = await findActionForUser(auth.session.user.id, params.actionId);
        if (!action) return json({ error: 'Action not found.' }, 404);
        const eligibility = appealEligibility(action);
        if (!eligibility.allowed) return json({ error: eligibility.reason || 'This action cannot be appealed.' }, 409);

        try {
            const appeal = await submitAppeal({
                windowId: window.id,
                sessionHash: auth.session.tokenHash,
                discordUserId: auth.session.user.id,
                actionId: action.actionId,
                answers: window.answers,
            });
            await publishAtcEvent({
                id: appeal.id,
                type: 'appeal.submitted',
                occurredAt: appeal.submittedAt,
                guildId: config.discordGuildId,
                actionId: action.actionId,
                appealId: appeal.id,
                actorUserId: auth.session.user.id,
            }).catch((error) => {
                console.error(`[ATC] Appeal ${appeal.id} was saved, but Discord notification failed.`, error);
            });
            return json({ id: appeal.id, actionId: action.actionId }, 201);
        } catch (error) {
            if (isDatabaseConflict(error)) return json({ error: 'An appeal for this action is already under review.' }, 409);
            throw error;
        }
    })
    .get('/api/actions/:actionId/appeals/:appealId', async ({ request, params }) => {
        const auth = await authenticated(request);
        if (!auth.session) return auth.response;
        const [action, appeal] = await Promise.all([
            findActionForUser(auth.session.user.id, params.actionId),
            findAppealForUser(auth.session.user.id, params.actionId, params.appealId),
        ]);
        return action && appeal ? json({ action, appeal }) : json({ error: 'Appeal not found.' }, 404);
    })
    .get('/api/actions/:actionId/invite', async ({ request, params }) => {
        const auth = await authenticated(request);
        if (!auth.session) return auth.response;
        const action = await findActionForUser(auth.session.user.id, params.actionId);
        if (!action) return json({ error: 'Action not found.' }, 404);
        const status = actionStatus(action);
        const eligible = (action.kind === 'kick' || action.kind === 'ban') && (status === 'appealed' || status === 'revoked');
        if (!eligible || !config.discordInviteUrl) return json({ error: 'A rejoin link is not available.' }, 404);
        return json({ inviteUrl: config.discordInviteUrl });
    })
    .get('/*', async ({ request }) => {
        const url = new URL(request.url);
        if (url.pathname === '/appeals') return redirect('/my-history');
        const legacyAppealMatch = url.pathname.match(/^\/appeal\/([^/]+)(?:\/([^/]+))?\/?$/);
        if (legacyAppealMatch?.[1]) {
            const destination = legacyAppealMatch[2]
                ? `/action/${legacyAppealMatch[1]}/appeal/${legacyAppealMatch[2]}`
                : `/action/${legacyAppealMatch[1]}`;
            return redirect(`${destination}${url.search}`);
        }
        const asset = staticFile(url.pathname);
        if (asset && url.pathname !== '/' && url.pathname !== '/index.html') return asset;

        const session = await getRequestSession(request);
        if (publicPagePaths.has(url.pathname)) {
            if (url.pathname === '/logged-out' && session) {
                return redirect(safeReturnPath(url.searchParams.get('returnTo')));
            }
            return appShell();
        }
        if (!session) {
            const returnTo = safeReturnPath(`${url.pathname}${url.search}`);
            return redirect(`/logged-out?returnTo=${encodeURIComponent(returnTo)}`);
        }
        if (url.pathname === '/') return redirect('/my-history');
        return appShell();
    })
    .onError(({ error }) => {
        console.error('ATC request failed:', error);
        return json({ error: 'An unexpected error occurred.' }, 500);
    })
    .listen({ hostname: config.host, port: config.port });

void cleanupExpiredAtcData().catch((error) => console.error('ATC cleanup failed:', error));
setInterval(() => {
    void cleanupExpiredAtcData().catch((error) => console.error('ATC cleanup failed:', error));
}, 60 * 60_000).unref();

console.log(`ATC is listening on http://${app.server?.hostname}:${app.server?.port}`);

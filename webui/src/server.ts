import { resolve, sep } from 'node:path';
import { Elysia } from 'elysia';
import {
    buildDiscordAuthorizeUrl,
    endSession,
    expiredSessionCookie,
    finishDiscordOauth,
    getRequestSession,
    sessionCookie,
} from './server/auth';
import { config } from './server/config';
import {
    createAppealWindow,
    findActionForUser,
    findAppealForUser,
    findAppealWindow,
    listAppealsForUserAction,
    listActionsForUser,
    prepareAppealWindow,
    submitAppeal,
} from './server/database';
import { actionStatus, appealEligibility, normalizeCaptchaAnswer, safeReturnPath, validateAppealAnswers } from './server/domain';
import { publishAtcEvent } from './server/events';

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
    return new Response(null, { status: 302, headers: { location, ...headers } });
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
        return redirect(await buildDiscordAuthorizeUrl(url.searchParams.get('returnTo')));
    })
    .get('/auth/discord/callback', async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!code || !state) return redirect('/logged-out?error=Discord%20sign-in%20was%20cancelled.');
        try {
            const result = await finishDiscordOauth(code, state);
            return redirect(result.returnTo, { 'set-cookie': sessionCookie(result.token) });
        } catch (error) {
            console.error('Discord OAuth callback failed:', errorMessage(error));
            return redirect(`/logged-out?error=${encodeURIComponent(errorMessage(error))}`);
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
        return json({
            id: user.id,
            username: user.username,
            displayName: user.globalName || user.username,
            avatarUrl: user.avatarHash
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatarHash}.webp?size=128`
                : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) >> 22n) % 6}.png`,
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

console.log(`ATC is listening on http://${app.server?.hostname}:${app.server?.port}`);

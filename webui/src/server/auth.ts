import { config } from './config';
import {
    consumeOauthState,
    createOauthState,
    createSession,
    deleteSession,
    findSession,
    type SessionUser,
} from './database';
import { safeReturnPath } from './domain';

const SESSION_COOKIE = 'atc_session';
const OAUTH_BROWSER_COOKIE = 'atc_oauth_browser';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
const OAUTH_MAX_AGE_SECONDS = 10 * 60;

function randomToken(bytes = 32): string {
    return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString('base64url');
}

export async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Buffer.from(digest).toString('base64url');
}

export function readCookie(request: Request, name: string): string | null {
    const cookie = request.headers.get('cookie');
    if (!cookie) return null;
    for (const part of cookie.split(';')) {
        const [key, ...value] = part.trim().split('=');
        if (key === name) return decodeURIComponent(value.join('='));
    }
    return null;
}

export async function getRequestSession(request: Request): Promise<{ user: SessionUser; tokenHash: string } | null> {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) return null;
    const tokenHash = await sha256(token);
    const user = await findSession(tokenHash);
    return user ? { user, tokenHash } : null;
}

export function sessionCookie(token: string): string {
    return [
        `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
        config.secureCookies ? 'Secure' : '',
    ]
        .filter(Boolean)
        .join('; ');
}

export function expiredSessionCookie(): string {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config.secureCookies ? '; Secure' : ''}`;
}

export async function buildDiscordAuthorizeUrl(
    returnToValue: string | null,
): Promise<{ url: string; browserToken: string }> {
    const state = randomToken();
    const browserToken = randomToken();
    const verifier = randomToken(64);
    const challenge = await sha256(verifier);
    const returnTo = safeReturnPath(returnToValue);
    await createOauthState({
        stateHash: await sha256(state),
        browserHash: await sha256(browserToken),
        codeVerifier: verifier,
        returnTo,
        expiresAt: new Date(Date.now() + 10 * 60_000),
    });

    const params = new URLSearchParams({
        client_id: config.discordClientId,
        response_type: 'code',
        redirect_uri: config.discordRedirectUri,
        scope: 'identify',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
    });
    return { url: `https://discord.com/oauth2/authorize?${params}`, browserToken };
}

export function oauthBrowserCookie(token: string): string {
    return [
        `${OAUTH_BROWSER_COOKIE}=${encodeURIComponent(token)}`,
        'Path=/auth/discord/callback',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${OAUTH_MAX_AGE_SECONDS}`,
        config.secureCookies ? 'Secure' : '',
    ]
        .filter(Boolean)
        .join('; ');
}

export function expiredOauthBrowserCookie(): string {
    return `${OAUTH_BROWSER_COOKIE}=; Path=/auth/discord/callback; HttpOnly; SameSite=Lax; Max-Age=0${config.secureCookies ? '; Secure' : ''}`;
}

type DiscordUser = {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
};

export async function finishDiscordOauth(
    code: string,
    state: string,
    browserToken: string | null,
): Promise<{ token: string; returnTo: string }> {
    if (!browserToken) throw new Error('This sign-in request expired. Please try again.');
    const oauthState = await consumeOauthState(await sha256(state), await sha256(browserToken));
    if (!oauthState) throw new Error('This sign-in request expired. Please try again.');

    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: config.discordClientId,
            client_secret: config.discordClientSecret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: config.discordRedirectUri,
            code_verifier: oauthState.codeVerifier,
        }),
    });
    if (!tokenResponse.ok) throw new Error('Discord rejected the sign-in request.');
    const tokens = (await tokenResponse.json()) as { access_token: string };

    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userResponse.ok) throw new Error('Could not load your Discord account.');
    const discordUser = (await userResponse.json()) as DiscordUser;

    const token = randomToken();
    await createSession(
        await sha256(token),
        {
            id: discordUser.id,
            username: discordUser.username,
            globalName: discordUser.global_name,
            avatarHash: discordUser.avatar,
        },
        new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1_000),
    );
    return { token, returnTo: safeReturnPath(oauthState.returnTo) };
}

export function readOauthBrowserToken(request: Request): string | null {
    return readCookie(request, OAUTH_BROWSER_COOKIE);
}

export async function endSession(request: Request): Promise<void> {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) await deleteSession(await sha256(token));
}

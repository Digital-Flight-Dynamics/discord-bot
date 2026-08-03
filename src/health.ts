import { timingSafeEqual } from 'crypto';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { Client } from 'discord.js';
import { isDatabaseHealthy } from './db/client';
import { parseAtcInternalEvent } from './lib/atcEvents';
import { handleAtcDiscordEvent } from './lib/moderationAppeals';
import {
    editAtcMessage,
    executeAtcModeration,
    getAtcMessage,
    getAtcMemberProfile,
    listAtcChannels,
    searchAtcMembers,
    sendAtcMessage,
} from './lib/atcInternalTools';
import { executeAtcActionEdit } from './slashUpdateAction';

const MAX_EVENT_BODY_BYTES = 64 * 1024;
const developmentApiKey = 'development-only-atc-internal-key';

function internalApiKey(): string | null {
    const configured = process.env.ATC_INTERNAL_API_KEY?.trim();
    if (configured && (process.env.NODE_ENV !== 'production' || configured.length >= 32)) return configured;
    return process.env.NODE_ENV === 'production' ? null : developmentApiKey;
}

function matchesApiKey(authorization: string | undefined, expected: string): boolean {
    if (!authorization?.startsWith('Bearer ')) return false;
    const supplied = Buffer.from(authorization.slice('Bearer '.length));
    const wanted = Buffer.from(expected);
    return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
}

function isPrivateNetworkAddress(address: string | undefined): boolean {
    if (!address) return false;
    const normalized = address.replace(/^::ffff:/, '');
    if (normalized === '::1' || normalized.startsWith('127.') || normalized.startsWith('10.') || normalized.startsWith('192.168.')) {
        return true;
    }
    const match = normalized.match(/^172\.(\d+)\./);
    if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
    return /^(?:fc|fd|fe8|fe9|fea|feb)/i.test(normalized);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_EVENT_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
        chunks.push(buffer);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
        throw new Error('INVALID_JSON');
    }
}

function authorizeInternalRequest(req: IncomingMessage, res: ServerResponse): boolean {
    if (!isPrivateNetworkAddress(req.socket.remoteAddress)) {
        sendJson(res, 403, { error: 'Internal events are only accepted from the private network.' });
        return false;
    }
    const key = internalApiKey();
    if (!key) {
        sendJson(res, 503, { error: 'Internal event API is not configured.' });
        return false;
    }
    if (!matchesApiKey(req.headers.authorization, key)) {
        sendJson(res, 401, { error: 'Unauthorized.' });
        return false;
    }
    if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
        sendJson(res, 415, { error: 'Content-Type must be application/json.' });
        return false;
    }
    return true;
}

async function readInternalBody(req: IncomingMessage, res: ServerResponse): Promise<unknown | null> {
    if (!authorizeInternalRequest(req, res)) return null;

    try {
        return await readJsonBody(req);
    } catch (error) {
        const tooLarge = error instanceof Error && error.message === 'REQUEST_TOO_LARGE';
        sendJson(res, tooLarge ? 413 : 400, { error: tooLarge ? 'Request body is too large.' : 'Invalid JSON.' });
        return null;
    }
}

async function handleInternalEvent(client: Client, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readInternalBody(req, res);
    if (body === null && res.headersSent) return;
    const event = parseAtcInternalEvent(body);
    if (!event) {
        sendJson(res, 422, { error: 'Invalid or unsupported event.' });
        return;
    }

    try {
        await handleAtcDiscordEvent(client, event);
        sendJson(res, 202, { accepted: true, eventId: event.id });
    } catch (error) {
        console.error(`[ATC] Failed to process ${event.type} (${event.id}).`, error);
        sendJson(res, 500, { error: 'The event could not be processed.' });
    }
}

async function handleAtcRequest(client: Client, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readInternalBody(req, res);
    if (body === null && res.headersSent) return;
    if (!body || typeof body !== 'object') {
        sendJson(res, 422, { error: 'Invalid ATC operation.' });
        return;
    }
    const input = body as Record<string, unknown>;
    const operation = typeof input.operation === 'string' ? input.operation : '';
    const actorUserId = typeof input.actorUserId === 'string' ? input.actorUserId : '';

    try {
        if (operation === 'member.get') {
            const userId = typeof input.userId === 'string' ? input.userId : '';
            const profile = /^\d{17,20}$/.test(userId) ? await getAtcMemberProfile(client, userId) : null;
            sendJson(res, profile ? 200 : 404, profile || { error: 'User not found.' });
            return;
        }
        if (operation === 'member.search') {
            const query = typeof input.query === 'string' ? input.query : '';
            sendJson(res, 200, await searchAtcMembers(client, query));
            return;
        }
        if (operation === 'message.channels') {
            sendJson(res, 200, await listAtcChannels(client, { actorUserId }));
            return;
        }
        if (operation === 'moderation.execute') {
            const kind = input.kind;
            if (!['warn', 'kick', 'ban', 'timeout'].includes(String(kind))) {
                sendJson(res, 422, { error: 'Unsupported moderation action.' });
                return;
            }
            const result = await executeAtcModeration(client, {
                actorUserId,
                targetUserId: typeof input.targetUserId === 'string' ? input.targetUserId : '',
                kind: kind as 'warn' | 'kick' | 'ban' | 'timeout',
                reason: typeof input.reason === 'string' ? input.reason : '',
                durationMs: typeof input.durationMs === 'number' ? input.durationMs : null,
                recordExpiresAt: typeof input.recordExpiresAt === 'string' ? input.recordExpiresAt : null,
                privateNote: typeof input.privateNote === 'string' ? input.privateNote : null,
            });
            sendJson(res, result.status === 'not-executed' ? 409 : 200, result);
            return;
        }
        if (operation === 'moderation.update') {
            const kind = input.kind;
            if (!['reason', 'note', 'duration', 'expiration'].includes(String(kind))) {
                sendJson(res, 422, { error: 'Unsupported moderation edit.' });
                return;
            }
            const notificationMode = ['no', 'silent-edit', 'notify'].includes(String(input.notificationMode))
                ? input.notificationMode as 'no' | 'silent-edit' | 'notify'
                : 'no';
            const result = await executeAtcActionEdit(client, {
                actorUserId,
                actionId: typeof input.actionId === 'string' ? input.actionId : '',
                kind: kind as 'reason' | 'note' | 'duration' | 'expiration',
                newValue: typeof input.newValue === 'string' ? input.newValue : '',
                rationale: typeof input.rationale === 'string' ? input.rationale : '',
                notificationMode,
            });
            sendJson(res, 200, result);
            return;
        }
        if (operation === 'message.send') {
            sendJson(res, 200, await sendAtcMessage(client, {
                actorUserId,
                channelId: typeof input.channelId === 'string' ? input.channelId : '',
                content: typeof input.content === 'string' ? input.content : '',
                embeds: input.embeds,
                title: typeof input.title === 'string' ? input.title : '',
                description: typeof input.description === 'string' ? input.description : '',
            }));
            return;
        }
        if (operation === 'message.get') {
            sendJson(res, 200, await getAtcMessage(client, {
                actorUserId,
                channelId: typeof input.channelId === 'string' ? input.channelId : '',
                messageId: typeof input.messageId === 'string' ? input.messageId : '',
            }));
            return;
        }
        if (operation === 'message.edit') {
            sendJson(res, 200, await editAtcMessage(client, {
                actorUserId,
                channelId: typeof input.channelId === 'string' ? input.channelId : '',
                messageId: typeof input.messageId === 'string' ? input.messageId : '',
                content: typeof input.content === 'string' ? input.content : '',
                embeds: input.embeds,
                title: typeof input.title === 'string' ? input.title : '',
                description: typeof input.description === 'string' ? input.description : '',
            }));
            return;
        }
        sendJson(res, 422, { error: 'Invalid or unsupported ATC operation.' });
    } catch (error) {
        console.error(`[ATC] Internal operation ${operation || 'unknown'} failed.`, error);
        sendJson(res, 400, { error: error instanceof Error ? error.message : 'The operation failed.' });
    }
}

/** Starts the bot's health check and authenticated internal event API. */
export function startHealthServer(client: Client): Server {
    const configuredPort = Number(process.env.HEALTH_PORT || 3000);
    const port = Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65_535 ? configuredPort : 3000;
    const host = process.env.INTERNAL_API_HOST?.trim() || '0.0.0.0';

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const pathname = new URL(req.url || '/', 'http://internal').pathname;
        if (pathname === '/health' && req.method === 'GET') {
            handleHealthCheck(client, res).catch((error) => {
                console.error('Health check error:', error);
                res.writeHead(503, { 'Content-Type': 'text/plain' });
                res.end('ERROR');
            });
            return;
        }
        if (pathname === '/internal/events' && req.method === 'POST') {
            void handleInternalEvent(client, req, res);
            return;
        }
        if (pathname === '/internal/atc' && req.method === 'POST') {
            void handleAtcRequest(client, req, res);
            return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    });

    server.listen(port, host, () => {
        console.log(`Health and internal event server listening on ${host}:${port}`);
        if (!internalApiKey()) {
            console.error('[ERROR] ATC internal event API is disabled because ATC_INTERNAL_API_KEY is missing or too short.');
        }
    });
    server.on('error', (error) => console.error('Health and internal event server error:', error));
    return server;
}

async function handleHealthCheck(client: Client, res: ServerResponse): Promise<void> {
    const healthy = client.isReady() && (await isDatabaseHealthy());
    res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'text/plain' });
    res.end(healthy ? 'OK' : 'ERROR');
}

import { timingSafeEqual } from 'crypto';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { Client } from 'discord.js';
import { isDatabaseHealthy } from './db/client';
import { parseAtcInternalEvent } from './lib/atcEvents';
import { handleAtcDiscordEvent } from './lib/moderationAppeals';

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

async function handleInternalEvent(client: Client, req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!isPrivateNetworkAddress(req.socket.remoteAddress)) {
        sendJson(res, 403, { error: 'Internal events are only accepted from the private network.' });
        return;
    }
    const key = internalApiKey();
    if (!key) {
        sendJson(res, 503, { error: 'Internal event API is not configured.' });
        return;
    }
    if (!matchesApiKey(req.headers.authorization, key)) {
        sendJson(res, 401, { error: 'Unauthorized.' });
        return;
    }
    if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
        sendJson(res, 415, { error: 'Content-Type must be application/json.' });
        return;
    }

    let body: unknown;
    try {
        body = await readJsonBody(req);
    } catch (error) {
        const tooLarge = error instanceof Error && error.message === 'REQUEST_TOO_LARGE';
        sendJson(res, tooLarge ? 413 : 400, { error: tooLarge ? 'Request body is too large.' : 'Invalid JSON.' });
        return;
    }
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

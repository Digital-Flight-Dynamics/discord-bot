import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Client } from 'discord.js';
import mongoose from 'mongoose';

/**
 * Starts a simple HTTP health check server
 * @param client - Discord client instance to check connection status
 */
export function startHealthServer(client: Client): void {
    const port = process.env.HEALTH_PORT ? parseInt(process.env.HEALTH_PORT) : 3000;

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        if (req.url === '/health' && req.method === 'GET') {
            handleHealthCheck(client, res);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    });

    server.listen(port, () => {
        console.log(`Health check server listening on port ${port}`);
    });

    server.on('error', (error) => {
        console.error('Health check server error:', error);
    });
}

/**
 * Handles the /health endpoint request
 * Checks Discord bot and database connectivity
 */
function handleHealthCheck(client: Client, res: ServerResponse): void {
    const discordHealthy = client.isReady();
    const dbHealthy = mongoose.connection.readyState === 1; // 1 = connected

    const isHealthy = discordHealthy && dbHealthy;

    if (isHealthy) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
    } else {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('ERROR');
    }
}

import { config as workspaceConfig } from '../../../src/config';

const requiredNames = [
    'DATABASE_URL',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_REDIRECT_URI',
] as const;

const missingNames = requiredNames.filter((name) => !process.env[name]?.trim());
if (missingNames.length) {
    throw new Error(`Missing ATC configuration: ${missingNames.join(', ')}. Copy webui/.env.example to webui/.env and fill in the Discord values.`);
}

function required(name: (typeof requiredNames)[number]): string {
    return process.env[name]!.trim();
}

function optionalHttpsUrl(name: string): string | null {
    const value = name === 'communityInviteUrl' ? workspaceConfig.communityInviteUrl?.trim() : undefined;
    if (!value) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS.`);
    return url.toString();
}

const port = Number(process.env.PORT || 4321);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be a valid TCP port.');
if (!workspaceConfig.guildId?.trim()) throw new Error('The selected constants file must define guildId for ATC.');

const production = process.env.NODE_ENV === 'production';
const botInternalApiUrl = process.env.BOT_INTERNAL_API_URL?.trim() || (production ? '' : 'http://127.0.0.1:3000');
const atcInternalApiKey = process.env.ATC_INTERNAL_API_KEY?.trim() || (production ? '' : 'development-only-atc-internal-key');
if (!botInternalApiUrl) throw new Error('BOT_INTERNAL_API_URL is required in production.');
if (!atcInternalApiKey) throw new Error('ATC_INTERNAL_API_KEY is required in production.');
if (production && atcInternalApiKey.length < 32) throw new Error('ATC_INTERNAL_API_KEY must be at least 32 characters.');
const parsedBotInternalApiUrl = new URL(botInternalApiUrl);
if (!['http:', 'https:'].includes(parsedBotInternalApiUrl.protocol)) {
    throw new Error('BOT_INTERNAL_API_URL must use HTTP or HTTPS.');
}

export const config = {
    databaseUrl: required('DATABASE_URL'),
    discordClientId: required('DISCORD_CLIENT_ID'),
    discordClientSecret: required('DISCORD_CLIENT_SECRET'),
    discordRedirectUri: required('DISCORD_REDIRECT_URI'),
    discordGuildId: workspaceConfig.guildId,
    discordInviteUrl: optionalHttpsUrl('communityInviteUrl'),
    secureCookies: process.env.SESSION_COOKIE_SECURE === 'true' || production,
    appealTermsDelayMs: production ? 30_000 : 0,
    botInternalApiUrl: parsedBotInternalApiUrl.toString().replace(/\/$/, ''),
    atcInternalApiKey,
    host: process.env.HOST?.trim() || '0.0.0.0',
    port,
};

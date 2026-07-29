import type { BotWorkspaceConfig } from './types';

/**
 * Template for local / personal Discord workspaces.
 *
 * Setup:
 *   1. Copy this file to `dev.ts` (same folder):
 *        cp src/config/dev.example.ts src/config/dev.ts
 *   2. Replace placeholder snowflakes with your server's channel/role IDs
 *   3. `npm run dev` loads `dev.ts` by default (CONSTANTS_FILE=dev)
 *
 * Override anytime:
 *   CONSTANTS_FILE=dfd-discord npm run dev
 *
 * `dev.ts` is gitignored — never commit real personal IDs.
 */
const dev: BotWorkspaceConfig = {
    name: 'dev',
    guildId: '000000000000000000',
    prefix: '.',

    channels: {
        announcements: '000000000000000000',
        botMessages: '000000000000000000',
        commands: '000000000000000000',
        events: '000000000000000000',
        faq: '000000000000000000',
        info: '000000000000000000',
        logs: '000000000000000000', // audit-logs
        modLogs: '000000000000000000', // mod-logs
        honeypot: '000000000000000000',
        management: '000000000000000000',
        memberArrivals: '000000000000000000',
        memberCounter: '000000000000000000',
        memberDepartures: '000000000000000000',
        memberMedia: '000000000000000000',
        memberResources: '000000000000000000',
        progress: '000000000000000000',
        qAndA: '000000000000000000',
        roles: '000000000000000000',
        suggestions: '000000000000000000',
    },

    roles: {
        management: '000000000000000000',
        moderator: '000000000000000000',
        developer: '000000000000000000',
        contributor: '000000000000000000',
        verifiedPilot: '000000000000000000',
        providers: '000000000000000000',
        contentCreator: '000000000000000000',
        serverBooster: '000000000000000000',
        announcements: '000000000000000000',
        progress: '000000000000000000',
        events: '000000000000000000',
        member: '000000000000000000',
    },

    roleGroups: {
        projectTeam: [],
        moderation: [],
        team: [],
        dfd: [],
    },

    emojis: {
        announcement: '📣',
        progress: '❕',
        events: '✈',
    },

    // Rotating presence (type = playing | watching | listening | competing | custom)
    presence: {
        intervalMs: 45_000,
        statuses: [
            { name: 'dev workspace', type: 'watching' },
            { name: '.devchannels', type: 'listening' },
            { name: 'with constants', type: 'playing' },
        ],
    },
};

export default dev;

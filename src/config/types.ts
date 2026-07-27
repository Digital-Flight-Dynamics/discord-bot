/**
 * Workspace-specific constants (guild snowflakes, roles, channels, etc.).
 * App-wide things (embed palette, command categories) live elsewhere.
 */

/** Discord activity "prefix" shown before the status text. */
export type PresenceActivityType =
    | 'playing'
    | 'watching'
    | 'listening'
    | 'competing'
    | 'custom';

/** One rotating presence entry. */
export type PresenceStatusEntry = {
    /** Activity text, e.g. "the A350X" → "Watching the A350X" */
    name: string;
    /** Activity type / prefix. Defaults to "playing". */
    type?: PresenceActivityType;
    /** Online status for this entry. Defaults to "online". */
    status?: 'online' | 'idle' | 'dnd' | 'invisible';
};

export type PresenceConfig = {
    /** How long each status stays before rotating (ms). Default 60_000. */
    intervalMs?: number;
    /** Entries to cycle through. Empty / omitted → no custom activity. */
    statuses: PresenceStatusEntry[];
};

export type BotWorkspaceConfig = {
    /** Short name of this file, e.g. "dfd-discord" or "dev" */
    name: string;

    /** Optional primary guild id (migrations / expiry fallback) */
    guildId?: string;

    /** Command prefix, e.g. "." */
    prefix: string;

    /**
     * Rotating bot presence (ignored while soft-locked — DND only).
     * Optional; omit or leave statuses empty for no rotation.
     */
    presence?: PresenceConfig;

    channels: {
        announcements: string;
        botMessages: string;
        /** Channel members should use for bot commands */
        commands: string;
        events: string;
        faq: string;
        info: string;
        /**
         * Audit log channel — message/role/channel edits, Discord ban events, etc.
         * Bootstrap name: audit-logs
         */
        logs: string;
        /**
         * Moderation punishments log — warns, kicks, bans, timeouts.
         * Bootstrap name: mod-logs
         */
        modLogs: string;
        management: string;
        memberArrivals: string;
        memberCounter: string;
        memberDepartures: string;
        memberMedia: string;
        memberResources: string;
        progress: string;
        qAndA: string;
        roles: string;
        suggestions: string;
    };

    roles: {
        management: string;
        moderator: string;
        developer: string;
        contributor: string;
        verifiedPilot: string;
        providers: string;
        contentCreator: string;
        serverBooster: string;
        announcements: string;
        progress: string;
        events: string;
        /** Auto-assigned on join */
        member: string;
    };

    /**
     * Role id groups used for permission-ish checks.
     * `projectTeam` gates commands in the Q&A channel.
     */
    roleGroups: {
        projectTeam: string[];
        moderation: string[];
        team: string[];
        dfd: string[];
    };

    emojis: {
        announcement: string;
        progress: string;
        events: string;
    };
};

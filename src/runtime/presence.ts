import { ActivityType, Client, type ActivitiesOptions, type PresenceStatusData } from 'discord.js';
import type { PresenceActivityType, PresenceConfig, PresenceStatusEntry } from '../config/types';
import { isSoftLocked } from './softLock';

const DEFAULT_INTERVAL_MS = 60_000;

type BotActivityType =
    | ActivityType.Playing
    | ActivityType.Streaming
    | ActivityType.Listening
    | ActivityType.Watching
    | ActivityType.Competing;

function toActivityType(type: PresenceActivityType | undefined): BotActivityType {
    switch ((type || 'playing').toLowerCase()) {
        case 'watching':
            return ActivityType.Watching;
        case 'listening':
            return ActivityType.Listening;
        case 'competing':
            return ActivityType.Competing;
        case 'custom':
            // Custom is poorly supported for bots; fall back to Playing
            return ActivityType.Playing;
        case 'playing':
        default:
            return ActivityType.Playing;
    }
}

function entryToActivity(entry: PresenceStatusEntry): ActivitiesOptions {
    return {
        name: entry.name || '-',
        type: toActivityType(entry.type),
    };
}

function applySoftLockPresence(client: Client): void {
    if (!client.user) return;
    client.user.setPresence({
        status: 'dnd',
        activities: [{ name: '-', type: ActivityType.Playing }],
        afk: false,
    });
    client.user.setStatus('dnd');
}

function applyEntry(client: Client, entry: PresenceStatusEntry): void {
    if (!client.user) return;
    const status = (entry.status || 'online') as PresenceStatusData;
    client.user.setPresence({
        status,
        activities: [entryToActivity(entry)],
        afk: false,
    });
    client.user.setStatus(status);
}

/**
 * Start rotating presence from workspace config.
 * Soft-lock forces DND + "-" and pauses rotation until unlocked (restart).
 */
export function startPresenceRotation(client: Client, presence: PresenceConfig | undefined): void {
    const applyOnce = () => {
        if (!client.user) return;

        if (isSoftLocked()) {
            applySoftLockPresence(client);
            return;
        }

        const statuses = presence?.statuses?.filter((s) => s?.name?.trim()) ?? [];
        if (statuses.length === 0) {
            client.user.setPresence({
                status: 'online',
                activities: [{ name: '-', type: ActivityType.Playing }],
                afk: false,
            });
            client.user.setStatus('online');
            return;
        }

        // Single entry — set once, no interval needed for variety
        applyEntry(client, statuses[0]);
    };

    // Immediate + delayed re-apply (Discord often drops first presence on ready)
    applyOnce();
    setTimeout(applyOnce, 1500);

    const statuses = presence?.statuses?.filter((s) => s?.name?.trim()) ?? [];
    if (statuses.length <= 1) return;

    const intervalMs = Math.max(10_000, presence?.intervalMs ?? DEFAULT_INTERVAL_MS);
    let index = 0;

    setInterval(() => {
        if (!client.user) return;
        if (isSoftLocked()) {
            applySoftLockPresence(client);
            return;
        }
        index = (index + 1) % statuses.length;
        applyEntry(client, statuses[index]);
    }, intervalMs);
}

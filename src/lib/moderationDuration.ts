export const MAX_DISCORD_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
export const MAX_PURGE_SECONDS = 7 * 24 * 60 * 60;
/** Longer temporary sanctions should be recorded as permanent and resolved manually. */
export const MAX_TEMPORARY_MODERATION_MS = 10 * 365 * 24 * 60 * 60 * 1000;

export function formatDurationMs(ms: number): string {
    const units = [
        { label: 'day', ms: 86_400_000 },
        { label: 'hour', ms: 3_600_000 },
        { label: 'minute', ms: 60_000 },
    ];
    for (const unit of units) {
        const value = Math.round(ms / unit.ms);
        if (value >= 1) return `${value} ${unit.label}${value === 1 ? '' : 's'}`;
    }
    return 'Less than 1 minute';
}

export function formatDeleteMessageWindow(seconds: number): string {
    if (seconds % 86400 === 0) return `${seconds / 86400}d`;
    if (seconds % 3600 === 0) return `${seconds / 3600}h`;
    if (seconds % 60 === 0) return `${seconds / 60}m`;
    return `${seconds}s`;
}

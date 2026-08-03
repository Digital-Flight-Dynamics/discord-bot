import { moderationActionUrl } from './moderationFormat';

export const MAX_REASON_LENGTH = 1000;
export const MAX_PRIVATE_NOTE_LENGTH = 1000;
export const MAX_MODERATION_DISPLAY_LENGTH = 280;
export const MAX_EMBED_FIELD_LENGTH = 1024;

export function limitModerationText(value: string, max: number): string {
    return value.trim().slice(0, max);
}

/** Keep Discord embeds valid while preserving a link to the full case on ATC. */
export function moderationTextForEmbed(value: string | null | undefined, actionId: string, max = MAX_MODERATION_DISPLAY_LENGTH): string {
    const text = value?.trim() || 'None';
    if (text.length <= max) return text;
    const suffix = `….\n\n[More on ATC](${moderationActionUrl(actionId)})`;
    if (suffix.length >= max) return suffix.slice(0, max);
    return `${text.slice(0, Math.max(0, max - suffix.length))}${suffix}`;
}

import { EmbedBuilder, EmbedData } from 'discord.js';

/**
 * Shared embed palette.
 *
 * - PENDING  — #191308; action awaiting moderator confirmation
 * - SUCCESS  — green; completed cleanly
 * - WARNING  — yellow; succeeded but auto/timeout, partial, or needs attention
 * - FAILURE  — red; error / could not complete
 * - DFD_BLUE — default informational embeds (brand)
 */
export const EmbedColors = {
    PENDING: 0x191308,
    SUCCESS: 0x22c55e,
    WARNING: 0xeab308,
    FAILURE: 0xef4444,
    DFD_BLUE: 0x07a7b9,
} as const;

export type EmbedColorName = keyof typeof EmbedColors;

/** Default brand color for normal/info embeds. */
export const color = EmbedColors.DFD_BLUE;

/** Pick result color for moderation outcomes. */
export function resultEmbedColor(opts: { timedOut?: boolean; partial?: boolean; failed?: boolean }): number {
    if (opts.failed) return EmbedColors.FAILURE;
    if (opts.partial || opts.timedOut) return EmbedColors.WARNING;
    return EmbedColors.SUCCESS;
}

export const createEmbed = (options: EmbedData, timestamp?: boolean) => {
    const embed = new EmbedBuilder({ color: EmbedColors.DFD_BLUE, ...options });
    if (timestamp) embed.setTimestamp();
    return embed;
};

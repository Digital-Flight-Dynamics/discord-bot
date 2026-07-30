import { CommandCategories, CommandDefinition } from '../definitions';
import { createEmbed, EmbedColors } from '../../lib/embed';
import { CONFIG_DOCS } from '../../config/errors';
import {
    canSeeSoftLockDiagnostics,
    isSoftLocked,
    softLockSummary,
} from '../../runtime/softLock';

export const ping: CommandDefinition = {
    names: ['ping'],
    description: 'Simple latency check (available in soft-lock).',
    category: CommandCategories.GENERAL,
    execute: async (message) => {
        const showLockDetail = isSoftLocked() && canSeeSoftLockDiagnostics(message.member);
        const lockHint = showLockDetail ? `\nSoft-locked — ${softLockSummary()}. See ${CONFIG_DOCS}.` : '';

        const sent = await message
            .reply({
                embeds: [
                    createEmbed({
                        color: EmbedColors.DFD_BLUE,
                        title: 'Pong',
                        description: showLockDetail
                            ? `Soft-locked — ${softLockSummary()}. See ${CONFIG_DOCS}.`
                            : 'Online.',
                    }),
                ],
            })
            .catch(console.error);

        if (!sent) return;
        const latency = sent.createdTimestamp - message.createdTimestamp;
        await sent
            .edit({
                embeds: [
                    createEmbed({
                        color: showLockDetail ? EmbedColors.WARNING : EmbedColors.SUCCESS,
                        title: 'Pong',
                        description: `Round-trip ~**${latency}ms**${lockHint}`,
                    }),
                ],
            })
            .catch(console.error);
    },
};

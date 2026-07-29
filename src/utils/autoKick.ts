import Discord from 'discord.js';
import { color } from '../index';
import { UtilDefinition } from '.';
import { captureIdentitySnapshot } from '../db/repositories/snapshots';
import { createKick, deleteKickById } from '../db/repositories/kicks';
import { discordAuditReason } from '../lib/moderationFormat';

const BLACKLIST = [
    'csgo',
    'cs:go',
    'cs go',
    'steam',
    'stearn',
    'kinfe',
    'knife',
    'skins',
    'giveaway',
    'free',
    'nitro',
    'discord',
    'discorcl',
    'gift',
    'first',
];

export const autoKick: UtilDefinition = {
    event: 'messageCreate',
    execute: async (message: Discord.Message) => {
        if (message.channel.type === Discord.ChannelType.DM) return;
        if (!(message.content.includes('@everyone') && !message.member.permissions.has(Discord.PermissionFlagsBits.MentionEveryone))) return;

        const member = message.guild.members.cache.get(message.author.id);

        const linked = message.guildId
            ? {
                  linkedMessageId: message.id,
                  linkedChannelId: message.channelId,
                  linkedMessageUrl: `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`,
                  linkedMessageDeleted: true,
              }
            : null;

        await message.delete().catch(console.error);

        const dmEmbed = new Discord.EmbedBuilder()
            .setColor(color)
            .setTitle(`Kicked from ${message.guild.name}`)
            .addFields(
                { name: 'Reason', value: 'Kicked as a precaution - potential scam', inline: true },
                { name: 'Moderator', value: 'Automated Kick', inline: true },
            );

        let shouldKick = false;
        for (const word of BLACKLIST) {
            if (message.content.includes(word)) {
                shouldKick = true;
            }
        }
        if (!shouldKick) return;

        try {
            const subjectSnap = await captureIdentitySnapshot({ member, user: member.user });
            const row = await createKick({
                guildId: message.guild.id,
                subjectSnapshotId: subjectSnap.id,
                moderatorSnapshotId: null,
                reason: 'Kicked as a precaution - potential scam',
                linked,
                isAutomated: true,
            });
            await member.user.send({ embeds: [dmEmbed] }).catch(console.error);
            try {
                await member.kick(
                    discordAuditReason(
                        row.actionId || row.id,
                        message.client.user.username,
                        message.client.user.id,
                        'Kicked as a precaution - potential scam',
                    ),
                );
            } catch (err) {
                await deleteKickById(row.id).catch(console.error);
                throw err;
            }
        } catch (err) {
            console.error('autoKick failed:', err);
        }
    },
};

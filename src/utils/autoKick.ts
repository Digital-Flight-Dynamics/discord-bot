import Discord from 'discord.js';
import { color } from '../index';
import { UtilDefinition } from '.';
import { captureIdentitySnapshot } from '../db/repositories/snapshots';
import { createKick } from '../db/repositories/kicks';

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

        await member.user.send({ embeds: [dmEmbed] }).catch(console.error);
        await member.kick('Automated kick - potential scam').catch(console.error);

        try {
            const subjectSnap = await captureIdentitySnapshot({ member, user: member.user });
            await createKick({
                guildId: message.guild.id,
                subjectSnapshotId: subjectSnap.id,
                moderatorSnapshotId: null,
                reason: 'Kicked as a precaution - potential scam',
                linked,
                isAutomated: true,
            });
        } catch (err) {
            console.error('autoKick DB record failed:', err);
        }
    },
};

/* eslint-disable max-len */
import { CommandDefinition } from '../index';
import { CommandCategories } from '../../constants';
import { createEmbed } from '../../lib/embed';

export const rules: CommandDefinition = {
    names: ['rules'],
    description: 'Displays an embed with the rules for the Discord server',
    category: CommandCategories.MODERATION,
    permissions: ['ManageGuild'],
    execute: async (message, args) => {
        const embed = createEmbed({
            title: 'Server Rules',
            description:
                '1. Treat everyone in the server with respect. Any harassment, hate speech, racism, etc. will not be tolerated.\n' +
                '2. Self promotion is only allowed in <#808791551319867502>. To get write access to the channel, you must be a content creator.\n' +
                '3. Keep everything SFW. If we see anything that is NSFW, it will be deleted and you will be banned.\n' +
                '4. Anything involving piracy is strictly forbidden. If you are found discussing piracy and/or pirating software, you will be banned permanently.\n' +
                '5. If you join this server with the intention of trolling/spamming, you will be permanently banned.\n' +
                '6. You must follow Discord ToS and Community Guidelines. More at https://discord.com/terms & https://discord.com/guidelines.\n' +
                'If you see anything that is against the rules, please let our staff know.',
        });
        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};

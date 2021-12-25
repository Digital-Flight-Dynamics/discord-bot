import { client } from '../../index';
import { CommandCategories, CommandDefinition } from '../index';

export const sticky: CommandDefinition = {
    names: ['sticky'],
    description: 'Creates a sticky message in the current channel. Usage: `.sticky <content>`',
    category: CommandCategories.MODERATION,
    permissions: ['MANAGE_MESSAGES'],
    execute: async (message, args) => {
        const content = args.join(' ');
        const stickyChannel = message.channel;

        let lastSticky = await message.channel.send(content);

        client.on('messageCreate', async (msg) => {
            stickyChannel.messages.fetch({ limit: 1 }).then(async (messages) => {
                const lastMessage = messages.first();

                if (lastMessage.content !== content) {
                    await lastSticky.delete().catch((err) => console.log(err));
                    lastSticky = await message.channel.send(content);
                }
            });
        });
    },
};

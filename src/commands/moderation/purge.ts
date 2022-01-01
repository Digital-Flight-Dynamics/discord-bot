import Discord from 'discord.js';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { color } from '../..';

export const purge: CommandDefinition = {
    names: ['purge', 'clear'],
    description: 'Clears the desired amount of messages. Usage: `.purge | .clear amount`',
    category: CommandCategories.MODERATION,
    permissions: ['MANAGE_MESSAGES'],
    execute: async (message, args) => {
        const amount = parseInt(args[0]);

        if (!amount || Number.isNaN(amount)) {
            await message.channel
                .send({
                    embeds: [createErrorEmbed('Please enter a valid number')],
                })
                .catch(console.error);
            return;
        }

        if (amount > 100) {
            await message.channel
                .send({
                    embeds: [createErrorEmbed('Amount must be less than or equal to 100')],
                })
                .catch(console.error);
            return;
        }

        if (amount < 1) {
            await message.channel
                .send({
                    embeds: [createErrorEmbed('Amount must be greater than 0')],
                })
                .catch(console.error);
            return;
        }

        let error = false;

        let amountDeleted = 0;

        await message.delete();
        await message.channel.messages
            .fetch({ limit: amount })
            .then((msgs) => {
                (message.channel as Discord.TextChannel).bulkDelete(msgs);
                amountDeleted = msgs.size;
            })
            .catch(async (err) => {
                console.error(err);
                error = true;

                if (err.toString().includes('You can only bulk delete messages that are under 14 days old')) {
                    await message.channel
                        .send({
                            embeds: [createErrorEmbed('You can only bulk delete messages that are less than 2 weeks old')],
                        })
                        .then((msg) => {
                            setTimeout(async () => {
                                await msg.delete().catch(console.error);
                            }, 3000);
                        })
                        .catch(console.error);
                }
            });

        if (error) return;

        const embed = new Discord.MessageEmbed().setColor(color).setTitle('Purged Messages').setDescription(`${amountDeleted} message(s) have been deleted`);
        await message.channel
            .send({ embeds: [embed] })
            .then((msg) => {
                setTimeout(() => {
                    msg.delete().catch(console.error);
                }, 3000);
            })
            .catch(console.error);
    },
};

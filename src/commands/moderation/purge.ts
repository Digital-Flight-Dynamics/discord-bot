import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../..';

export const purge: CommandDefinition = {
    names: ['purge', 'clear'],
    description: 'Clears the desired amount of messages. Usage: `.purge,clear 100` (Amount must be between 1-100)',
    category: CommandCategories.MODERATION,
    permissions: ['MANAGE_MESSAGES'],
    execute: async (message, args) => {
        const amount = parseInt(args[0]);

        if (!amount || Number.isNaN(amount)) {
            await message.channel
                .send({
                    embeds: [new Discord.MessageEmbed().setColor('#FF0000').setTitle('Error').setDescription('Please enter a valid number')],
                })
                .catch((err) => console.error(err));
            return;
        }

        if (amount > 100) {
            await message.channel
                .send({
                    embeds: [new Discord.MessageEmbed().setColor('#FF0000').setTitle('Error').setDescription('Please enter a number less than or equal to 100')],
                })
                .catch((err) => console.error(err));
            return;
        }

        if (amount < 1) {
            await message.channel
                .send({
                    embeds: [new Discord.MessageEmbed().setColor('#FF0000').setTitle('Error').setDescription('Please enter a number greater than 0')],
                })
                .catch((err) => console.error(err));
            return;
        }

        let error = false;

        await message.delete();
        await message.channel.messages
            .fetch({ limit: amount })
            .then((msgs) => (message.channel as Discord.TextChannel).bulkDelete(msgs))
            .catch(async (err) => {
                console.error(err);
                error = true;

                if (err.toString().includes('You can only bulk delete messages that are under 14 days old')) {
                    await message.channel
                        .send({
                            embeds: [new Discord.MessageEmbed().setColor('#FF0000').setTitle('Error').setDescription('You can only bulk delete messages that are less than 2 weeks old')],
                        })
                        .then((msg) => {
                            setTimeout(async () => {
                                await msg.delete().catch((err) => console.error(err));
                            }, 3000);
                        })
                        .catch((err) => console.error(err));
                }
            });

        if (error) return;

        const embed = new Discord.MessageEmbed().setColor(color).setTitle('Purge Messages').setDescription(`${amount} message(s) have been deleted`);
        await message.channel
            .send({ embeds: [embed] })
            .then((msg) => {
                setTimeout(() => {
                    msg.delete().catch((err) => console.error(err));
                }, 3000);
            })
            .catch((err) => console.error(err));
    },
};

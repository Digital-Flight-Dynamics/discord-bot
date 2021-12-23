import Discord from 'discord.js';
import { CommandCategories, CommandDefinition, commands } from '../index';
import { color } from '../../index';

export const help: CommandDefinition = {
    names: ['help'],
    description: 'Gives an overview of all available commands',
    category: CommandCategories.GENERAL,
    execute: async (message, args) => {
        let category = args[0];

        if (!category) {
            const rootEmbed = new Discord.MessageEmbed()
                .setColor(color)
                .setTitle('Command Categories')
                .addFields(
                    { name: 'A350X', value: 'Commands related to the A350X project' },
                    { name: 'General', value: 'Generic commands' },
                    { name: 'Moderation', value: 'Commands used by staff' },
                );
            await message.channel.send({ embeds: [rootEmbed] });

            return;
        }

        category = category.toUpperCase();

        const embed = new Discord.MessageEmbed().setColor(color);

        const cmds = [];

        for (const command of commands) {
            if (command.category.toUpperCase() === category) {
                cmds.push(command);
                embed.setTitle(`${command.category}`);
            }
        }

        const fields = [];

        for (const cmd of cmds) {
            fields.push({ name: `.${cmd.names}`, value: `${cmd.description}` });
        }

        embed.addFields(fields);

        await message.channel.send({ embeds: [embed] }).catch((err) => console.log(err));
    },
};

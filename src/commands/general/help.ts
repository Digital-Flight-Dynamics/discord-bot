import Discord from 'discord.js';
import { CommandCategories, CommandDefinition, commands } from '../index';
import { color } from '../../index';

export const help: CommandDefinition = {
    names: ['help'],
    description: 'Gives an overview of all available commands',
    category: CommandCategories.GENERAL,
    execute: async (message, args) => {
        let category = args.join(' ');

        if (!category) {
            const rootEmbed = new Discord.MessageEmbed()
                .setColor(color)
                .setTitle('Command Categories')
                .addFields(
                    { name: 'A350X', value: 'Commands related to the A350X project' },
                    { name: 'General', value: 'Generic commands that can be used by anyone' },
                    { name: 'Fun', value: 'Commands that exist just for fun' },
                    { name: 'Moderation', value: 'Commands used by staff' },
                );
            await message.channel.send({ embeds: [rootEmbed] }).catch(console.error);

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

        if (cmds.length === 0) return;

        const fields = [];
        for (const cmd of cmds) {
            if (!cmd.permissions) fields.push({ name: `.${cmd.names.join(' | .')}`, value: `${cmd.description}` });
            else fields.push({ name: `.${cmd.names.join(' | .')}\n\`Required Permissions: ${cmd.permissions.join(', ')}\``, value: `${cmd.description}` });
        }

        embed.addFields(fields);

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};

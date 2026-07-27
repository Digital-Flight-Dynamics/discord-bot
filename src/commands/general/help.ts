import { APIEmbedField } from 'discord.js';
import { CommandCategories, CommandDefinition, commands } from '../index';
import { createEmbed } from '../../lib/embed';

function canSeeCommand(messageMember: Parameters<CommandDefinition['execute']>[0]['member'], command: CommandDefinition): boolean {
    if (!command.permissions) return true;
    return Boolean(messageMember?.permissions.has(command.permissions));
}

export const help: CommandDefinition = {
    names: ['help'],
    description: 'Gives an overview of all available commands',
    category: CommandCategories.GENERAL,
    execute: async (message, args) => {
        let category = args.join(' ');

        if (!category) {
            const categoryFields = [
                { name: 'A350X', value: 'Commands related to the A350X project' },
                { name: 'General', value: 'Generic commands that can be used by anyone' },
                { name: 'Fun', value: 'Commands that exist just for fun' },
                { name: 'Moderation', value: 'Commands used by staff' },
                { name: 'Support', value: 'Commands used for support purposes' },
            ].filter((field) =>
                commands.some(
                    (command) =>
                        command.category.toUpperCase() === field.name.toUpperCase() &&
                        canSeeCommand(message.member, command),
                ),
            );

            const rootEmbed = createEmbed({
                title: 'Command Categories',
                fields: categoryFields,
            });
            await message.channel.send({ embeds: [rootEmbed] }).catch(console.error);

            return;
        }

        category = category.toUpperCase();

        let embedTitle: string;

        const cmds: CommandDefinition[] = [];
        for (const command of commands) {
            if (command.category.toUpperCase() === category && canSeeCommand(message.member, command)) {
                cmds.push(command);
                embedTitle = `${command.category}`;
            }
        }

        if (cmds.length === 0) return;

        const fields: APIEmbedField[] = [];
        for (const cmd of cmds) {
            if (!cmd.permissions) fields.push({ name: `.${cmd.names.join(' | .')}`, value: `${cmd.description}` });
            else
                fields.push({
                    name: `.${cmd.names.join(' | .')}\n\`Required Permissions: ${cmd.permissions.join(', ')}\``,
                    value: `${cmd.description}`,
                });
        }

        const embed = createEmbed({
            title: embedTitle,
            fields,
        });

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};

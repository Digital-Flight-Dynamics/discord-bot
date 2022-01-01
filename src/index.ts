import Discord from 'discord.js';
import { commands } from './commands';
import logs from './logging';
import { AutoKick } from './utils/AutoKick';
import { MemberCounter } from './utils/MemberCounter';
import { ReactionRoles } from './utils/ReactionRoles';

require('dotenv').config();

const intents = new Discord.Intents(32767);
const client = new Discord.Client({
    partials: ['USER', 'CHANNEL', 'GUILD_MEMBER', 'MESSAGE', 'REACTION'],
    intents,
});

export const color = '#18B1AB';
const prefix = '.';

client.once('ready', () => {
    console.log('Bot is logged in!');

    MemberCounter(client);
});

// logs are disabled for now
/* for (const startLog of logs) {
    startLog(client);
} */

ReactionRoles(client);

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const isDm = message.channel.type === 'DM';
    const isCommand = message.content.startsWith(prefix);

    if (isDm) {
        console.log(`DM sent by ${message.author.tag}`);
        const dm = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('Message Received')
            .addFields({ name: 'User', value: `${message.author.tag}` }, { name: 'Content', value: `${message.content}` });
        await client.users
            .fetch('726974755151806465')
            .then((u) => u.send({ embeds: [dm] }))
            .catch(console.error);

        return;
    }

    AutoKick(message);

    if (isCommand) {
        const commandUsed = message.content.substring(1).toLowerCase().split(' ')[0];
        const args = message.content.split(' ').slice(1);

        let cmdToExec = undefined;
        let hasPerms = true;

        for (const command of commands) {
            for (const name of command.names) {
                if (commandUsed === name) {
                    cmdToExec = command;
                    if (!command.permissions) hasPerms = true;
                    else hasPerms = message.member.permissions.has(command.permissions);
                }
            }
        }

        if (!hasPerms) {
            await message.channel
                .send({
                    embeds: [new Discord.MessageEmbed().setColor('#FF0000').setTitle('Error').setDescription('You do not have the required permissions to use that command')],
                })
                .catch(console.error);
            return;
        }

        try {
            await cmdToExec.execute(message, args).catch(console.error);
            console.log(`Successfully ran command "${message.content}" by ${message.author.tag} in #${message.channel.name}`);
        } catch (error) {
            console.log(`Failed to run command "${message.content}" by ${message.author.tag} in #${message.channel.name}. ${error}`);
        }
    }
});

client.on('guildMemberAdd', async (member) => {
    const memberRole = await member.guild.roles.fetch('808792283515191326').catch(console.error);
    const arrivals = await member.guild.channels.fetch('808793231621750815').catch(console.error);

    if (!arrivals) {
        console.error('Error: User joined, but failed to find channel #arrivals. Returning...');
        return;
    }
    if (!memberRole) {
        console.error('Error: User joined, but failed to find role "Member". Returning...');
        return;
    }

    if (!arrivals.isText()) return;

    await arrivals.send(`Hello ${member.user}, welcome to ${member.guild}!`).catch(console.error);
    await member.roles.add(memberRole);
});
client.on('guildMemberRemove', async (member) => {
    const leaves = await member.guild.channels.fetch('814292355661299713').catch(console.error);

    if (!leaves) {
        console.error('Error: User left, but failed to find channel #leaves. Returning...');
        return;
    }

    if (!leaves.isText()) return;

    await leaves.send(`**${member.user.tag}** just left the server`).catch(console.error);
});

client.login(process.env.token).catch(console.error);

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

for (const startLog of logs) {
    startLog(client);
}

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
            .catch((err) => console.error(err));

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
                .catch((err) => console.error(err));
            return;
        }

        try {
            await cmdToExec.execute(message, args).catch((err) => console.error(err));
            console.log(`Successfully ran command "${message.content}" by ${message.author.tag} in #${message.channel.name}`);
        } catch (error) {
            console.log(`Failed to run command "${message.content}" by ${message.author.tag} in #${message.channel.name}. ${error}`);
        }
    }
});

client.on('guildMemberAdd', async (member) => {
    const memberRole = member.guild.roles.cache.find((r) => r.name === 'Member');
    const arrivals = member.guild.channels.cache.find((c) => c.name === 'arrivals');

    if (!arrivals.isText()) return;

    await arrivals.send(`Hello ${member.user}, welcome to ${member.guild}!`).catch((err) => console.error(err));
    await member.roles.add(memberRole);
});
client.on('guildMemberRemove', async (member) => {
    await (member.guild.channels.cache.find((c) => c.name === 'leaves') as Discord.TextChannel).send(`**${member.user.tag}** just left the server`).catch((err) => console.error(err));
});

client.login(process.env.token).catch((err) => console.error(err));

import Discord from 'discord.js';
import { commands } from './commands';
import logs from './logging';
import { AutoKick } from './utils/AutoKick';
import { MemberCounter } from './utils/MemberCounter';

require('dotenv').config();

const intents = new Discord.Intents(32767);
const client = new Discord.Client({ partials: ['USER', 'CHANNEL', 'GUILD_MEMBER', 'MESSAGE', 'REACTION'], intents });

export const color = '#18B1AB';
const prefix = '.';

client.once('ready', () => {
    console.log('Bot is logged in!');

    MemberCounter(client);
});

for (const startLog of logs) {
    startLog(client);
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const isDm = message.channel.type === 'DM';
    const isCommand = message.content.startsWith(prefix);

    if (isDm) {
        console.log(`DM sent by ${message.author.tag}`);
        const dm = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('Message Received')
            .addFields(
                { name: 'User', value: `${message.author.tag}` },
                { name: 'Content', value: `${message.content}` },
            );
        await client.users.fetch('726974755151806465').then((u) => u.send({ embeds: [dm] }));

        return;
    }

    AutoKick(message);

    if (isCommand) {
        const commandUsed = message.content.substring(1).toLowerCase().split(' ')[0];
        const args = message.content.split(' ').slice(1);

        for (const command of commands) {
            for (const name of command.names) {
                if (commandUsed === name) {
                    if (!message.member.permissions.has(command.permissions)) {
                        message.channel.send({
                            embeds: [
                                new Discord.MessageEmbed()
                                    .setColor('#FF0000')
                                    .setTitle('Error')
                                    .setDescription('You do not have the required permissions to use that command'),
                            ],
                        });
                        return;
                    }

                    try {
                        command.execute(message, args);
                        console.log(
                            `Successfully ran command "${message.content}" by ${message.author.tag} in #${message.channel.name}`,
                        );
                    } catch (error) {
                        console.log(
                            `Failed to run command "${message.content}" by ${message.author.tag} in #${message.channel.name}. ${error}`,
                        );
                    }
                }
            }
        }
    }
});

client.on('guildMemberAdd', async (member) => {
    await (member.guild.channels.cache.find((c) => c.name === 'arrivals') as Discord.TextChannel).send(
        `Hello ${member.user}, welcome to ${member.guild}!`,
    );
});
client.on('guildMemberRemove', async (member) => {
    await (member.guild.channels.cache.find((c) => c.name === 'leaves') as Discord.TextChannel).send(
        `**${member.user.tag}** just left the server`,
    );
});

client.login(process.env.token);

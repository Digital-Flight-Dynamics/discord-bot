import Discord, { Client, Partials, GatewayIntentBits } from 'discord.js';
import { connect } from 'mongoose';
import dotenv from 'dotenv';
import { commands } from './commands';
import { createEmbed } from './lib/embed';
import logs from './logging';
import utils from './utils';

dotenv.config();

const client = new Client({
    partials: [Partials.User, Partials.Channel, Partials.GuildMember, Partials.Message, Partials.Reaction],
    intents: Object.keys(GatewayIntentBits).map((a) => {
        return GatewayIntentBits[a];
    }),
});

export const color = 0x18b1ab;
const prefix = '.';

client.on('ready', (client) => {
    console.log(`Bot is logged in as "${client.user.tag}"!`);
});

for (const log of logs) {
    client.on(log.event, log.execute);
}
for (const util of utils) {
    client.on(util.event, util.execute);
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const isDm = message.channel.type === Discord.ChannelType.DM;
    const isCommand = message.content.startsWith(prefix);

    // log all DMs which are sent to the bot
    if (isDm) {
        console.log(`DM sent by ${message.author.tag}`);
        const dmCh = client.guilds.cache.at(0).channels.cache.find((c) => c.name === 'bot-dms') as Discord.TextChannel;
        if (!dmCh) return;

        const embed = createEmbed({
            title: 'Message Received',
            fields: [
                { name: 'User', value: `${message.author.tag}` },
                { name: 'Content', value: `${message.content}` },
            ],
        });

        await dmCh.send({ embeds: [embed] }).catch(console.error);
        return;
    }

    if (!isCommand) return;

    const commandUsed = message.content.substring(1).toLowerCase().split(' ')[0];
    const args = message.content.split(' ').slice(1);

    let cmdToExec = undefined;
    let hasPerms = true;

    // find the command, and check if the user has the required permissions
    for (const command of commands) {
        for (const name of command.names) {
            if (commandUsed === name) {
                cmdToExec = command;
                if (!command.permissions) hasPerms = true;
                else hasPerms = message.member.permissions.has(command.permissions);
            }
        }
    }

    // if the command is not found
    if (!cmdToExec) {
        console.error(`Failed to run command "${message.content}" by ${message.author.tag} in #${message.channel.name}. Command was not found.`);
        return;
    }

    // if the user does not have the required permissions
    if (!hasPerms) {
        await message.channel
            .send({
                embeds: [
                    new Discord.EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('Error')
                        .setDescription('You do not have the required permissions to use that command'),
                ],
            })
            .catch(console.error);
        return;
    }

    // if the channel is QA channel and user isn't a contributor+
    const projectTeamRoles = [ //TODO env this
        '826583070421286952', // contributor
        '808792308287537192', // dev
        '809149811357777920', // mod
        '808792384112558100'  // management
    ];

    if (message.channel.id === "808791475206094928") { //#q-and-a
        if (!message.member.roles.cache.some(role => projectTeamRoles.includes(role.id))) {
            await message.delete().catch(console.error);

            try {
                const dmChannel = await message.author.createDM();
                const dmMessage = await dmChannel.send({
                    embeds: [
                        new Discord.EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('Please use <#808791531427332136> for commands.'),
                    ],
                });

                setTimeout(async () => {
                    await dmMessage.delete().catch(console.error);
                }, 120000);

            } catch (error) {
                console.error(error);
            }

            return; //stop execution of cmd
        }
    }

    // attempt to execute command
    try {
        await cmdToExec.execute(message, args).catch(console.error);
        console.log(`Successfully ran command "${message.content}" by ${message.author.tag} in #${message.channel.name}`);
    } catch (error) {
        console.log(`Failed to run command "${message.content}" by ${message.author.tag} in #${message.channel.name}. ${error}`);
    }
});

client.login(process.env.BOT_TOKEN).catch(console.error);
connect(process.env.DATABASE_TOKEN)
    .then(() => console.log('Connected to the database!'))
    .catch(console.error);

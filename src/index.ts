const fs = require('fs');
const Discord = require('discord.js');
const config = require('./config.json');
require('dotenv').config();

const memberCounter = require('./utils/MemberCounter.ts');
const autoKick = require('./utils/AutoKick.ts');

const intents = new Discord.Intents(32767);
const client = new Discord.Client({ partials: ['USER', 'CHANNEL', 'GUILD_MEMBER', 'MESSAGE', 'REACTION'], intents });

client.commands = new Discord.Collection();
const commandFolders = fs.readdirSync('src/commands');

for (const folder of commandFolders) {
    const commandFiles = fs.readdirSync(`src/commands/${folder}`).filter((file) => file.endsWith('.ts'));
    for (const file of commandFiles) {
        const command = require(`./commands/${folder}/${file}`);
        client.commands.set(command.name, command);
    }
}

client.once('ready', () => {
    console.log('Bot is logged in!');

    memberCounter(client);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const isDm = message.channel.type === 'DM';
    const isCommand = message.content.startsWith(config.prefix);

    if (isDm) {
        console.log(`DM sent by ${message.author.tag}`);
        const dm = new Discord.MessageEmbed()
            .setColor(config.embedColor)
            .setTitle('Message Received')
            .addFields({ name: 'User', value: `${message.author.tag}` }, { name: 'Content', value: `${message.content}` });
        await client.users.fetch('726974755151806465').then((u) => u.send({ embeds: [dm] }));

        return;
    }

    autoKick(message);

    if (isCommand) {
        const command = message.content.substring(1).toLowerCase().split(' ')[0];
        const args = message.content.split(' ').slice(1);

        try {
            await client.commands.get(command).execute(message, args, config, client, Discord);
            console.log(`Successfully ran command "${command}" by ${message.author.tag} in #${message.channel.name}`);
        } catch (error) {
            console.log(`Failed to run command "${command}" by ${message.author.tag} in #${message.channel.name}. ${error}`);
        }
    }
});

client.on('guildMemberAdd', async (member) => {
    await member.guild.channels.cache.find((c) => c.name === 'arrivals').send(`Hello ${member.user}, welcome to ${member.guild}!`);
});
client.on('guildMemberRemove', async (member) => {
    await member.guild.channels.cache.find((c) => c.name === 'leaves').send(`**${member.user.tag}** just left the server`);
});

client.login(process.env.token);

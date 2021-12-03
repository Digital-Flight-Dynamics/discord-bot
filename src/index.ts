const fs = require('fs');
const Discord = require('discord.js');
const config = require('./config.json');

const intents = new Discord.Intents(32767);
const client = new Discord.Client({ intents });

client.commands = new Discord.Collection();
const commandFiles = fs.readdirSync('src/commands').filter((file) => file.endsWith('.ts'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.name, command);
}

const prefix = '.';

client.once('ready', () => {
    console.log('Bot is logged in!');
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const isDm = message.channel.type === 'DM';
    const isCommand = message.content.startsWith(prefix);

    if (isDm) {
        await console.log(`DM sent by ${message.author.tag}`);
        return;
    }

    if (isCommand) {
        const command = message.content.substring(1).split(' ')[0];
        const args = message.content.split(' ').slice(1);

        try {
            client.commands.get(command).execute(message, args, config, client, Discord);
            console.log(`Successfully ran command "${command}" by ${message.author.tag} in #${message.channel.name}`);
        } catch (error) {
            console.log(`Failed to run command "${command}" by ${message.author.tag}. ` + error);
            return;
        }
    }
});

client.on('guildMemberAdd', async (member) => {
    await member.guild.channels.fetch('915831623084286043').then((c) => c.send(`Hello ${member.user}, welcome to ${member.guild}!`));
    console.log(`${member.user.tag} has joined. Join message was successfully sent.`);
});
client.on('guildMemberRemove', async (member) => {
    await member.guild.channels.fetch('915832782838697986').then((c) => c.send(`**${member.user.tag}** just left the server`));
    console.log(`${member.user.tag} has left. Leave message was successfully sent.`);
});

client.login(config.token);

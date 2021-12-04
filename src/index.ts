const fs = require('fs');
const Discord = require('discord.js');
const config = require('./config.json');

const intents = new Discord.Intents(32767);
const client = new Discord.Client({ partials: ['CHANNEL'], intents });

client.commands = new Discord.Collection();
const commandFiles = fs.readdirSync('src/commands').filter((file) => file.endsWith('.ts'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.name, command);
}

client.once('ready', () => {
    console.log('Bot is logged in!');
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
            .addFields({ name: `User`, value: `${message.author.tag}` }, { name: `Content`, value: `${message.content}` });
        await client.users.fetch('726974755151806465').then((u) => u.send({ embeds: [dm] }));

        return;
    }

    if (isCommand) {
        const command = message.content.substring(1).split(' ')[0];
        const args = message.content.split(' ').slice(1);

        try {
            await client.commands.get(command).execute(message, args, config, client, Discord);
            console.log(`Successfully ran command "${command}" by ${message.author.tag} in #${message.channel.name}`);
        } catch (error) {
            console.log(`Failed to run command "${command}" by ${message.author.tag} in #${message.channel.name}. ` + error);
            return;
        }
    }
});

client.on('guildMemberAdd', async (member) => {
    await member.guild.channels.cache.find((c) => c.name === 'arrivals').send(`Hello ${member.user}, welcome to ${member.guild}!`);
    console.log(`${member.user.tag} has joined. Join message was successfully sent.`);
});
client.on('guildMemberRemove', async (member) => {
    await member.guild.channels.cache.find((c) => c.name === 'leaves').send(`**${member.user.tag}** just left the server`);
    console.log(`${member.user.tag} has left. Leave message was successfully sent.`);
});

client.login(config.token);

module.exports = async (client) => {
    const guild = client.guilds.cache.get('915789705856040991');
    setInterval(() => {
        const memberCount = guild.memberCount;
        const channel = guild.channels.cache.find((c) => c.name.includes('Member Count:'));

        channel.setName(`Member Count: ${memberCount.toLocaleString()}`);
    }, 5000);
};

export const MemberCounter = async (client) => {
    const guild = await client.guilds.fetch('915789705856040991').catch((err) => console.error(err));
    setInterval(() => {
        const { memberCount } = guild;
        const channel = guild.channels.cache.find((c) => c.name.includes('Member Count:'));

        channel.setName(`Member Count: ${memberCount.toLocaleString()}`);
    }, 5000);
};

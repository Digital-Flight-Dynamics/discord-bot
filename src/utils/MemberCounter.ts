export const MemberCounter = async (client) => {
    const guild = await client.guilds.fetch('808790838163406848').catch(console.error);
    setInterval(() => {
        const { memberCount } = guild;
        const channel = guild.channels.cache.find((c) => c.name.includes('Member Count:'));

        channel.setName(`Member Count: ${memberCount.toLocaleString()}`);
    }, 5000);
};

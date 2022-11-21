export const memberCounter = {
    event: 'ready',
    execute: (client) => {
        const guild = client.guilds.cache.first();

        if (!guild) {
            console.error('Error: Bot is not in a guild');
            return;
        }

        setInterval(async () => {
            const { memberCount } = guild;
            const channel = guild.channels.cache.find((c) => c.name.includes('Member Count:'));

            if (!channel) {
                console.error('Error: Could not find member count channel');
                return;
            }

            await channel.setName(`Member Count: ${memberCount.toLocaleString()}`);
        }, 5000);
    },
};

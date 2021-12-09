module.exports = {
    name: 'info',
    async execute(message, args, config, client, Discord) {
        if (!message.member.permissions.has('MANAGE_SERVER')) return;

        const embed = new Discord.MessageEmbed()
            .setColor(config.embedColor)
            .setTitle('Information')
            .setDescription(
                'Please read the rules before anything else.\n\nGo to <#808791055184691211> to obtain announcement/update roles.\n\nIf you are interested in working with us, please fill out this form: https://forms.gle/LigLwWizG5Etz3KeA',
            );

        await message.channel.send({ embeds: [embed] });
    },
};

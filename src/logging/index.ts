const index = require('../index.ts');
const { embedColor } = require('../config.json');

module.exports = {
    createLogEmbed(title, description, footer) {
        return new index.Discord.MessageEmbed()
            .setColor(embedColor)
            .setTitle(title)
            .setDescription(description)
            .setFooter(footer)
            .setTimestamp();
    },
};

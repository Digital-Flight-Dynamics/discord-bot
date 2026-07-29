import Discord, { Client, Partials, GatewayIntentBits, TextChannel } from 'discord.js';
import dotenv from 'dotenv';
import { commands } from './commands';
import { createEmbed, color as dfdBlue, EmbedColors } from './lib/embed';
import { channels, config, prefix, roleGroups } from './config';
import { configLoadError } from './config/load';
import { CONFIG_DOCS } from './config/errors';
import { describeConfigGaps, isConfigEmpty, logUnsetChannelConstants } from './config/validate';
import logs from './logging';
import utils from './utils';
import { startHealthServer } from './health';
import { connectDatabase, runMigrations } from './db/client';
import { startExpiryWorker } from './db/expiryWorker';
import {
    addSoftLockReason,
    canSeeSoftLockDiagnostics,
    isSoftLocked,
    SOFT_LOCK_ALLOWED_COMMANDS,
    SOFT_LOCK_REPLY_TTL_MS,
    softLockSummary,
} from './runtime/softLock';
import { startPresenceRotation } from './runtime/presence';
import { resumeStalePendingModeration } from './lib/moderationExecute';
import { registerDiscordModerationTracker } from './lib/discordModerationTracker';
import { registerModerationMessageTracker } from './lib/moderationMessageTracker';
import { handleHoneypotMessage } from './lib/honeypot';
import {
    handleModerationAutocomplete,
    handleModerationSlashCommand,
    registerModerationSlashCommands,
} from './slashModeration';

dotenv.config();

const client = new Client({
    partials: [Partials.User, Partials.Channel, Partials.GuildMember, Partials.Message, Partials.Reaction],
    // Prefer explicit intents. Privileged ones (Members, MessageContent) must be enabled
    // for the application in the Discord Developer Portal.
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
});

/** @deprecated Prefer EmbedColors / createEmbed default (DFD blue). Kept for older imports. */
export const color = dfdBlue;
export { EmbedColors };

let dbReady = false;

client.on('clientReady', (readyClient) => {
    console.log(`Bot is logged in as "${readyClient.user.tag}"!`);
    void registerModerationSlashCommands(readyClient, config.guildId);
    startPresenceRotation(readyClient, config.presence);
    startHealthServer(readyClient);
    if (dbReady) {
        startExpiryWorker(readyClient);
        // Finish any moderation actions interrupted by a restart (no private note)
        void resumeStalePendingModeration(readyClient);
    } else if (isSoftLocked()) {
        console.error(`[ERROR] Expiry worker skipped. Bot is soft-locked. Read ${CONFIG_DOCS} for details.`);
    }
});

for (const log of logs) {
    client.on(log.event, log.execute);
}
for (const util of utils) {
    client.on(util.event, util.execute);
}
registerDiscordModerationTracker(client);
registerModerationMessageTracker(client);

client.on('interactionCreate', async (interaction) => {
    if (interaction.isAutocomplete()) {
        await handleModerationAutocomplete(interaction);
        return;
    }
    if (!interaction.isChatInputCommand()) return;

    if (isSoftLocked()) {
        await interaction
            .reply({
                embeds: [
                    createEmbed({
                        color: EmbedColors.WARNING,
                        title: 'Bot soft-locked',
                        description: `${softLockSummary()}\n\nSee **${CONFIG_DOCS}** for setup.`,
                    }),
                ],
                ephemeral: true,
            })
            .catch(console.error);
        return;
    }

    try {
        const handled = await handleModerationSlashCommand(interaction);
        void handled;
    } catch (error) {
        console.error(`Failed to run slash command "/${interaction.commandName}" by ${interaction.user.tag}.`, error);
        if (interaction.replied || interaction.deferred) {
            await interaction
                .editReply({
                    embeds: [createEmbed({ color: EmbedColors.FAILURE, title: 'Error', description: 'Something went wrong.' })],
                    components: [],
                })
                .catch(console.error);
        } else {
            await interaction
                .reply({
                    embeds: [createEmbed({ color: EmbedColors.FAILURE, title: 'Error', description: 'Something went wrong.' })],
                    ephemeral: true,
                })
                .catch(console.error);
        }
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (await handleHoneypotMessage(client, message)) return;

    const isDm = message.channel.type === Discord.ChannelType.DM;
    const isCommand = message.content.startsWith(prefix);

    // log all DMs which are sent to the bot
    if (isDm) {
        if (isSoftLocked()) return;

        const guild =
            (config.guildId && client.guilds.cache.get(config.guildId)) || client.guilds.cache.at(0);
        const dmCh =
            (guild?.channels.cache.get(channels.botMessages) as TextChannel | undefined) ||
            (guild?.channels.cache.find((c) => c.name === 'bot-dms') as TextChannel | undefined);
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
    if (!message.inGuild()) return;

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
        return;
    }

    // Soft-lock: only allow a tiny allowlist (help, ping, whoosh, devchannels)
    if (isSoftLocked()) {
        const allowed = cmdToExec.names.some((n) => SOFT_LOCK_ALLOWED_COMMANDS.has(n));
        if (!allowed) {
            // Prefix commands can't be true-ephemeral — only staff get a short-lived diagnostic reply
            if (canSeeSoftLockDiagnostics(message.member)) {
                const reply = await message
                    .reply({
                        embeds: [
                            createEmbed({
                                color: EmbedColors.WARNING,
                                title: 'Bot soft-locked',
                                description:
                                    `${softLockSummary()}\n\n` +
                                    `See **${CONFIG_DOCS}** for setup.\n` +
                                    'Allowed: `.help` · `.ping` · `.whoosh` · `.devchannels`',
                                footer: { text: 'Staff only · this message auto-deletes' },
                            }),
                        ],
                    })
                    .catch(console.error);
                if (reply) {
                    setTimeout(() => {
                        reply.delete().catch(() => undefined);
                    }, SOFT_LOCK_REPLY_TTL_MS);
                }
            }
            // Non-staff: silent (no channel noise)
            return;
        }
    }

    // if the user does not have the required permissions
    if (!hasPerms) {
        await message.channel
            .send({
                embeds: [
                    new Discord.EmbedBuilder()
                        .setColor(EmbedColors.FAILURE)
                        .setTitle('Error')
                        .setDescription('You do not have the required permissions to use that command'),
                ],
            })
            .catch(console.error);
        return;
    }

    // if the channel is Q&A and user isn't project team (contributor+)
    if (!isSoftLocked() && message.channel.id === channels.qAndA) {
        if (!message.member.roles.cache.some((role) => roleGroups.projectTeam.includes(role.id))) {
            await message.delete().catch(console.error);

            try {
                const dmChannel = await message.author.createDM();
                const dmMessage = await dmChannel.send({
                    embeds: [
                        new Discord.EmbedBuilder()
                            .setColor(EmbedColors.FAILURE)
                            .setDescription(`Please use <#${channels.commands}> for commands.`),
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
    } catch (error) {
        console.error(`Failed to run command "${message.content}" by ${message.author.tag} in #${message.channel.name}.`, error);
    }
});

async function main() {
    // Config already loaded at import; assess completeness / load errors
    if (configLoadError) {
        addSoftLockReason(`Config load failed: ${configLoadError}`);
    } else if (isConfigEmpty(config)) {
        // One [ERROR] line per missing channels.* constant
        logUnsetChannelConstants(config);
        addSoftLockReason(describeConfigGaps(config) || 'Workspace constants incomplete', {
            silent: true,
        });
    }

    try {
        await connectDatabase();
        await runMigrations();
        console.log('Connected to PostgreSQL!');
        dbReady = true;
    } catch (err) {
        console.error('[ERROR] Database connection or schema ensure failed. Bot is soft-locked. Read DEVELOPMENT.md for details.');
        console.error(err);
        addSoftLockReason('Database connection or schema ensure failed', { silent: true });
        dbReady = false;
    }

    await client.login(process.env.BOT_TOKEN).catch((err) => {
        console.error('[ERROR] Discord login failed:', err);
    });
}

main().catch(console.error);

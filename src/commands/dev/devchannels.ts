import path from 'path';
import {
    ChannelType,
    Guild,
    GuildBasedChannel,
    Message,
    PermissionFlagsBits,
    PermissionsBitField,
    Role,
} from 'discord.js';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../definitions';
import { createEmbed, EmbedColors } from '../../lib/embed';
import { config, channels, roles } from '../../config';
import { isDevSetupRuntimeAllowed, isProductionConstantsFile } from '../../config/devMode';
import {
    BOOTSTRAP_CATEGORY_NAMES,
    CHANNEL_CATEGORY_BY_KEY,
    CHANNEL_DISCORD_NAMES,
    CHANNEL_KEYS,
    ChannelCategoryName,
    ChannelKey,
    isUnsetSnowflake,
} from '../../config/channelNames';
import {
    PLACEHOLDER_ID,
    clearChannelIdsInConfigFile,
    writeChannelIdsToConfigFile,
    writeRoleIdsToConfigFile,
} from '../../config/writeConfigFile';
import { resolveConfigName } from '../../config/load';

/** Show repo-relative path like `/src/config/dev.ts` (never absolute machine paths). */
function displayRepoPath(absPath: string): string {
    const rel = path.relative(process.cwd(), absPath).replace(/\\/g, '/');
    if (!rel || rel.startsWith('..')) return path.basename(absPath);
    return rel.startsWith('/') ? rel : `/${rel}`;
}

function findChannelByName(guild: Guild, name: string): GuildBasedChannel | undefined {
    const target = name.toLowerCase();
    return guild.channels.cache.find((c) => c.name.toLowerCase() === target);
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

type RoleKey = keyof typeof roles;
const PRODUCTION_GUILD_ID = '808790838163406848';

/** Deliberately redundant: this command destroys channels and writes config files. */
function canRunDevSetup(message: Message): boolean {
    return isDevSetupRuntimeAllowed({
        configName: resolveConfigName(),
        workspaceName: config.name,
        nodeEnv: process.env.NODE_ENV,
        guildId: message.guildId,
        productionGuildId: PRODUCTION_GUILD_ID,
        productionConstantsFile: isProductionConstantsFile(),
    });
}

const BOOTSTRAP_ROLE_NAMES: Record<RoleKey, string> = {
    management: 'Management',
    moderator: 'Moderator',
    developer: 'Developer',
    contributor: 'Contributor',
    verifiedPilot: 'Verified Pilot',
    providers: 'Providers',
    contentCreator: 'Content Creator',
    serverBooster: 'Server Booster',
    announcements: 'Announcements',
    progress: 'Progress',
    events: 'Events',
    member: 'Member',
};

const BOOTSTRAP_ROLE_PERMISSIONS: Partial<Record<RoleKey, bigint[]>> = {
    management: [PermissionFlagsBits.Administrator],
    moderator: [
        PermissionFlagsBits.ViewAuditLog,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.BanMembers,
    ],
    developer: [PermissionFlagsBits.ManageGuild],
    member: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
};

async function sendLoading(message: Message, title: string, description: string): Promise<Message | null> {
    const sent = await message
        .reply({
            embeds: [
                createEmbed({
                    color: EmbedColors.PENDING,
                    title,
                    description,
                }),
            ],
        })
        .catch(console.error);
    return sent || null;
}

export const devchannels: CommandDefinition = {
    names: ['devchannels', 'devsetup', 'setup'],
    description: '[dev only] Bootstrap or cleanup guild channels/roles. `Arguments: create | cleanup`',
    category: CommandCategories.MODERATION,
    requiredRoleGroup: 'developer',
    allowOwnerDuringBootstrap: true,
    silentGuard: (message) => !canRunDevSetup(message),
    execute: async (message, args) => {
        // Never acknowledge this destructive command outside an explicit dev workspace.
        if (!canRunDevSetup(message)) return;

        if (!message.guild) {
            await message.reply({ embeds: [createErrorEmbed('Guild only')] }).catch(console.error);
            return;
        }

        const me = message.guild.members.me;
        if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
            await message
                .reply({
                    embeds: [createErrorEmbed('I need **Manage Channels** in this guild')],
                })
                .catch(console.error);
            return;
        }

        const action = (args[0] || '').toLowerCase();
        if (action !== 'create' && action !== 'cleanup') {
            await message
                .reply({
                    embeds: [
                        createErrorEmbed(
                            'Usage: `.setup create` or `.setup cleanup`\n' +
                                '• **create** — match/create roles/channels from constants and write IDs to the config file\n' +
                                '• **cleanup** — delete all other channels and reset channel IDs in the constants file',
                        ),
                    ],
                })
                .catch(console.error);
            return;
        }

        if (action === 'cleanup') {
            await runCleanup(message);
            return;
        }

        await runCreate(message);
    },
};

async function ensureCategory(guild: Guild, name: ChannelCategoryName): Promise<string | null> {
    const existing = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name === name,
    );
    if (existing) return existing.id;

    try {
        const created = await guild.channels.create({
            name,
            type: ChannelType.GuildCategory,
            reason: 'devchannels create bootstrap',
        });
        await sleep(300);
        return created.id;
    } catch (err) {
        console.error(`Failed to create category "${name}":`, err);
        return null;
    }
}

async function ensureBootstrapCategories(
    guild: Guild,
): Promise<Map<ChannelCategoryName, string | null>> {
    const map = new Map<ChannelCategoryName, string | null>();
    for (const name of BOOTSTRAP_CATEGORY_NAMES) {
        map.set(name, await ensureCategory(guild, name));
    }
    return map;
}

async function moveUnderCategory(
    channel: GuildBasedChannel,
    categoryId: string | null | undefined,
): Promise<void> {
    if (!categoryId) return;
    if (!('setParent' in channel)) return;
    if (channel.parentId === categoryId) return;
    await channel.setParent(categoryId, { lockPermissions: false }).catch(console.error);
}

async function ensureBootstrapRoles(guild: Guild): Promise<{
    statusLines: string[];
    updates: Partial<Record<RoleKey, string>>;
}> {
    const statusLines: string[] = [];
    const updates: Partial<Record<RoleKey, string>> = {};

    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        statusLines.push('Roles skipped — I need **Manage Roles** to create/update role constants.');
        return { statusLines, updates };
    }

    for (const [key, name] of Object.entries(BOOTSTRAP_ROLE_NAMES) as Array<[RoleKey, string]>) {
        let role: Role | null = null;
        const configuredId = roles[key];
        if (!isUnsetSnowflake(configuredId)) {
            role = await guild.roles.fetch(configuredId).catch(() => null);
        }
        if (!role) {
            role = guild.roles.cache.find((r) => r.name === name) || null;
        }
        if (!role) {
            role = await guild.roles
                .create({
                    name,
                    permissions: new PermissionsBitField(BOOTSTRAP_ROLE_PERMISSIONS[key] || []),
                    reason: 'devchannels create bootstrap roles',
                })
                .catch((err) => {
                    console.error(`Failed to create role "${name}":`, err);
                    return null;
                });
            await sleep(350);
        }
        if (!role) {
            statusLines.push(`• role \`${key}\` — **failed** to create ${name}`);
            continue;
        }

        roles[key] = role.id;
        updates[key] = role.id;
        statusLines.push(`• role \`${key}\` — ready (@${role.name})`);
    }

    return { statusLines, updates };
}

async function runCreate(message: Message) {
    if (!canRunDevSetup(message)) return;
    const guild = message.guild!;
    const loading = await sendLoading(
        message,
        'devchannels create',
        'Loading… organizing channels under Public / Community / Moderation, then writing constants.',
    );

    const statusLines: string[] = [];
    const updates: Partial<Record<ChannelKey, string>> = {};

    const channelCount = guild.channels.cache.size;
    if (channelCount <= 1) {
        statusLines.push(`Guild has ${channelCount} channel(s) — bootstrapping full set.`);
    }

    const categoryIds = await ensureBootstrapCategories(guild);
    for (const name of BOOTSTRAP_CATEGORY_NAMES) {
        const id = categoryIds.get(name);
        statusLines.push(
            id
                ? `Category **${name}** ready`
                : `Category **${name}** — failed; channels may be uncategorized`,
        );
    }

    const roleResult = await ensureBootstrapRoles(guild);
    statusLines.push(...roleResult.statusLines);

    for (const key of CHANNEL_KEYS) {
        const expectedName = CHANNEL_DISCORD_NAMES[key];
        const configuredId = channels[key];
        const categoryName = CHANNEL_CATEGORY_BY_KEY[key];
        const parentId = categoryIds.get(categoryName) ?? null;

        if (!isUnsetSnowflake(configuredId) && guild.channels.cache.has(configuredId)) {
            const existing = guild.channels.cache.get(configuredId);
            if (existing) await moveUnderCategory(existing, parentId);
            statusLines.push(`• \`${key}\` — already set (<#${configuredId}>) → ${categoryName}`);
            continue;
        }

        const existing = findChannelByName(guild, expectedName);
        if (existing) {
            await moveUnderCategory(existing, parentId);
            updates[key] = existing.id;
            channels[key] = existing.id;
            statusLines.push(`• \`${key}\` — matched #${existing.name} → ${categoryName}`);
            continue;
        }

        try {
            const isVoice = key === 'memberCounter';
            const created = await guild.channels.create({
                name: expectedName,
                type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
                parent: parentId ?? undefined,
                reason: 'devchannels create bootstrap',
            });
            updates[key] = created.id;
            channels[key] = created.id;
            statusLines.push(`• \`${key}\` — **created** #${created.name} → ${categoryName}`);
            await sleep(350);
        } catch (err) {
            console.error(err);
            statusLines.push(`• \`${key}\` — **failed** to create #${expectedName}`);
        }
    }

    if (config.guildId !== guild.id) {
        config.guildId = guild.id;
    }

    let writeNote = '';
    try {
        const channelWrite = writeChannelIdsToConfigFile(updates, guild.id);
        const roleWrite = writeRoleIdsToConfigFile(roleResult.updates);
        writeNote =
            `Wrote ${Object.keys(updates).length} channel id(s) and ` +
            `${Object.keys(roleResult.updates).length} role id(s) to ` +
            `\`${displayRepoPath(channelWrite.path || roleWrite.path)}\` ` +
            '(reload bot if other processes need the file).';
    } catch (err) {
        console.error(err);
        writeNote = `In-memory IDs updated, but **failed to write config file**: ${
            err instanceof Error ? err.message : String(err)
        }`;
    }

    const body = statusLines.join('\n');
    const truncated = body.length > 3500 ? `${body.slice(0, 3500)}\n…` : body;

    const doneEmbed = createEmbed({
        color: EmbedColors.SUCCESS,
        title: 'devchannels create',
        description: truncated || 'Nothing to do.',
        fields: [
            { name: 'Constants file', value: `\`${resolveConfigName()}.ts\``, inline: true },
            { name: 'Guild', value: `\`${guild.id}\``, inline: true },
            { name: 'File write', value: writeNote, inline: false },
        ],
        footer: { text: 'In-memory config updated for this process' },
    });

    if (loading) {
        await loading.edit({ embeds: [doneEmbed] }).catch(console.error);
    } else {
        await message.reply({ embeds: [doneEmbed] }).catch(console.error);
    }
}

async function runCleanup(message: Message) {
    if (!canRunDevSetup(message)) return;
    const guild = message.guild!;
    const keepId = message.channel.id;

    const loading = await sendLoading(
        message,
        'devchannels cleanup',
        'Loading… deleting channels (incl. Public / Community / Moderation categories) and clearing constants.',
    );

    // Refresh cache so just-created categories are included
    await guild.channels.fetch().catch(console.error);

    const toDelete = guild.channels.cache.filter((c) => {
        if (c.id === keepId) return false;
        return 'deletable' in c ? Boolean((c as { deletable: boolean }).deletable) : true;
    });
    let deleted = 0;
    let failed = 0;
    let categoriesDeleted = 0;

    // Children first, categories last (so Public / Community / Moderation go away too)
    const ordered = [...toDelete.values()].sort((a, b) => {
        const aCat = a.type === ChannelType.GuildCategory ? 1 : 0;
        const bCat = b.type === ChannelType.GuildCategory ? 1 : 0;
        return aCat - bCat;
    });

    for (const ch of ordered) {
        try {
            const wasCategory = ch.type === ChannelType.GuildCategory;
            await ch.delete('devchannels cleanup');
            deleted++;
            if (wasCategory) categoriesDeleted++;
            await sleep(400);
        } catch (err) {
            console.error(`Failed to delete ${ch.id}:`, err);
            failed++;
        }
    }

    // Nuke channel IDs in memory + constants file
    for (const key of CHANNEL_KEYS) {
        channels[key] = PLACEHOLDER_ID;
    }
    config.guildId = PLACEHOLDER_ID;

    let fileNote = '';
    try {
        const result = clearChannelIdsInConfigFile();
        fileNote = `Cleared **${result.clearedKeys.length}** key(s) in \`${displayRepoPath(result.path)}\` (placeholders).`;
    } catch (err) {
        console.error(err);
        fileNote = `Channels deleted, but **failed to clear config file**: ${
            err instanceof Error ? err.message : String(err)
        }`;
    }

    const doneEmbed = createEmbed({
        color: failed > 0 ? EmbedColors.WARNING : EmbedColors.SUCCESS,
        title: 'devchannels cleanup',
        description: `Kept <#${keepId}>. Deleted **${deleted}** channel(s) (**${categoriesDeleted}** categories)${
            failed ? `, **${failed}** failed` : ''
        }.`,
        fields: [{ name: 'Constants file', value: fileNote, inline: false }],
        footer: { text: 'Restart the bot to soft-lock until .devchannels create' },
    });

    if (loading) {
        await loading.edit({ embeds: [doneEmbed] }).catch(console.error);
    } else {
        await message.reply({ embeds: [doneEmbed] }).catch(console.error);
    }
}

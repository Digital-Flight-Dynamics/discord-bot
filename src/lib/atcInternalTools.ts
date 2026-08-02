import { Client, EmbedBuilder, EmbedData, GuildMember, User } from 'discord.js';
import { roleGroups, roles, config as workspaceConfig } from '../config';
import { createPendingModeration, getPendingModerationById } from '../db/repositories/pendingModeration';
import { createEmbed, EmbedColors } from './embed';
import { executePendingModeration } from './moderationExecute';
import { MAX_DISCORD_TIMEOUT_MS, MAX_TEMPORARY_MODERATION_MS } from './moderationDuration';

export type AtcMemberAccess = {
    moderator: boolean;
    management: boolean;
    developer: boolean;
    messageTools: boolean;
};

export type AtcMemberProfile = {
    id: string;
    username: string;
    displayName: string;
    globalName: string | null;
    avatarUrl: string;
    createdAt: string;
    joinedAt: string | null;
    isMember: boolean;
    roles: Array<{ id: string; name: string; color: number }>;
    access: AtcMemberAccess;
};

export type AtcMessageChannel = {
    id: string;
    name: string;
    category: string;
    categoryPosition: number;
    position: number;
};

function guildFor(client: Client) {
    const guildId = workspaceConfig.guildId;
    if (!guildId) throw new Error('The configured guild is unavailable.');
    return client.guilds.cache.get(guildId);
}

export function atcAccessForRoleIds(roleIds: Iterable<string>): AtcMemberAccess {
    const ids = new Set(roleIds);
    const management = ids.has(roles.management);
    const developer = ids.has(roles.developer);
    const moderator =
        management ||
        ids.has(roles.moderator) ||
        roleGroups.moderation.some((roleId) => ids.has(roleId));
    return { moderator, management, developer, messageTools: moderator && (management || developer) };
}

function memberAccess(member: GuildMember | null): AtcMemberAccess {
    return atcAccessForRoleIds(member?.roles.cache.keys() || []);
}

function avatarUrl(user: User, member: GuildMember | null): string {
    return member?.displayAvatarURL({ size: 256 }) || user.displayAvatarURL({ size: 256 });
}

function profileFor(user: User, member: GuildMember | null): AtcMemberProfile {
    return {
        id: user.id,
        username: user.username,
        displayName: member?.displayName || user.globalName || user.username,
        globalName: user.globalName,
        avatarUrl: avatarUrl(user, member),
        createdAt: user.createdAt.toISOString(),
        joinedAt: member?.joinedAt?.toISOString() || null,
        isMember: Boolean(member),
        roles: member
            ? member.roles.cache
                  .filter((role) => role.id !== member.guild.id)
                  .sort((a, b) => b.position - a.position)
                  .map((role) => ({ id: role.id, name: role.name, color: role.color }))
            : [],
        access: memberAccess(member),
    };
}

export async function getAtcMemberProfile(client: Client, userId: string): Promise<AtcMemberProfile | null> {
    const guild = guildFor(client);
    if (!guild) throw new Error('The configured guild is unavailable.');
    const member = await guild.members.fetch(userId).catch(() => null);
    const user = member?.user || (await client.users.fetch(userId).catch(() => null));
    return user ? profileFor(user, member) : null;
}

export async function searchAtcMembers(client: Client, query: string): Promise<AtcMemberProfile[]> {
    const guild = guildFor(client);
    if (!guild) throw new Error('The configured guild is unavailable.');
    const normalized = query.trim();
    if (/^\d{17,20}$/.test(normalized)) {
        const profile = await getAtcMemberProfile(client, normalized);
        return profile ? [profile] : [];
    }
    if (normalized.length < 2 || normalized.length > 100) return [];
    const members = await guild.members.fetch({ query: normalized, limit: 15 }).catch(() => null);
    return members ? [...members.values()].map((member) => profileFor(member.user, member)) : [];
}

async function requireModerator(client: Client, actorUserId: string): Promise<GuildMember> {
    const guild = guildFor(client);
    if (!guild) throw new Error('The configured guild is unavailable.');
    const actor = await guild.members.fetch(actorUserId).catch(() => null);
    if (!actor || !memberAccess(actor).moderator) throw new Error('Moderator access is required.');
    return actor;
}

async function requireMessageTools(client: Client, actorUserId: string): Promise<GuildMember> {
    const actor = await requireModerator(client, actorUserId);
    if (!memberAccess(actor).messageTools) throw new Error('Management or developer access is required.');
    return actor;
}

export async function listAtcChannels(client: Client, input: { actorUserId: string }): Promise<AtcMessageChannel[]> {
    const actor = await requireMessageTools(client, input.actorUserId);
    const channels = await actor.guild.channels.fetch();
    return [...channels.values()]
        .flatMap((channel) => {
            if (!channel || !channel.isTextBased() || channel.isDMBased()) return [];
            return [{
                id: channel.id,
                name: channel.name,
                category: channel.parent?.name || 'Uncategorized',
                categoryPosition: channel.parent?.position ?? Number.MAX_SAFE_INTEGER,
                position: channel.position,
            }];
        })
        .sort((left, right) =>
            left.categoryPosition - right.categoryPosition ||
            left.position - right.position ||
            left.name.localeCompare(right.name),
        );
}

export async function executeAtcModeration(
    client: Client,
    input: {
        actorUserId: string;
        targetUserId: string;
        kind: 'warn' | 'kick' | 'ban' | 'timeout';
        reason: string;
        durationMs?: number | null;
        recordExpiresAt?: string | null;
        privateNote?: string | null;
    },
) {
    const actor = await requireModerator(client, input.actorUserId);
    const guild = actor.guild;
    const targetUser = await client.users.fetch(input.targetUserId).catch(() => null);
    if (!targetUser || targetUser.bot) throw new Error('A valid non-bot target user is required.');
    if (targetUser.id === actor.id || targetUser.id === guild.ownerId) throw new Error('This target cannot be moderated.');

    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    if (targetMember && actor.id !== guild.ownerId && actor.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) {
        throw new Error('You cannot moderate a member with an equal or higher role.');
    }

    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 2_000) throw new Error('Reason must be between 3 and 2,000 characters.');
    const requestedDuration = Number(input.durationMs || 0);
    if (!Number.isFinite(requestedDuration) || requestedDuration < 0 || requestedDuration > MAX_TEMPORARY_MODERATION_MS) {
        throw new Error('Invalid duration.');
    }
    if (input.kind === 'timeout' && (requestedDuration < 60_000 || requestedDuration > MAX_DISCORD_TIMEOUT_MS)) {
        throw new Error('Timeout duration must be between one minute and 28 days.');
    }
    const durationMs = input.kind === 'timeout' || input.kind === 'ban' ? requestedDuration : 0;
    const privateNote = input.privateNote?.trim() || null;
    if (privateNote && privateNote.length > 500) throw new Error('Private notes cannot exceed 500 characters.');
    const expiresAt = durationMs > 0 ? new Date(Date.now() + durationMs) : null;
    const recordExpiresAt = input.recordExpiresAt ? new Date(input.recordExpiresAt) : null;
    if (
        recordExpiresAt &&
        (!Number.isFinite(recordExpiresAt.getTime()) ||
            recordExpiresAt.getTime() <= Date.now() ||
            recordExpiresAt.getTime() - Date.now() > MAX_TEMPORARY_MODERATION_MS)
    ) {
        throw new Error('Record expiration must be a future date within ten years.');
    }
    const pending = await createPendingModeration({
        guildId: guild.id,
        actionType: input.kind,
        subjectUserId: targetUser.id,
        moderatorUserId: actor.id,
        reason,
        durationMs: durationMs || null,
        durationToken: durationMs ? `${durationMs}ms` : null,
        expiresAt,
        recordExpiresAt,
        deleteMessageSeconds: null,
        banType: input.kind === 'ban' ? 'hard' : null,
        payload: { source: 'atc-web' },
    });
    const fresh = (await getPendingModerationById(pending.id)) || pending;
    return executePendingModeration(client, fresh, { privateNote });
}

function safeText(value: unknown, max: number): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function objectValue(value: unknown, label: string): Record<string, unknown> | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    return value as Record<string, unknown>;
}

function embedText(value: unknown, max: number, label: string): string {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length > max) throw new Error(`${label} cannot exceed ${max} characters.`);
    return text;
}

function embedUrl(value: unknown, label: string): string | undefined {
    const url = embedText(value, 2_048, label);
    return url || undefined;
}

function embedColor(value: unknown, label: string): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff) return value;
    if (typeof value !== 'string') throw new Error(`${label} must be a six-digit hex color.`);
    const normalized = value.trim().replace(/^#/, '').replace(/^0x/i, '');
    if (!/^[\da-f]{6}$/i.test(normalized)) throw new Error(`${label} must be a six-digit hex color.`);
    return Number.parseInt(normalized, 16);
}

function embedTimestamp(value: unknown, label: string): string | undefined {
    const timestamp = embedText(value, 64, label);
    if (!timestamp) return undefined;
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid date.`);
    return date.toISOString();
}

function buildAtcEmbeds(raw: unknown): EmbedBuilder[] {
    if (!Array.isArray(raw)) throw new Error('Embeds must be an array.');
    if (raw.length > 10) throw new Error('A message can contain up to 10 embeds.');

    let totalCharacters = 0;
    return raw.map((rawEmbed, embedIndex) => {
        const label = `Embed ${embedIndex + 1}`;
        const embed = objectValue(rawEmbed, `${label} data`);
        if (!embed) throw new Error(`${label} must contain content.`);
        const title = embedText(embed.title, 256, `${label} title`);
        const description = embedText(embed.description, 4_096, `${label} description`);
        const url = embedUrl(embed.url, `${label} URL`);
        const color = embedColor(embed.color, `${label} color`);
        const timestamp = embedTimestamp(embed.timestamp, `${label} timestamp`);

        const authorData = objectValue(embed.author, `${label} author`);
        const authorName = authorData ? embedText(authorData.name, 256, `${label} author name`) : '';
        const authorUrl = authorData ? embedUrl(authorData.url, `${label} author URL`) : undefined;
        const authorIcon = authorData ? embedUrl(authorData.icon_url ?? authorData.iconURL, `${label} author icon URL`) : undefined;
        if (authorData && !authorName && (authorUrl || authorIcon)) throw new Error(`${label} author name is required.`);

        const footerData = objectValue(embed.footer, `${label} footer`);
        const footerText = footerData ? embedText(footerData.text, 2_048, `${label} footer text`) : '';
        const footerIcon = footerData ? embedUrl(footerData.icon_url ?? footerData.iconURL, `${label} footer icon URL`) : undefined;
        if (footerData && !footerText && footerIcon) throw new Error(`${label} footer text is required.`);

        if (embed.fields !== undefined && !Array.isArray(embed.fields)) throw new Error(`${label} fields must be an array.`);
        const fields = (Array.isArray(embed.fields) ? embed.fields : []).flatMap((rawField, fieldIndex) => {
            const field = objectValue(rawField, `${label} field ${fieldIndex + 1}`);
            if (!field) return [];
            const name = embedText(field.name, 256, `${label} field ${fieldIndex + 1} name`);
            const value = embedText(field.value, 1_024, `${label} field ${fieldIndex + 1} value`);
            if (!name && !value) return [];
            if (!name || !value) throw new Error(`${label} field ${fieldIndex + 1} needs both a name and a value.`);
            return [{ name, value, inline: field.inline === true }];
        });
        if (fields.length > 25) throw new Error(`${label} can contain up to 25 fields.`);

        const thumbnailData = objectValue(embed.thumbnail, `${label} thumbnail`);
        const thumbnailUrl = thumbnailData ? embedUrl(thumbnailData.url, `${label} thumbnail URL`) : undefined;
        const imageData = objectValue(embed.image, `${label} image`);
        const imageUrl = imageData ? embedUrl(imageData.url, `${label} image URL`) : undefined;
        const hasContent = Boolean(title || description || fields.length || authorName || footerText || thumbnailUrl || imageUrl);
        if (!hasContent) throw new Error(`${label} needs a title, description, field, author, footer, image, or thumbnail.`);

        totalCharacters += title.length + description.length + authorName.length + footerText.length;
        totalCharacters += fields.reduce((total, field) => total + field.name.length + field.value.length, 0);
        if (totalCharacters > 6_000) throw new Error('All embeds together cannot exceed 6,000 characters.');

        const data: EmbedData = {
            ...(title ? { title } : {}),
            ...(description ? { description } : {}),
            ...(url ? { url } : {}),
            ...(color !== undefined ? { color } : {}),
            ...(timestamp ? { timestamp } : {}),
            ...(authorName ? { author: { name: authorName, ...(authorUrl ? { url: authorUrl } : {}), ...(authorIcon ? { icon_url: authorIcon } : {}) } } : {}),
            ...(footerText ? { footer: { text: footerText, ...(footerIcon ? { icon_url: footerIcon } : {}) } } : {}),
            ...(thumbnailUrl ? { thumbnail: { url: thumbnailUrl } } : {}),
            ...(imageUrl ? { image: { url: imageUrl } } : {}),
            ...(fields.length ? { fields } : {}),
        };
        return new EmbedBuilder(data);
    });
}

function embedsForInput(input: { embeds?: unknown; title?: unknown; description?: unknown }): EmbedBuilder[] {
    if (input.embeds !== undefined) return buildAtcEmbeds(input.embeds);
    const title = safeText(input.title, 256);
    const description = safeText(input.description, 4_096);
    return title || description
        ? [createEmbed({ color: EmbedColors.DFD_BLUE, title: title || undefined, description: description || undefined }, true)]
        : [];
}

export async function sendAtcMessage(
    client: Client,
    input: {
        actorUserId: string;
        channelId: string;
        content?: string;
        embeds?: unknown;
        title?: string;
        description?: string;
    },
) {
    const actor = await requireMessageTools(client, input.actorUserId);
    const channel = await client.channels.fetch(input.channelId).catch(() => null);
    if (!channel?.isTextBased() || channel.isDMBased() || channel.guildId !== actor.guild.id) {
        throw new Error('A valid server text channel is required.');
    }
    const content = safeText(input.content, 2_000);
    const embeds = embedsForInput(input);
    if (!content && !embeds.length) throw new Error('Message content or embed text is required.');
    const message = await channel.send({
        content: content || undefined,
        embeds,
    });
    return { channelId: message.channelId, messageId: message.id, url: message.url };
}

export async function getAtcMessage(
    client: Client,
    input: {
        actorUserId: string;
        channelId: string;
        messageId: string;
    },
) {
    const actor = await requireMessageTools(client, input.actorUserId);
    const channel = await client.channels.fetch(input.channelId).catch(() => null);
    if (!channel?.isTextBased() || channel.isDMBased() || channel.guildId !== actor.guild.id) {
        throw new Error('A valid server text channel is required.');
    }
    const message = await channel.messages.fetch(input.messageId).catch(() => null);
    if (!message || message.author.id !== client.user?.id) throw new Error('Only messages sent by this bot can be edited.');
    return {
        channelId: message.channelId,
        messageId: message.id,
        content: message.content,
        embeds: message.embeds.map((item) => item.toJSON()),
        url: message.url,
    };
}

export async function editAtcMessage(
    client: Client,
    input: {
        actorUserId: string;
        channelId: string;
        messageId: string;
        content?: string;
        embeds?: unknown;
        title?: string;
        description?: string;
    },
) {
    const actor = await requireMessageTools(client, input.actorUserId);
    const channel = await client.channels.fetch(input.channelId).catch(() => null);
    if (!channel?.isTextBased() || channel.isDMBased() || channel.guildId !== actor.guild.id) {
        throw new Error('A valid server text channel is required.');
    }
    const message = await channel.messages.fetch(input.messageId).catch(() => null);
    if (!message || message.author.id !== client.user?.id) throw new Error('Only messages sent by this bot can be edited.');
    const content = safeText(input.content, 2_000);
    const embeds = embedsForInput(input);
    if (!content && !embeds.length) throw new Error('Message content or embed text is required.');
    const edited = await message.edit({ content: content || null, embeds });
    return { channelId: edited.channelId, messageId: edited.id, url: edited.url };
}

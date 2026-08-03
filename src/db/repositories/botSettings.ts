import { and, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { botSettings } from '../schema';

export const BOT_SETTING_KEYS = {
    avwxApiKey: 'weather.avwx_api_key',
} as const;

export type BotSettingKey = (typeof BOT_SETTING_KEYS)[keyof typeof BOT_SETTING_KEYS];

export async function getBotSetting(guildId: string, key: BotSettingKey): Promise<string | null> {
    const [setting] = await getDb()
        .select({ value: botSettings.value })
        .from(botSettings)
        .where(and(eq(botSettings.guildId, guildId), eq(botSettings.key, key)))
        .limit(1);
    return setting?.value.trim() || null;
}

/** Read the AVWX key from managed settings. */
export async function getAvwxApiKey(guildId: string): Promise<string | null> {
    return getBotSetting(guildId, BOT_SETTING_KEYS.avwxApiKey);
}

/** Import the old deployment secret once, so it can be removed from the environment. */
export async function migrateLegacyBotSettings(guildId: string | undefined): Promise<void> {
    const legacyValue = process.env.AVWX_KEY?.trim();
    if (!guildId || !legacyValue) return;

    const [existing] = await getDb()
        .select({ key: botSettings.key })
        .from(botSettings)
        .where(and(eq(botSettings.guildId, guildId), eq(botSettings.key, BOT_SETTING_KEYS.avwxApiKey)))
        .limit(1);
    if (existing) return;

    await getDb()
        .insert(botSettings)
        .values({ guildId, key: BOT_SETTING_KEYS.avwxApiKey, value: legacyValue })
        .onConflictDoNothing();
}

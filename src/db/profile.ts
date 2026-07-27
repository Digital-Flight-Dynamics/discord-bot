import axios from 'axios';

export type ProfileEnrichment = {
    pronouns: string | null;
    bio: string | null;
    urls: string[];
};

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

/** Extract http(s) links from bio text only. */
export function extractUrlsFromBio(bio: string | null | undefined): string[] {
    if (!bio) return [];
    const matches = bio.match(URL_REGEX) || [];
    // de-dupe, strip trailing punctuation
    const cleaned = matches.map((u) => u.replace(/[.,;:!?)]+$/g, ''));
    return Array.from(new Set(cleaned));
}

/**
 * Best-effort Discord user profile fetch (pronouns + bio).
 * Uses the unofficial /users/{id}/profile endpoint with the bot token.
 * Soft-fails to nulls when unavailable.
 */
export async function fetchUserProfile(userId: string): Promise<ProfileEnrichment> {
    const empty: ProfileEnrichment = { pronouns: null, bio: null, urls: [] };
    const token = process.env.BOT_TOKEN;
    if (!token || !userId) return empty;

    try {
        const res = await axios.get(`https://discord.com/api/v10/users/${userId}/profile`, {
            headers: {
                Authorization: `Bot ${token}`,
            },
            timeout: 2500,
            validateStatus: () => true,
        });

        if (res.status < 200 || res.status >= 300) {
            return empty;
        }

        const data = res.data || {};
        const user = data.user || {};
        const pronouns: string | null =
            (typeof data.user_profile?.pronouns === 'string' && data.user_profile.pronouns) ||
            (typeof user.pronouns === 'string' && user.pronouns) ||
            (typeof data.pronouns === 'string' && data.pronouns) ||
            null;

        const bio: string | null =
            (typeof data.user_profile?.bio === 'string' && data.user_profile.bio) ||
            (typeof data.bio === 'string' && data.bio) ||
            (typeof user.bio === 'string' && user.bio) ||
            null;

        return {
            pronouns: pronouns || null,
            bio: bio || null,
            urls: extractUrlsFromBio(bio),
        };
    } catch (err) {
        console.error('Profile enrichment failed:', err);
        return empty;
    }
}

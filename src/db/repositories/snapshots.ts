import { GuildMember, User } from 'discord.js';
import { getDb } from '../client';
import { identitySnapshots, IdentitySnapshot } from '../schema';
import { fetchUserProfile } from '../profile';

export type SnapshotSubject = {
    user?: User | null;
    member?: GuildMember | null;
    /** When only a snowflake is known (e.g. ban offline user). */
    discordUserId?: string;
    username?: string | null;
    displayName?: string | null;
    enrichProfile?: boolean;
};

export async function captureIdentitySnapshot(input: SnapshotSubject): Promise<IdentitySnapshot> {
    const user = input.user || input.member?.user || null;
    const member = input.member || null;
    const discordUserId = input.discordUserId || user?.id || member?.id;
    if (!discordUserId) {
        throw new Error('captureIdentitySnapshot requires a discord user id');
    }

    const username = input.username ?? user?.username ?? null;
    // globalName exists on newer discord.js; fall back safely for 14.11 typings
    const globalName = user ? ((user as User & { globalName?: string | null }).globalName ?? null) : null;
    const memberDisplayName = member?.displayName ?? null;
    const displayName =
        input.displayName ??
        (memberDisplayName && memberDisplayName !== username ? memberDisplayName : null) ??
        globalName ??
        memberDisplayName ??
        username ??
        null;

    let pronouns: string | null = null;
    let bio: string | null = null;
    let urls: string[] = [];

    if (input.enrichProfile !== false) {
        const profile = await fetchUserProfile(discordUserId);
        pronouns = profile.pronouns;
        bio = profile.bio;
        urls = profile.urls;
    }

    const db = getDb();
    const [row] = await db
        .insert(identitySnapshots)
        .values({
            discordUserId,
            username,
            displayName,
            pronouns,
            bio,
            urls,
        })
        .returning();

    return row;
}

export function formatSnapshotLabel(snap: Pick<IdentitySnapshot, 'username' | 'displayName' | 'discordUserId'> | null | undefined): string {
    if (!snap) return 'Unknown';
    const name = snap.displayName || snap.username || snap.discordUserId;
    if (snap.username && snap.displayName && snap.displayName !== snap.username) {
        return `${snap.displayName} (@${snap.username})`;
    }
    return name;
}

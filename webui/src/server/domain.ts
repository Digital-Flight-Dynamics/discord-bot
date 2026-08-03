import * as chrono from 'chrono-node';

export type AppealStatus = 'submitted' | 'review' | 'approved' | 'denied';

export type ModeratorAccess = {
    moderator: boolean;
    management: boolean;
    developer: boolean;
    messageTools: boolean;
};

export type DiscordMemberProfile = {
    id: string;
    username: string;
    displayName: string;
    globalName: string | null;
    avatarUrl: string;
    createdAt: string;
    joinedAt: string | null;
    isMember: boolean;
    roles: Array<{ id: string; name: string; color: number }>;
    access: ModeratorAccess;
};

export type PublicAppealSummary = {
    id: string;
    status: AppealStatus;
    submittedAt: string;
    reviewStartedAt: string | null;
    decidedAt: string | null;
};

export type PublicAction = {
    actionId: string;
    kind: 'warning' | 'kick' | 'ban' | 'timeout';
    reason: string;
    createdAt: string;
    expiresAt: string | null;
    durationMs: number | null;
    resolutionStatus: string | null;
    resolutionPublicNote: string | null;
    endedAt: string | null;
    appealId: string | null;
    appealStatus: AppealStatus | null;
    appealSubmittedAt: string | null;
    appealDecidedAt: string | null;
    appeals?: PublicAppealSummary[];
};

export type AppealAnswers = Record<string, string>;

export const APPEAL_BEHAVIORS = [
    { value: 'piracy', label: 'Piracy' },
    { value: 'spamming', label: 'Spamming' },
    { value: 'advertising', label: 'Advertising or promoting outside the designated channels' },
    { value: 'random-dms', label: 'DMing random people' },
    { value: 'hate-speech', label: 'Hate speech' },
    { value: 'bad-behavior', label: 'General bad behavior' },
    { value: 'ignored-moderator', label: 'Repeatedly ignoring a moderator' },
    { value: 'other', label: 'Other' },
    { value: 'compromised', label: 'My account was compromised', banOnly: true },
] as const;

export const PIRACY_REASONS = [
    { value: 'pirated-msfs', label: 'Owning a pirated copy of Microsoft Flight Simulator' },
    { value: 'pirated-addons', label: 'Owning pirated versions of payware add-ons' },
    { value: 'discussed-piracy', label: 'Discussing piracy' },
    { value: 'shared-piracy', label: 'Sharing pirated content' },
    { value: 'other', label: 'Other' },
] as const;

export const APPEAL_ANSWER_LABELS: Record<string, string> = {
    ageConfirmation: 'Age confirmation',
    behavior: 'What behavior led to this action?',
    behaviorOther: 'Describe the behavior that led to this action',
    piracyReason: 'Reason for the piracy-related action',
    piracyReasonOther: 'Other piracy-related reason',
    piratedSimVersion: 'What was the simulator version of your pirated copy?',
    purchasedValidCopy: 'Have you bought a valid copy of Microsoft Flight Simulator since?',
    piracyDetails: 'What did you pirate, discuss, or share?',
    piracyMotivation: 'Why did you choose to do this?',
    spammingDefinition: 'What does “spamming” mean to you?',
    spammedContent: 'What did you spam specifically?',
    advertisedContent: 'What did you advertise or promote, and in which channel?',
    advertisingReason: 'Why did you choose to advertise or promote it?',
    promptedToAdvertise: 'Were you prompted or told to advertise or promote in our server? If yes, by whom?',
    dmMotivation: 'What motivated you to DM random people on Discord?',
    dmContent: 'What content did you send?',
    hateSpeechDefinition: 'What does hate speech mean to you?',
    hateSpeechContent: 'What did you say specifically?',
    hateSpeechJustification: 'What made you feel you had the right to behave in this way?',
    badBehaviorDefinition: 'What does “general bad behavior” mean to you?',
    badBehaviorDetails: 'What did you do specifically?',
    moderatorInvolvement: 'Why did the moderator become involved in the first place?',
    ignoredModeratorReason: 'Why did you choose to ignore the moderator and carry on?',
    accountSecured: 'Have you taken steps to secure your account?',
    compromisedActions: 'What actions were taken while your account was compromised?',
    otherBehaviorDetails: 'What did you do specifically?',
    otherBehaviorReason: 'Why did you choose to do it?',
    moderatorStopCount: 'How many times did a moderator ask you to stop?',
    moderatorReaction: 'How did you react when the moderator asked you to stop?',
    reportedBefore: 'Have you ever been reported by a member of our server?',
    behaviorChange: 'How will your behavior change, and how can we trust you with another chance?',
    additionalNotes: 'Anything else you would like to add or mention?',
    evidenceLinks: 'Evidence links',
    // Labels retained for appeals submitted with the original form.
    invalidReason: 'Why do you think this punishment is invalid?',
    appealReason: "What's your reason for this appeal?",
    approvalReason: 'Why should your appeal be approved?',
    futureSteps: 'If your appeal is accepted, what steps will you take to avoid being punished again?',
};

const VALUE_LABELS: Record<string, Record<string, string>> = {
    ageConfirmation: { ofAge: 'I am of age according to the Discord Terms of Service for my country' },
    behavior: Object.fromEntries(APPEAL_BEHAVIORS.map(({ value, label }) => [value, label])),
    piracyReason: Object.fromEntries(PIRACY_REASONS.map(({ value, label }) => [value, label])),
    purchasedValidCopy: { yes: 'Yes', no: 'No' },
    accountSecured: { yes: 'Yes', no: 'No' },
    moderatorStopCount: { '0': '0', '1': '1', '2': '2', '3': '3', more: 'More than 3', notInformed: 'I was not informed' },
    moderatorReaction: {
        resolved: 'The situation was resolved',
        steppedAway: 'I took a step away from Discord for a while',
        continued: 'I carried on or retaliated',
        notAsked: 'I was not asked to stop',
    },
    reportedBefore: { yes: 'Yes', no: 'No', unsure: 'Not sure' },
};

const behaviorFields: Record<string, string[]> = {
    piracy: ['piracyReason', 'piracyDetails', 'piracyMotivation'],
    spamming: ['spammingDefinition', 'spammedContent'],
    advertising: ['advertisedContent', 'advertisingReason', 'promptedToAdvertise'],
    'random-dms': ['dmMotivation', 'dmContent'],
    'hate-speech': ['hateSpeechDefinition', 'hateSpeechContent', 'hateSpeechJustification'],
    'bad-behavior': ['badBehaviorDefinition', 'badBehaviorDetails'],
    'ignored-moderator': ['moderatorInvolvement', 'ignoredModeratorReason'],
    other: ['behaviorOther'],
    compromised: ['accountSecured'],
};

const commonFields = ['ageConfirmation', 'behavior', 'moderatorStopCount', 'moderatorReaction', 'reportedBefore', 'behaviorChange'];

export function appealAnswerEntries(answers: AppealAnswers): Array<{ id: string; label: string; value: string }> {
    const behavior = answers.behavior || '';
    const detailFields = behavior === 'piracy'
        ? ['piracyReason', 'piracyReasonOther', 'piratedSimVersion', 'purchasedValidCopy', 'piracyDetails', 'piracyMotivation']
        : behavior === 'compromised'
          ? ['accountSecured', 'compromisedActions']
          : behaviorFields[behavior] || [];
    const orderedIds = [
        'ageConfirmation',
        'behavior',
        ...detailFields,
        'moderatorStopCount',
        'moderatorReaction',
        'reportedBefore',
        'behaviorChange',
        'additionalNotes',
        'evidenceLinks',
    ];
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    return Object.entries(answers)
        .sort(([left], [right]) => (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER))
        .map(([id, value]) => ({
        id,
        label: APPEAL_ANSWER_LABELS[id] || id,
        value: VALUE_LABELS[id]?.[value] || value,
    }));
}

export function safeReturnPath(value: string | null | undefined): string {
    if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/my-history';
    try {
        const url = new URL(value, 'https://atc.invalid');
        if (url.origin !== 'https://atc.invalid') return '/my-history';
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return '/my-history';
    }
}

export function actionStatus(action: PublicAction, now = new Date()): 'active' | 'expired' | 'appeal submitted' | 'appealed' | 'revoked' {
    if (action.resolutionStatus === 'revoked') return 'revoked';
    if (action.resolutionStatus === 'appeal-approved' || action.appealStatus === 'approved') return 'appealed';
    if (action.appealStatus === 'submitted' || action.appealStatus === 'review') return 'appeal submitted';
    if (action.endedAt || (action.expiresAt && new Date(action.expiresAt) <= now)) return 'expired';
    return 'active';
}

export function appealCooldownDays(kind: PublicAction['kind']): number {
    if (kind === 'timeout') return 14;
    if (kind === 'ban') return 30;
    return 24;
}

export function appealEligibility(
    action: PublicAction,
    now = new Date(),
): { allowed: boolean; availableAt: string | null; reason: string | null } {
    if (action.resolutionStatus === 'revoked' || action.resolutionStatus === 'appeal-approved' || action.appealStatus === 'approved') {
        return { allowed: false, availableAt: null, reason: 'This action has already been resolved.' };
    }
    if (action.appealStatus === 'submitted' || action.appealStatus === 'review') {
        return { allowed: false, availableAt: null, reason: 'An appeal for this action is already under review.' };
    }
    if (action.appealStatus === 'denied') {
        if (!action.appealDecidedAt) {
            return { allowed: false, availableAt: null, reason: 'Another appeal is not available yet.' };
        }
        const availableAt = new Date(action.appealDecidedAt);
        availableAt.setUTCDate(availableAt.getUTCDate() + appealCooldownDays(action.kind));
        if (availableAt > now) {
            return {
                allowed: false,
                availableAt: availableAt.toISOString(),
                reason: `You may submit another appeal after ${availableAt.toUTCString()}.`,
            };
        }
    }
    return { allowed: true, availableAt: null, reason: null };
}

export function validateAppealAnswers(value: unknown, actionKind: PublicAction['kind']): AppealAnswers | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    const text = (id: string) => (typeof candidate[id] === 'string' ? candidate[id].trim() : '');
    const allowed = (id: string, values: string[]) => values.includes(text(id));
    const behavior = text('behavior');
    const validBehaviors = APPEAL_BEHAVIORS.filter((item) => !('banOnly' in item) || actionKind === 'ban').map((item) => item.value);
    if (text('ageConfirmation') !== 'ofAge' || !validBehaviors.includes(behavior as (typeof validBehaviors)[number])) return null;

    const requiredFields = [...commonFields, ...(behaviorFields[behavior] || [])];
    if (behavior === 'piracy') {
        if (!allowed('piracyReason', PIRACY_REASONS.map((item) => item.value))) return null;
        if (text('piracyReason') === 'other') requiredFields.push('piracyReasonOther');
        if (text('piracyReason') === 'pirated-msfs') {
            requiredFields.push('piratedSimVersion', 'purchasedValidCopy');
            if (text('purchasedValidCopy') !== 'yes') return null;
        }
    }
    if (behavior === 'compromised') {
        if (actionKind !== 'ban' || text('accountSecured') !== 'yes') return null;
        if (text('compromisedActions')) requiredFields.push('compromisedActions');
    }
    if (!allowed('moderatorStopCount', ['0', '1', '2', '3', 'more', 'notInformed'])) return null;
    if (!allowed('moderatorReaction', ['resolved', 'steppedAway', 'continued', 'notAsked'])) return null;
    if (!allowed('reportedBefore', ['yes', 'no', 'unsure'])) return null;

    const selectFields = new Set(['ageConfirmation', 'behavior', 'piracyReason', 'purchasedValidCopy', 'accountSecured', 'moderatorStopCount', 'moderatorReaction', 'reportedBefore']);
    const shortFields = new Set(['piracyReasonOther', 'piratedSimVersion']);
    for (const id of requiredFields) {
        const answer = text(id);
        const minimum = id === 'behaviorChange' ? 80 : selectFields.has(id) ? 1 : shortFields.has(id) ? 5 : 20;
        const maximum = shortFields.has(id) ? 250 : 2_000;
        if (answer.length < minimum || answer.length > maximum) return null;
    }
    const evidenceLinks = text('evidenceLinks');
    if (text('additionalNotes').length > 2_000 || evidenceLinks.length > 2_000) return null;
    if (behavior === 'piracy' && text('piracyReason') === 'pirated-msfs' && !evidenceLinks) return null;

    const orderedIds = [...requiredFields, 'additionalNotes', 'evidenceLinks'];
    const result: AppealAnswers = {};
    for (const id of orderedIds) {
        const answer = text(id);
        if (answer && !(id in result)) result[id] = answer;
    }
    const writtenLength = Object.entries(result)
        .filter(([id]) => !selectFields.has(id))
        .reduce((total, [, answer]) => total + answer.length, 0);
    return writtenLength >= 80 ? result : null;
}
export function normalizeCaptchaAnswer(value: unknown): string {
    return typeof value === 'string' ? value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : '';
}

export function formatDuration(durationMs: number | null): string | null {
    if (!durationMs || durationMs <= 0) return null;
    const minutes = Math.round(durationMs / 60_000);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'}`;
}

const maximumNaturalDurationMs = 10 * 365 * 24 * 60 * 60 * 1_000;
const naturalDurationUnits: Record<string, number> = {
    s: 1_000,
    sec: 1_000,
    secs: 1_000,
    second: 1_000,
    seconds: 1_000,
    m: 60_000,
    min: 60_000,
    mins: 60_000,
    minute: 60_000,
    minutes: 60_000,
    h: 3_600_000,
    hr: 3_600_000,
    hrs: 3_600_000,
    hour: 3_600_000,
    hours: 3_600_000,
    d: 86_400_000,
    day: 86_400_000,
    days: 86_400_000,
    w: 604_800_000,
    wk: 604_800_000,
    wks: 604_800_000,
    week: 604_800_000,
    weeks: 604_800_000,
    mo: 2_592_000_000,
    mos: 2_592_000_000,
    month: 2_592_000_000,
    months: 2_592_000_000,
    y: 31_536_000_000,
    yr: 31_536_000_000,
    yrs: 31_536_000_000,
    year: 31_536_000_000,
    years: 31_536_000_000,
};

/** Parse compact, conversational, or calendar-based future durations. */
export function parseNaturalDuration(value: string, now = new Date()): number | null {
    const input = value.trim().replace(/\s+/g, ' ');
    if (!input) return null;
    const compact = input.replace(/^in\s+/i, '');
    const tokenPattern = /(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|wk|w|months?|mos?|mo|years?|yrs?|yr|y)\b/gi;
    const matches = [...compact.matchAll(tokenPattern)];
    const remainder = compact.replace(tokenPattern, '').replace(/(?:\s|,|\band\b)/gi, '');
    if (matches.length && !remainder) {
        const duration = matches.reduce((total, match) => {
            return total + Number(match[1]) * naturalDurationUnits[match[2]!.toLowerCase()]!;
        }, 0);
        return Number.isSafeInteger(duration) && duration > 0 && duration <= maximumNaturalDurationMs ? duration : null;
    }

    const result = chrono.parse(input, now, { forwardDate: true })[0];
    if (!result || result.text.trim().toLowerCase() !== input.toLowerCase()) return null;
    const duration = result.date().getTime() - now.getTime();
    return Number.isSafeInteger(duration) && duration > 0 && duration <= maximumNaturalDurationMs ? duration : null;
}

export function formatNaturalDuration(durationMs: number): string {
    const units = [
        ['Year', 31_536_000_000],
        ['Month', 2_592_000_000],
        ['Week', 604_800_000],
        ['Day', 86_400_000],
        ['Hour', 3_600_000],
        ['Minute', 60_000],
        ['Second', 1_000],
    ] as const;
    let remaining = Math.max(1_000, Math.round(durationMs / 1_000) * 1_000);
    const parts: string[] = [];
    for (const [label, unitMs] of units) {
        const amount = Math.floor(remaining / unitMs);
        if (!amount) continue;
        parts.push(`${amount} ${label}${amount === 1 ? '' : 's'}`);
        remaining -= amount * unitMs;
        if (parts.length === 2) break;
    }
    return parts.join(' ') || '1 Second';
}

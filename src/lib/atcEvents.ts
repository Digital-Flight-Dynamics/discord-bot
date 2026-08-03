export const ATC_INTERNAL_EVENT_TYPES = [
    'moderation.action.created',
    'moderation.action.updated',
    'moderation.action.revoked',
    'appeal.submitted',
    'appeal.review_started',
    'appeal.approved',
    'appeal.denied',
] as const;

export type AtcInternalEventType = (typeof ATC_INTERNAL_EVENT_TYPES)[number];

export type AtcInternalEvent = {
    id: string;
    type: AtcInternalEventType;
    occurredAt: string;
    guildId: string;
    actionId: string;
    appealId?: string;
    actorUserId?: string;
};

const eventTypes = new Set<string>(ATC_INTERNAL_EVENT_TYPES);

export function parseAtcInternalEvent(value: unknown): AtcInternalEvent | null {
    if (!value || typeof value !== 'object') return null;
    const event = value as Record<string, unknown>;
    if (
        typeof event.id !== 'string' ||
        event.id.length < 1 ||
        event.id.length > 100 ||
        typeof event.type !== 'string' ||
        !eventTypes.has(event.type) ||
        typeof event.occurredAt !== 'string' ||
        !Number.isFinite(Date.parse(event.occurredAt)) ||
        typeof event.guildId !== 'string' ||
        !/^\d{17,20}$/.test(event.guildId) ||
        typeof event.actionId !== 'string' ||
        event.actionId.length < 1 ||
        event.actionId.length > 100
    ) {
        return null;
    }
    const isAppealEvent = event.type.startsWith('appeal.');
    if (isAppealEvent && (typeof event.appealId !== 'string' || event.appealId.length < 1 || event.appealId.length > 100)) {
        return null;
    }
    if (event.appealId !== undefined && typeof event.appealId !== 'string') return null;
    if (event.actorUserId !== undefined && (typeof event.actorUserId !== 'string' || !/^\d{17,20}$/.test(event.actorUserId))) {
        return null;
    }
    return event as AtcInternalEvent;
}

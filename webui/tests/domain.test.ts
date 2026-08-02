import { describe, expect, test } from 'bun:test';
import {
    actionStatus,
    appealEligibility,
    formatNaturalDuration,
    normalizeCaptchaAnswer,
    parseNaturalDuration,
    safeReturnPath,
    validateAppealAnswers,
    type PublicAction,
} from '../src/server/domain';

const baseAction: PublicAction = {
    actionId: 'A0701.26W-TEST',
    kind: 'warning',
    reason: 'Test reason',
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: null,
    durationMs: null,
    resolutionStatus: null,
    resolutionPublicNote: null,
    endedAt: null,
    appealId: null,
    appealStatus: null,
    appealSubmittedAt: null,
    appealDecidedAt: null,
};

describe('safeReturnPath', () => {
    test('keeps local paths and query strings', () => {
        expect(safeReturnPath('/action/ABC?from=table')).toBe('/action/ABC?from=table');
    });

    test('rejects external and protocol-relative redirects', () => {
        expect(safeReturnPath('https://example.com')).toBe('/my-history');
        expect(safeReturnPath('//example.com/path')).toBe('/my-history');
        expect(safeReturnPath('/\\example.com')).toBe('/my-history');
    });
});

describe('actionStatus', () => {
    test('prioritizes resolutions and pending appeals', () => {
        expect(actionStatus({ ...baseAction, resolutionStatus: 'revoked' })).toBe('revoked');
        expect(actionStatus({ ...baseAction, appealStatus: 'approved' })).toBe('appealed');
        expect(actionStatus({ ...baseAction, appealStatus: 'review' })).toBe('appeal submitted');
    });

    test('recognizes expired and active actions', () => {
        const now = new Date('2026-02-01T00:00:00.000Z');
        expect(actionStatus({ ...baseAction, expiresAt: '2026-01-02T00:00:00.000Z' }, now)).toBe('expired');
        expect(actionStatus(baseAction, now)).toBe('active');
    });
});

describe('natural moderation durations', () => {
    const now = new Date('2026-07-30T12:00:00.000Z');

    test('parses compact and conversational durations', () => {
        expect(parseNaturalDuration('3m', now)).toBe(180_000);
        expect(parseNaturalDuration('1 hour and 30 minutes', now)).toBe(5_400_000);
        expect(parseNaturalDuration('tomorrow at 4pm', now)).toBeGreaterThan(0);
        expect(parseNaturalDuration('not a duration', now)).toBeNull();
    });

    test('formats durations for editing', () => {
        expect(formatNaturalDuration(180_000)).toBe('3 Minutes');
        expect(formatNaturalDuration(5_400_000)).toBe('1 Hour 30 Minutes');
    });
});

describe('appealEligibility', () => {
    test('blocks open and approved appeals', () => {
        expect(appealEligibility({ ...baseAction, appealStatus: 'review' }).allowed).toBeFalse();
        expect(appealEligibility({ ...baseAction, appealStatus: 'approved' }).allowed).toBeFalse();
    });

    test('allows another appeal after the action-specific denial cooldown', () => {
        const denied = {
            ...baseAction,
            appealStatus: 'denied' as const,
            appealDecidedAt: '2026-01-01T00:00:00.000Z',
        };
        expect(appealEligibility(denied, new Date('2026-01-20T00:00:00.000Z')).allowed).toBeFalse();
        expect(appealEligibility(denied, new Date('2026-01-26T00:00:00.000Z')).allowed).toBeTrue();
        expect(
            appealEligibility(
                { ...denied, kind: 'ban' },
                new Date('2026-01-26T00:00:00.000Z'),
            ).allowed,
        ).toBeFalse();
    });
});

describe('appeal validation', () => {
    const valid = {
        ageConfirmation: 'ofAge',
        behavior: 'spamming',
        spammingDefinition: 'Spamming means repeatedly sending disruptive or unwanted messages.',
        spammedContent: 'I repeatedly sent the same message after it was no longer relevant.',
        moderatorStopCount: '1',
        moderatorReaction: 'resolved',
        reportedBefore: 'no',
        behaviorChange: 'I will slow down, read channel guidance, and stop immediately whenever a moderator asks me to stop.',
    };

    test('accepts complete branch-specific answers', () => {
        expect(validateAppealAnswers(valid, 'warning')).toEqual(valid);
        expect(validateAppealAnswers({ ...valid, behaviorChange: 'too short' }, 'warning')).toBeNull();
    });

    test('blocks underage, unsecured, and unlicensed paths', () => {
        expect(validateAppealAnswers({ ...valid, ageConfirmation: 'underAge' }, 'warning')).toBeNull();
        expect(validateAppealAnswers({ ...valid, behavior: 'compromised', accountSecured: 'no' }, 'ban')).toBeNull();
        expect(
            validateAppealAnswers(
                {
                    ...valid,
                    behavior: 'piracy',
                    piracyReason: 'pirated-msfs',
                    piratedSimVersion: 'Microsoft Flight Simulator 2024 from an unauthorized download.',
                    purchasedValidCopy: 'no',
                    piracyDetails: 'I downloaded and used an unauthorized copy of Microsoft Flight Simulator.',
                    piracyMotivation: 'I chose to do this because I did not want to pay for the simulator at the time.',
                },
                'ban',
            ),
        ).toBeNull();
    });

    test('validates compact piracy fields between 5 and 250 characters', () => {
        const piracy = {
            ...valid,
            behavior: 'piracy',
            piracyReason: 'pirated-msfs',
            piratedSimVersion: 'MSFS 2024',
            purchasedValidCopy: 'yes',
            piracyDetails: 'I downloaded and used an unauthorized copy of Microsoft Flight Simulator.',
            piracyMotivation: 'I chose to do this because I did not want to pay for the simulator at the time.',
            evidenceLinks: 'https://images.example/proof',
        };
        expect(validateAppealAnswers(piracy, 'ban')).not.toBeNull();
        expect(validateAppealAnswers({ ...piracy, piratedSimVersion: '2024' }, 'ban')).toBeNull();
        expect(validateAppealAnswers({ ...piracy, piratedSimVersion: 'x'.repeat(251) }, 'ban')).toBeNull();
    });

    test('accepts secured account and licensed-copy branches', () => {
        expect(
            validateAppealAnswers(
                {
                    ...valid,
                    behavior: 'compromised',
                    accountSecured: 'yes',
                },
                'ban',
            ),
        ).not.toBeNull();
        expect(
            validateAppealAnswers(
                {
                    ...valid,
                    behavior: 'piracy',
                    piracyReason: 'pirated-msfs',
                    piratedSimVersion: 'Microsoft Flight Simulator 2024 from an unauthorized download.',
                    purchasedValidCopy: 'yes',
                    piracyDetails: 'I downloaded and used an unauthorized copy of Microsoft Flight Simulator.',
                    piracyMotivation: 'I chose to do this because I did not want to pay for the simulator at the time.',
                    evidenceLinks: 'https://images.example/proof',
                },
                'ban',
            ),
        ).not.toBeNull();
    });

    test('normalizes human captcha answers', () => {
        expect(normalizeCaptchaAnswer('  Blue! ')).toBe('blue');
    });
});

import { expect, test } from 'bun:test';
import { canPurgeAction } from '../src/db/repositories/moderationActions';

test('action deletion requires a revoked or appeal-approved resolution', () => {
    expect(canPurgeAction({ resolutionStatus: 'revoked' })).toBeTrue();
    expect(canPurgeAction({ resolutionStatus: 'appeal-approved' })).toBeTrue();
    expect(canPurgeAction({ resolutionStatus: null })).toBeFalse();
    expect(canPurgeAction({ resolutionStatus: 'other' })).toBeFalse();
});

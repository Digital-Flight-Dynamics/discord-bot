import { describe, expect, test } from 'bun:test';
import { roles } from '../src/config';
import { atcAccessForRoleIds } from '../src/lib/atcInternalTools';

describe('ATC moderator RBAC', () => {
    test('grants moderator views to configured moderation roles', () => {
        expect(atcAccessForRoleIds([roles.moderator])).toMatchObject({
            moderator: true,
            messageTools: false,
        });
    });

    test('limits message tools to management or developers', () => {
        expect(atcAccessForRoleIds([roles.management])).toMatchObject({
            moderator: true,
            management: true,
            messageTools: true,
        });
        expect(atcAccessForRoleIds([roles.moderator, roles.developer])).toMatchObject({
            moderator: true,
            developer: true,
            messageTools: true,
        });
    });

    test('denies users without configured roles', () => {
        expect(atcAccessForRoleIds([])).toEqual({
            moderator: false,
            management: false,
            developer: false,
            messageTools: false,
        });
    });
});

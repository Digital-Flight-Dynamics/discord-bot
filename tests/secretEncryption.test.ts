import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../src/lib/secretEncryption';

const originalKey = process.env.BOT_SETTINGS_ENCRYPTION_KEY;
const originalNodeEnv = process.env.NODE_ENV;

describe('managed setting encryption', () => {
    beforeEach(() => {
        process.env.NODE_ENV = 'production';
        process.env.BOT_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64url');
    });

    afterEach(() => {
        if (originalKey === undefined) delete process.env.BOT_SETTINGS_ENCRYPTION_KEY;
        else process.env.BOT_SETTINGS_ENCRYPTION_KEY = originalKey;
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalNodeEnv;
    });

    test('round trips without storing plaintext', () => {
        const encrypted = encryptSecret('secret-api-key');
        expect(isEncryptedSecret(encrypted)).toBeTrue();
        expect(encrypted).not.toContain('secret-api-key');
        expect(decryptSecret(encrypted)).toBe('secret-api-key');
    });

    test('rejects modified ciphertext', () => {
        const encrypted = encryptSecret('secret-api-key');
        expect(() => decryptSecret(`${encrypted.slice(0, -1)}A`)).toThrow();
    });

    test('requires a valid production key', () => {
        delete process.env.BOT_SETTINGS_ENCRYPTION_KEY;
        expect(() => encryptSecret('secret-api-key')).toThrow('BOT_SETTINGS_ENCRYPTION_KEY is required');
    });
});

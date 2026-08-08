import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const prefix = 'enc:v1';

function decodeSegment(segment: string, name: string): Buffer {
    const decoded = Buffer.from(segment, 'base64url');
    if (decoded.toString('base64url') !== segment) {
        throw new Error(`Managed setting ${name} is invalid.`);
    }
    return decoded;
}

function encryptionKey(): Buffer | null {
    const encoded = process.env.BOT_SETTINGS_ENCRYPTION_KEY?.trim();
    if (!encoded) {
        if (process.env.NODE_ENV === 'production') throw new Error('BOT_SETTINGS_ENCRYPTION_KEY is required in production.');
        return null;
    }
    const key = Buffer.from(encoded, 'base64url');
    if (key.length !== 32) throw new Error('BOT_SETTINGS_ENCRYPTION_KEY must be a base64url-encoded 32-byte key.');
    return key;
}

export function assertSecretEncryptionConfigured(): void {
    encryptionKey();
}

export function encryptSecret(value: string): string {
    const key = encryptionKey();
    if (!key) return value;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [prefix, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
}

export function decryptSecret(value: string): string {
    if (!value.startsWith(`${prefix}:`)) return value;
    const key = encryptionKey();
    if (!key) throw new Error('BOT_SETTINGS_ENCRYPTION_KEY is required to decrypt managed settings.');
    const parts = value.split(':');
    if (parts.length !== 5) throw new Error('Managed setting ciphertext is invalid.');
    const iv = decodeSegment(parts[2]!, 'IV');
    const authTag = decodeSegment(parts[3]!, 'authentication tag');
    const ciphertext = decodeSegment(parts[4]!, 'ciphertext');
    if (iv.length !== 12 || authTag.length !== 16) throw new Error('Managed setting ciphertext is invalid.');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function isEncryptedSecret(value: string): boolean {
    return value.startsWith(`${prefix}:`);
}

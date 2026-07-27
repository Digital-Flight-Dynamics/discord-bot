import { resolveConfigName } from './load';

/**
 * True when running a local/dev workspace.
 * Used to gate destructive or write-to-disk tooling (e.g. .devchannels).
 */
export function isDevelopmentMode(): boolean {
    const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
    if (nodeEnv === 'development' || nodeEnv === 'dev') return true;

    const constants = resolveConfigName();
    if (constants === 'dev') return true;

    return false;
}

/** Config file that must never be rewritten by dev tooling. */
export function isProductionConstantsFile(): boolean {
    return resolveConfigName() === 'dfd-discord';
}

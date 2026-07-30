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

export interface DevSetupRuntime {
    configName: string;
    workspaceName: string;
    nodeEnv?: string;
    guildId: string | null;
    productionGuildId: string;
    productionConstantsFile: boolean;
}

/**
 * Fail closed unless every independent signal identifies a non-production
 * workspace and guild. Kept pure so the destructive setup command's guards
 * can be verified without loading Discord or mutating process environment.
 */
export function isDevSetupRuntimeAllowed(runtime: DevSetupRuntime): boolean {
    return (
        runtime.configName === 'dev' &&
        runtime.workspaceName === 'dev' &&
        runtime.nodeEnv?.toLowerCase() !== 'production' &&
        !runtime.productionConstantsFile &&
        runtime.guildId !== runtime.productionGuildId
    );
}

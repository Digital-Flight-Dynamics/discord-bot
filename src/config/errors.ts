/** Point operators at the right doc without cringe stack-trace essays. */
export const CONFIG_DOCS = 'DEVELOPMENT.md';

/**
 * Standard missing-channel log line.
 * `constantName` is the config path, e.g. `channels.memberCounter` or `channels.logs`.
 */
export function logMissingRequiredChannel(constantName: string): void {
    console.error(
        `[ERROR] Could not find required channel \`${constantName}\`. Bot is soft-locked. Read ${CONFIG_DOCS} for details.`,
    );
}

export function logMissingRequiredConfig(constantName: string): void {
    console.error(
        `[ERROR] Could not find required constant \`${constantName}\`. Bot is soft-locked. Read ${CONFIG_DOCS} for details.`,
    );
}

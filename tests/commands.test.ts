import { describe, expect, test } from 'bun:test';
import { commands } from '../src/commands';

describe('prefix command registry', () => {
    test('loads every command with an initialized category', () => {
        expect(commands.length).toBeGreaterThan(0);
        for (const command of commands) expect(command.category).toBeTruthy();
    });
});

import { ClientEvents } from 'discord.js';
import { autoKick } from './autoKick';
import { autoWhen } from './autoWhen';
import { cryptoScamDelete } from './cryptoScamDelete';
import { joinMessages, leaveMessages } from './joinLeave';
import { memberCounter } from './memberCounter';
import { addRole, removeRole } from './reactionRoles';

export interface UtilDefinition {
    event: keyof ClientEvents;
    execute: (...args: any[]) => void;
}

export default [addRole, autoKick, autoWhen, cryptoScamDelete, joinMessages, leaveMessages, memberCounter, removeRole];

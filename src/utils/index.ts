import { ClientEvents } from 'discord.js';
import { autoKick } from './autoKick';
import { autoroleOnBoot } from './autoroleOnBoot';
import { cryptoScamDelete } from './cryptoScamDelete';
import { joinMessages, leaveMessages } from './joinLeave';
import { memberCounter } from './memberCounter';
import { addRole, removeRole } from './reactionRoles';

type EventHandler<Event extends keyof ClientEvents> = (...args: ClientEvents[Event]) => void | Promise<void>;

export type UtilDefinition<Event extends keyof ClientEvents = keyof ClientEvents> = {
    event: Event;
    execute: EventHandler<Event>;
};

const utilDefinitions = [addRole, autoKick, autoroleOnBoot, cryptoScamDelete, joinMessages, leaveMessages, memberCounter, removeRole];

export default utilDefinitions;

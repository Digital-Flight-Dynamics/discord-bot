import Discord from 'discord.js';
import { marketplace } from './a350x/marketplace';
import { when } from './a350x/when';
import { help } from './general/help';
import { ban } from './moderation/ban';
import { dm } from './moderation/dm';
import { faq } from './a350x/faq';
import { info } from './moderation/info';
import { kick } from './moderation/kick';
import { purge } from './moderation/purge';
import { whois } from './moderation/whois';
import { rules } from './moderation/rules';

export const enum CommandCategories {
    A350X = 'A350X',
    GENERAL = 'General',
    MODERATION = 'Moderation',
}
export type CommandDefinition = {
    names: string[];
    description: string;
    category: CommandCategories;
    permissions?: Discord.PermissionString[];
    execute: Function;
};

export const commands: CommandDefinition[] = [marketplace, when, help, ban, dm, kick, purge, whois, info, faq, rules];

import Discord from 'discord.js';
import { when } from './a350x/when';
import { marketplace } from './a350x/marketplace';
import { faq } from './a350x/faq';
import { help } from './general/help';
import { whened } from './fun/whened';
import { whoosh } from './fun/whoosh';
import { info } from './moderation/info';
import { rules } from './moderation/rules';
import { purge } from './moderation/purge';
import { ban } from './moderation/ban';
import { idban } from './moderation/idban';
import { unban } from './moderation/unban';
import { kick } from './moderation/kick';
import { dm } from './moderation/dm';
import { whois } from './moderation/whois';

export const enum CommandCategories {
    A350X = 'A350X',
    GENERAL = 'General',
    FUN = 'Fun',
    MODERATION = 'Moderation',
}
export type CommandDefinition = {
    names: string[];
    description: string;
    category: CommandCategories;
    permissions?: Discord.PermissionString[];
    execute: Function;
};

export const commands: CommandDefinition[] = [
    when,
    marketplace,
    faq,
    help,
    whened,
    whoosh,
    info,
    rules,
    purge,
    ban,
    idban,
    unban,
    kick,
    dm,
    whois,
];

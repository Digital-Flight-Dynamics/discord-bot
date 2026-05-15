import type Discord from 'discord.js';
import { createEmbed } from '../lib/embed';
import { cabin } from './a350x/cabin';
import { faq } from './a350x/faq';
import { installer } from './a350x/installer';
import { liveries } from './a350x/liveries';
import { marketplace } from './a350x/marketplace';
import { simbrief } from './a350x/simbrief';
import { tools } from './a350x/tools';
import { variants } from './a350x/variants';
import { when } from './a350x/when';
import { whoosh } from './fun/whoosh';
import { help } from './general/help';
import { metar } from './general/metar';
import { taf } from './general/taf';
import { ban } from './moderation/ban';
import { banscam } from './moderation/banscam';
import { dm } from './moderation/dm';
import { info } from './moderation/info';
import { kick } from './moderation/kick';
import { purge } from './moderation/purge';
import { reactionroles } from './moderation/reactionroles';
import { removewarning } from './moderation/removewarning';
import { rules } from './moderation/rules';
import { timeout } from './moderation/timeout';
import { unban } from './moderation/unban';
import { warn } from './moderation/warn';
import { warnings } from './moderation/warnings';
import { whois } from './moderation/whois';
import { msfs } from './support/msfs';

export enum CommandCategories {
    A350X = 'A350X',
    GENERAL = 'General',
    FUN = 'Fun',
    MODERATION = 'Moderation',
    SUPPORT = 'Support',
}
export type CommandDefinition = {
    names: string[];
    description: string;
    category: CommandCategories;
    permissions?: Discord.PermissionsString[];
    execute: (message: Discord.Message, args: Array<string>) => Promise<any>;
};
export const createErrorEmbed = (description: string) => createEmbed({ color: 0xff0000, title: 'Error', description });

export const commands: CommandDefinition[] = [
    when,
    marketplace,
    faq,
    help,
    metar,
    taf,
    whoosh,
    info,
    rules,
    reactionroles,
    purge,
    ban,
    banscam,
    unban,
    kick,
    dm,
    whois,
    warn,
    warnings,
    removewarning,
    msfs,
    cabin,
    variants,
    simbrief,
    liveries,
    timeout,
    tools,
    installer,
];

import Discord from 'discord.js';
import { when } from './a350x/when';
import { marketplace } from './a350x/marketplace';
import { faq } from './a350x/faq';
import { help } from './general/help';
import { metar } from './general/metar';
import { taf } from './general/taf';
import { whoosh } from './fun/whoosh';
import { info } from './moderation/info';
import { rules } from './moderation/rules';
import { reactionroles } from './moderation/reactionroles';
import { purge } from './moderation/purge';
import { ban } from './moderation/ban';
import { unban } from './moderation/unban';
import { kick } from './moderation/kick';
import { dm } from './moderation/dm';
import { whois } from './moderation/whois';
import { msfs } from './support/msfs';
import { cabin } from './a350x/cabin';
import { variants } from './a350x/variants';
import { simbrief } from './a350x/simbrief';
import { liveries } from './a350x/liveries';

export const enum CommandCategories {
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
export const createErrorEmbed = (description: string) => new Discord.EmbedBuilder().setColor('#FF0000').setTitle('Error').setDescription(description);

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
    unban,
    kick,
    dm,
    whois,
    msfs,
    cabin,
    variants,
    simbrief,
    liveries,
];

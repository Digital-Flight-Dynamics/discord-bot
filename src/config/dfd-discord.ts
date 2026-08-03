import type { BotWorkspaceConfig } from './types';

/**
 * Production Digital Flight Dynamics Discord server.
 * Selected with CONSTANTS_FILE=dfd-discord (the production default).
 */
const dfdDiscord: BotWorkspaceConfig = {
    name: 'dfd-discord',
    guildId: '808790838163406848',
    communityInviteUrl: 'https://discord.com/invite/JtcFmhcAME',
    prefix: '.',

    channels: {
        announcements: '808791125119729716',
        botMessages: '1044354048758915112',
        commands: '808791531427332136',
        events: '855704802704883733',
        faq: '927315090380841040',
        info: '808810478574501918',
        logs: '808804241350197258',
        modLogs: '1532143866986365151',
        honeypot: '1526646404557049897',
        management: '908006127118204939',
        memberArrivals: '808793231621750815',
        memberCounter: '818980706516336650',
        memberDepartures: '814292355661299713',
        memberMedia: '808791551319867502',
        memberResources: '808791262454480926',
        progress: '808791139757981727',
        qAndA: '808791475206094928',
        roles: '808791055184691211',
        suggestions: '808791599517663252',
    },

    roles: {
        management: '808792384112558100',
        moderator: '809149811357777920',
        developer: '808792308287537192',
        contributor: '826583070421286952',
        verifiedPilot: '895270202877550612',
        providers: '895289302311911454',
        contentCreator: '888759592144740392',
        serverBooster: '811447209912565782',
        announcements: '808794106003193867',
        progress: '808794053205688381',
        events: '855698159257911327',
        member: '808792283515191326',
    },

    roleGroups: {
        projectTeam: [
            '808792384112558100', // management
            '809149811357777920', // moderator
            '808792308287537192', // developer
            '826583070421286952', // contributor
        ],
        moderation: ['808792384112558100', '809149811357777920'],
        team: ['808792384112558100', '809149811357777920', '808792308287537192'],
        dfd: [
            '808792384112558100',
            '809149811357777920',
            '808792308287537192',
            '826583070421286952',
        ],
    },

    emojis: {
        announcement: '📣',
        progress: '❕',
        events: '✈',
    },

    presence: {
        intervalMs: 60_000,
        statuses: [
            { name: 'the A350X', type: 'watching' },
            { name: 'Digital Flight Dynamics', type: 'watching' },
            { name: '.help', type: 'listening' },
            { name: 'MSFS 2024', type: 'playing' },
        ],
    },
};

export default dfdDiscord;

export enum Colors {
    DFD_ORANGE         = 0xF1BE4E,
    DFD_DARK_PINK      = 0x9B2358,
    DFD_RED_ORANGE     = 0xCD5530,
    DFD_CYAN           = 0x01FCC9,
    ERROR              = 0xff0000,
    WARNING            = 0xffde00,
    INFORMATION        = 0x2652ee,
    SUCCESS            = 0x3ef319,
    EMBED_TRANSPARENT  = 0x36393e
}

export const enum CommandCategories {
    A350X       = 'A350X',
    GENERAL     = 'General',
    FUN         = 'Fun',
    MODERATION  = 'Moderation',
    SUPPORT     = 'Support',
}

export enum Roles { 
    MANAGEMENT       = "808792384112558100",
    MODERATOR        = "809149811357777920",
    DEVELOPER        = "808792308287537192",
    CONTRIBUTOR      = "826583070421286952",
    VERIFIED_PILOT   = "895270202877550612",
    PROVIDERS        = "895289302311911454",
    CONTENT_CREATOR  = "888759592144740392",
    SERVER_BOOSTER   = "811447209912565782",
}

export const RoleGroups = {
    MODERATION: [
        Roles.MANAGEMENT, 
        Roles.MODERATOR
    ],
    TEAM: [
        Roles.MANAGEMENT, 
        Roles.MODERATOR, 
        Roles.DEVELOPER
    ],
    DFD: [
        Roles.MANAGEMENT, 
        Roles.MODERATOR, 
        Roles.DEVELOPER, 
        Roles.CONTRIBUTOR
    ],
    PILOTS: [
        Roles.VERIFIED_PILOT, 
        Roles.VERIFIED_PILOT
    ],
    SUPPORTERS: [
        Roles.SERVER_BOOSTER
    ]
};

export enum Channels {
    ANNOUNCEMENTS      = "808791125119729716",
    BOT_MESSAGES       = "1044354048758915112",
    EVENTS             = "855704802704883733",
    FAQ                = "927315090380841040",
    INFO               = "808810478574501918",
    LOGS               = "808804241350197258",
    MANAGEMENT         = "908006127118204939",
    MEMBER_ARRIVALS    = "808793231621750815",
    MEMBER_COUNTER     = "818980706516336650",
    MEMBER_DEPARTURES  = "814292355661299713",
    MEMBER_MEDIA       = "808791551319867502",
    MEMBER_RESOURCES   = "808791262454480926",
    PROGRESS           = "808791139757981727",
    Q_AND_A            = "808791475206094928",
    ROLES              = "808791055184691211",
    SUGGESTIONS        = "808791599517663252"
}


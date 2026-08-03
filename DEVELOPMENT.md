# Development

Local setup, workspace constants, and dev-only tooling for this bot.

## Prerequisites

- Bun 1.3.12+
- PostgreSQL (for moderation persistence)
- A Discord bot token with the intents enabled in the Developer Portal (Guilds, Members, Messages, Message Content, etc.)

## First-time setup

```bash
cp .env.example .env
# Edit .env: BOT_TOKEN, DATABASE_URL, CONSTANTS_FILE=dev, …

cp src/config/dev.example.ts src/config/dev.ts
# Fill snowflakes, or use `.devchannels create` (see below)

bun install
bun run dev          # also ensures Postgres schema from drizzle/*.sql on boot
```

`bun run dev` sets `CONSTANTS_FILE=dev` and uses Bun's built-in watch mode.

## Environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `BOT_TOKEN` | yes | Discord bot token |
| `DATABASE_URL` | yes | Postgres connection string |
| `ATC_URL` | yes | Moderation portal base URL; placeholder values soft-lock the bot |
| `ATC_INTERNAL_API_KEY` | production | Shared secret for authenticated ATC → bot events; use a long random value |
| `CONSTANTS_FILE` | no | Workspace constants module name (see below). Dev script defaults to `dev`. |
| `HEALTH_PORT` | no | Health HTTP port (default `3000`) |
| `INTERNAL_API_HOST` | no | Bind address for health/events (default `0.0.0.0`; keep the port private) |
| `NODE_ENV` | no | Must not be `production` for destructive dev setup commands |

Persistence is **PostgreSQL only** (Drizzle). On boot the bot runs SQL schema ensure from `drizzle/*.sql` (idempotent DDL). You can also run `bun run db:migrate` manually.

## ATC internal event API

The health server also exposes `POST /internal/events`. Requests require
`Authorization: Bearer <ATC_INTERNAL_API_KEY>` and a validated event envelope.
ATC uses it to notify Discord when appeals are submitted and the same endpoint
supports appeal lifecycle and moderation-action events. The endpoint also
rejects clients whose socket address is not loopback or part of a private IP
range.

For Coolify, bind the bot to `0.0.0.0` inside its container but **do not publish
port 3000 publicly**. Set ATC's `BOT_INTERNAL_API_URL` to the bot's private
service address (for example, `http://discord-bot:3000`). Containers cannot
reach each other through `127.0.0.1`.

Supported event types:

- `appeal.submitted`, `appeal.review_started`, `appeal.approved`, `appeal.denied`
- `moderation.action.created`, `moderation.action.updated`, `moderation.action.revoked`

## Workspace constants (`CONSTANTS_FILE`)

Guild-specific IDs (channels, roles, emojis, prefix) live under `src/config/`:

| File | Purpose |
|------|---------|
| `dfd-discord.ts` | Production DFD server |
| `dev.example.ts` | Template for personal/test workspaces |
| `dev.ts` | Your local workspace (**gitignored** — copy from example) |

### Selection

| Situation | Config loaded |
|-----------|----------------|
| `bun run dev` | `dev` (`CONSTANTS_FILE=dev` in the script) |
| `CONSTANTS_FILE=dfd-discord` | production constants |
| `bun start` / unset (not under `dev` lifecycle) | `dfd-discord` |

Override examples:

```bash
CONSTANTS_FILE=dfd-discord bun run dev   # hit prod IDs while developing
CONSTANTS_FILE=dev bun start             # unusual; still needs dev.ts
```

Import anywhere:

```ts
import { channels, roles, prefix, config } from '../config';
```

Embed palette is **not** in workspace config — see `src/lib/embed.ts` (`EmbedColors`).

### Log channels

| Config key | Bootstrap name | Purpose |
|------------|----------------|---------|
| `channels.logs` | `audit-logs` | Message/role/channel changes, Discord ban events |
| `channels.modLogs` | `mod-logs` | Bot punishments (warn/kick/ban/timeout). Each post starts a **thread**; message/thread IDs are stored in `mod_log_messages` for later interactions. |

### Action IDs (public)

Staff-facing **Action IDs** are short codes, not UUIDs. Internal rows still use UUID primary keys.

**Format:** `A` + `DD` + `MM` + `.` + `YY` + kind + `-` + 16 hexadecimal characters

| Part | Meaning |
|------|---------|
| `A` | Action prefix |
| `DD` | UTC day (`01`–`31`) |
| `MM` | UTC month (`01`–`12`) |
| `.` | Separator |
| `YY` | UTC year (e.g. `26`) |
| kind | `T` timeout · `W` warning · `K` kick · `B` ban · `S` softban |
| `-` | Separator |
| suffix | 64 bits of cryptographically secure random hexadecimal data |

Example: `A0701.26W-9E6B9F5A81D2C407` (warning, 2026-01-07).

IDs are reserved in the `action_ids` table; collisions regenerate until unique.

### Rotating presence

Optional `presence` block in the constants file:

```ts
presence: {
    intervalMs: 60_000, // min 10s enforced
    statuses: [
        { name: 'the A350X', type: 'watching' },
        { name: '.help', type: 'listening' },
        { name: 'MSFS 2024', type: 'playing', status: 'online' },
    ],
},
```

| Field | Values |
|-------|--------|
| `type` | `playing` · `watching` · `listening` · `competing` · `custom` |
| `status` | `online` · `idle` · `dnd` · `invisible` (per entry; default `online`) |

Soft-lock overrides this with **DND** and activity `-`.

## Soft-lock

If workspace constants are empty (placeholder IDs) or startup hits a **config / database connection** error, the bot still logs in but:

- Presence is **Do Not Disturb** (no custom activity text)
- Only simple commands work: `.help` · `.ping` · `.whoosh` · `.devchannels`
- Expiry worker is skipped until DB is healthy

Fix constants (e.g. `.devchannels create`) and restart to clear the lock.

## Dev-only command: `.devchannels`

Only runs when the bot is in **development mode**:

- `CONSTANTS_FILE` resolves to `dev`, or
- `NODE_ENV` is `development` / `dev`

It **refuses** to run against `dfd-discord` so production IDs are never rewritten.

Requires `ManageChannels` (and the bot needs channel manage permission in the guild).

### `.devchannels create`

Bootstraps channels for the current guild and writes IDs into the active constants file (`src/config/dev.ts`):

1. For each channel key in the config:
   - If the configured ID already exists in the guild → **skip**
   - Else if a channel with the **same name** exists (exact match) → **use that ID**
   - Else → **create** the channel (text, except member counter → voice)
2. Updates `guildId` and channel snowflakes in the constants file
3. Updates the in-memory config for the running process

Useful on a fresh test server (e.g. only a general channel left).

### `.devchannels cleanup`

Deletes **every** channel in the guild **except** the channel where you ran the command, then **resets** all channel / `guildId` snowflakes in the active constants file to placeholders. Use carefully — irreversible.

## Scripts

| Script | Purpose |
|--------|---------|
| `bun run dev` | Bun watch mode for both the bot and Web UI, `CONSTANTS_FILE=dev` |
| `bun run build` | `tsc` → `out/` |
| `bun start` | Run compiled bot (connects to Postgres + ensures schema) |
| `bun run db:migrate` | Apply SQL files in `drizzle/` (same schema ensure, manual) |
| `bun run db:generate` | Generate migrations from schema |


## Health check

With the bot running:

```text
GET http://127.0.0.1:3000/health
```

(`HEALTH_PORT` if set; otherwise default `3000`.)

## Contributing

See [.github/CONTRIBUTING.md](./.github/CONTRIBUTING.md).

# Development

Local setup, workspace constants, and dev-only tooling for this bot.

## Prerequisites

- Node 18+
- PostgreSQL (for moderation persistence)
- A Discord bot token with the intents enabled in the Developer Portal (Guilds, Members, Messages, Message Content, etc.)

## First-time setup

```bash
cp .env.example .env
# Edit .env: BOT_TOKEN, DATABASE_URL, CONSTANTS_FILE=dev, …

cp src/config/dev.example.ts src/config/dev.ts
# Fill snowflakes, or use `.devchannels create` (see below)

npm install
npm run dev          # also ensures Postgres schema from drizzle/*.sql on boot
```

`npm run dev` / `bun run dev` set `CONSTANTS_FILE=dev` by default and run with nodemon + ts-node.

## Environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `BOT_TOKEN` | yes | Discord bot token |
| `DATABASE_URL` | yes | Postgres connection string |
| `CONSTANTS_FILE` | no | Workspace constants module name (see below). Dev script defaults to `dev`. |
| `GUILD_ID` | no | Fallback guild for expiry worker |
| `HEALTH_PORT` | no | Health HTTP port (default `3000`) |
| `AVWX_KEY` | no | METAR/TAF |
| `NODE_ENV` | no | Use `development` to enable dev-only commands |

Persistence is **PostgreSQL only** (Drizzle). On boot the bot runs SQL schema ensure from `drizzle/*.sql` (idempotent DDL). You can also run `npm run db:migrate` manually.

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
| `npm run dev` / `bun run dev` | `dev` (`CONSTANTS_FILE=dev` in the script) |
| `CONSTANTS_FILE=dfd-discord` | production constants |
| `npm start` / unset (not under `dev` lifecycle) | `dfd-discord` |

Override examples:

```bash
CONSTANTS_FILE=dfd-discord npm run dev   # hit prod IDs while developing
CONSTANTS_FILE=dev npm start             # unusual; still needs dev.ts
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

**Format:** `A` + `DD` + `MM` + `.` + `YY` + kind + `NN` + `-` + `X|Y|Z`

| Part | Meaning |
|------|---------|
| `A` | Action prefix |
| `DD` | UTC day (`01`–`31`) |
| `MM` | UTC month (`01`–`12`) |
| `.` | Separator |
| `YY` | UTC year (e.g. `26`) |
| kind | `T` timeout · `W` warning · `K` kick · `B` ban · `S` softban |
| `NN` | Random `00`–`99` |
| `-` | Separator |
| letter | Random `X`, `Y`, or `Z` |

Examples: `A0701.26W42-X` (warning, 2026-01-07), `A2607.26T03-Y` (timeout, 2026-07-26), `A1512.26S88-Z` (softban, 2026-12-15).

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
| `npm run dev` | Watch + ts-node, `CONSTANTS_FILE=dev` |
| `npm run build` | `tsc` → `out/` |
| `npm start` | Run compiled bot (connects to Postgres + ensures schema) |
| `npm run db:migrate` | Apply SQL files in `drizzle/` (same schema ensure, manual) |
| `npm run db:generate` | Generate migrations from schema |

> `scripts/migrate-mongo-warnings.ts` remains for a possible one-shot historical import later; it is not wired into npm scripts or boot (Postgres only at runtime).

## Health check

With the bot running:

```text
GET http://127.0.0.1:3001/health
```

(`HEALTH_PORT` if set; otherwise default `3000`.)

## Contributing

See [.github/CONTRIBUTING.md](./.github/CONTRIBUTING.md).

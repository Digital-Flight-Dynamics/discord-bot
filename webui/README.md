# ATC Web UI

The user-facing moderation and appeals portal for Digital Flight Dynamics. It is
an independent Bun package: Astro builds the browser application and Elysia
serves it alongside the authenticated API.

## Local setup

```bash
cp .env.example .env
bun install
bun run db:migrate
bun run build
bun run start
```

The `start`, `dev`, and `db:migrate` commands load the repository-level
`../.env` first and then `webui/.env`. This lets ATC reuse the bot's
`DATABASE_URL`, while web-specific Discord OAuth values stay in `webui/.env`.
Values in `webui/.env` take precedence.

The Discord guild ID and community invite URL come from the selected bot
constants file (`CONSTANTS_FILE`). They are not duplicated in ATC environment
configuration.

Elysia binds to `0.0.0.0` by default, making the development server reachable
from other devices on the network. Set `HOST=127.0.0.1` to restrict it locally.

Create a Discord OAuth application redirect for
`http://localhost:4321/auth/discord/callback`. The OAuth application only needs
the `identify` scope.

During UI work, run `bun run build` after browser-source changes. Elysia serves
the generated `dist/` directory.

## Commands

- `bun run build` — build the Astro frontend
- `bun run start` — serve the built frontend and API
- `bun run dev` — build, then restart Elysia when server files change
- `bun run check` — type-check Astro and run Bun tests
- `bun run db:migrate` — apply ATC-owned database migrations

Build the ATC container from the repository root so its selected constants are
available:

```bash
docker build -f webui/Dockerfile -t dfd-atc .
```

The bot and ATC share the moderation database, but ATC owns only tables prefixed
with `atc_`. Private moderation-note columns are deliberately never selected by
the user-facing API.

ATC publishes appeal events to the bot's authenticated internal API. In
production, set `BOT_INTERNAL_API_URL` to the bot's private service URL and set
the same `ATC_INTERNAL_API_KEY` on both containers. Do not expose the bot's
internal API port publicly.

## Known follow-up

Improve the history and appeals model so denied and previous appeals have clear
signals throughout Discord and ATC, rather than relying mainly on edited
original messages and new log entries. The data model and UI should also support
multiple appeals for one action cleanly.

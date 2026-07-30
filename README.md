<img src="https://github.com/Digital-Flight-Dynamics/discord-bot/blob/master/.github/LogoWithText.png?raw=true">

# Digital Flight Dynamics Discord Bot

[![Discord](https://img.shields.io/discord/808790838163406848.svg?label=&logo=discord&logoColor=ffffff&color=7289DA&labelColor=7289DA)](https://discord.gg/REGJgP4gZd)

Official bot for the [Digital Flight Dynamics](https://discord.gg/REGJgP4gZd) Discord server.

## Quick start

```bash
cp .env.example .env          # fill BOT_TOKEN, DATABASE_URL, …
bun install
bun run dev                   # connects to Postgres + ensures schema on boot
# or: bun start (after bun run build)
```

## Docs

| Doc | Contents |
|-----|----------|
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Local setup, workspace constants, env vars, dev commands |
| [CONTRIBUTING.md](./.github/CONTRIBUTING.md) | How to contribute |

## License

AGPL-3.0 — see [LICENSE](./LICENSE).

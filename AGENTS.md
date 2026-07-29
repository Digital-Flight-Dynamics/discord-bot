# Development notes

- Use **Bun** for all local scripts, dependency changes, CI, and Docker builds. Do not use npm, npx, Node, or ts-node.
- The project has no automated test suite yet. Before a change is accepted, run `bun run check` and manually exercise the affected Discord command/workflow in a development guild.
- Moderation authority is role-based (`roleGroups.moderation`, with configured management/moderator roles as fallbacks). Do not gate staff moderation commands on Discord permission flags.
- Keep moderation text within `src/lib/moderationLimits.ts`; embeds must retain a link to ATC when content is truncated.

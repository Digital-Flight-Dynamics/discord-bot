FROM oven/bun:1.3.12 AS build
WORKDIR /app/webui
COPY webui/package.json webui/bun.lock ./
RUN bun install --frozen-lockfile
COPY webui .
COPY src/config /app/src/config
RUN bun run build

FROM oven/bun:1.3.12-slim
WORKDIR /app/webui
ENV NODE_ENV=production
ENV HOST=0.0.0.0
COPY webui/package.json webui/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/webui/dist ./dist
COPY --from=build /app/webui/src/server ./src/server
COPY --from=build /app/webui/src/server.ts ./src/server.ts
COPY --from=build /app/webui/drizzle ./drizzle
COPY --from=build /app/src/config /app/src/config
USER bun
EXPOSE 4321
CMD ["bun", "src/server.ts"]

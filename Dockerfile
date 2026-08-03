FROM oven/bun:1.3.12 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3.12-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/out ./out
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
USER bun
EXPOSE 3000
CMD ["bun", "out/src/index.js"]

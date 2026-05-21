FROM oven/bun:1.3.12 AS production-dependencies

WORKDIR /bot

COPY package.json bun.lock ./
RUN HUSKY=0 bun install --frozen-lockfile --production

FROM oven/bun:1.3.12 AS runtime

WORKDIR /bot
ENV NODE_ENV=production

COPY package.json bun.lock ./
COPY --from=production-dependencies /bot/node_modules ./node_modules
COPY src ./src

CMD ["bun", "run", "start"]

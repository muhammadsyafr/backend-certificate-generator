FROM docker.io/oven/bun:1-alpine AS build

WORKDIR /app

RUN apk add --no-cache python3 make g++
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY src ./src
RUN bun build ./src/index.ts --target bun --outdir ./dist

FROM docker.io/oven/bun:1-alpine

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

RUN mkdir -p /app/data && chown -R appuser:appgroup /app

USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:4000/health || exit 1

ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/app/data

CMD ["bun", "run", "dist/index.js"]

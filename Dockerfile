FROM node:22-alpine AS build

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY .env.production ./
COPY src ./src
RUN npx tsc && npm prune --omit=dev

FROM node:22-alpine

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/.env.production ./

RUN mkdir -p /app/data /app/certs && chown -R node:node /app

USER node

EXPOSE 4000 4443

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENV NODE_ENV=production \
    PORT=4000 \
    SSL_PORT=4443 \
    SSL_CERT_PATH=/app/certs/server.crt \
    SSL_KEY_PATH=/app/certs/server.key \
    DATA_DIR=/app/data

CMD ["node", "dist/index.js"]

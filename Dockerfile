# syntax=docker/dockerfile:1
# Single-image production build: Express serves the API + the built React SPA.

# ---- Build the web (Vite SPA) ----
FROM node:20-slim AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- Build the server (TypeScript → dist) ----
FROM node:20-slim AS server
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate && npm run build

# ---- Runtime ----
FROM node:20-slim AS runtime
WORKDIR /app/server
ENV NODE_ENV=production
ENV WEB_DIST=/app/server/web-dist
ENV PORT=4000
# Server deps + generated Prisma client + CLI (needed for `migrate deploy`)
COPY --from=server /app/server/node_modules ./node_modules
COPY --from=server /app/server/dist ./dist
COPY server/package*.json ./
COPY server/prisma ./prisma
# Built SPA, served by Express in production (see WEB_DIST handling in app.ts)
COPY --from=web /app/web/dist ./web-dist
EXPOSE 4000
# Apply pending migrations, then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/index.js"]

# Deploying POS Suite

The app ships as a **single Docker image**: the Express server serves both the JSON
API and the built React SPA (so there's one port, no separate web host, no CORS to
configure). PostgreSQL runs alongside it.

## Quick start (Docker Compose)

```bash
cp .env.example .env
# Edit .env and set at least:
#   JWT_SECRET=<a long random string>
#   DB_PASSWORD=<a strong db password>
#   APP_PORT=4000            # host port to expose (optional)

docker compose -f docker-compose.prod.yml up -d --build
```

- The `app` container runs `prisma migrate deploy` on start (creates/updates the
  schema), then launches the server on port 4000.
- Open `http://<host>:<APP_PORT>` — the first run lands on the **/setup wizard** to
  create the admin user, store info, and license (or start the 14-day demo).
- Product images are persisted in the `pos_uploads` volume; data in `pos_pgdata`.

## What the image does

- `Dockerfile` (multi-stage): builds the SPA (`web`), compiles the server (`server`),
  then a slim runtime that serves both. `WEB_DIST` points Express at the built SPA;
  any non-`/api`, non-`/uploads`, non-`/ws` GET falls back to `index.html`.
- Migrations are applied with `prisma migrate deploy` (production-safe; no prompts).

## Environment variables

| Var | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection (set by compose) | — |
| `JWT_SECRET` | Auth token signing secret — **required** | — |
| `CORS_ORIGIN` | Allowed origin for the API | `*` |
| `PORT` | Server port inside the container | `4000` |
| `WEB_DIST` | Path to the built SPA (set by the image) | unset (dev: Vite serves it) |

## Behind a reverse proxy (HTTPS)

Terminate TLS at nginx/Caddy/Traefik and proxy to the app container. The app also
exposes a WebSocket at `/ws/display` (customer second display) — make sure the proxy
forwards `Upgrade`/`Connection` headers. Example (nginx):

```nginx
location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

## Backups

Use the in-app **สำรอง / กู้คืนข้อมูล** page (admin) to download/restore a full JSON
snapshot, and/or snapshot the `pos_pgdata` volume / run `pg_dump` against Postgres.

## Local development (unchanged)

```bash
npm run db:up        # Postgres in Docker (port preflight)
npm run db:migrate && npm run db:seed
npm run dev          # server :4000 + Vite web :5173
```

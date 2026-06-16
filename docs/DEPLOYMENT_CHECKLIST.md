# Railway deployment checklist

Use with [SETUP.md §13](../SETUP.md) and [`.env.production.example`](../.env.production.example).

## Railway services

1. **PostgreSQL** — one database per environment
2. **Web** — this repo; branch `main` (or your deploy branch)
3. **Volume** (recommended) — mount `/app/public/uploads` on the web service

## Build & start (from `railway.toml`)

| Step | Command |
|------|---------|
| Build | `npm run build` → `vite build` → `Frontend/dist` |
| Start | `npm start` → migrations + `node server/index.js` |
| Health | `GET /api/health` |

## Web service variables

| Variable | Required | Notes |
|----------|----------|-------|
| `NODE_ENV` | Yes | `production` |
| `PORT` | Yes | `8080` |
| `DATABASE_URL` | Yes | **Variable reference** `${{Postgres.DATABASE_URL}}` — never empty, never type password manually |
| `BETTER_AUTH_URL` | Yes | `https://YOUR-DOMAIN.up.railway.app` |
| `BETTER_AUTH_SECRET` | Yes | Min 32 chars; **same as local** if restoring backup |
| `AES_256_SECRET_KEY` | Yes | 64 hex chars; **same as local** if restoring backup |
| `AUTH_DISABLE_SIGNUP` | Yes | `true` |
| `AUTH_REQUIRE_MFA_ALL` | Yes | `true` |
| `SMTP_*` | Yes | Gmail app password for OTP |
| `BETTER_AUTH_API_KEY` | No | Infra dash/audit; app starts without it |
| `TRUST_PROXY` | No | Defaults to `1` in production |

## Domain

1. **Rem → Settings → Networking → Generate Domain**
2. Target port: **8080** (not 5173)
3. Set `BETTER_AUTH_URL=https://...` and redeploy

## First deploy (empty DB)

```powershell
railway login
railway link
railway run npm run db:migrate   # also runs on each deploy via npm start
railway run npm run db:seed      # set SEED_ADMIN_* first
railway run npm run smtp:test
```

## Existing local data

1. Local admin → **Data Backup** → download `.lnbak`
2. Deploy Railway with **same** `BETTER_AUTH_SECRET` and `AES_256_SECRET_KEY` as local
3. Seed admin (or use restored credentials after pg restore)
4. Admin → **Data Backup** → upload `.lnbak` → Restore

## Verify

- `https://YOUR-DOMAIN/api/health` → `"database": "connected"`
- Site root loads login SPA
- Admin login + OTP works

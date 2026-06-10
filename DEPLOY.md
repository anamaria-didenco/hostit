# Deploying VenueFlowHQ off Replit → Render

This app is a standard **Node (Express) + Vite client + Postgres** app. It needs:
a Node host, a Postgres database, and a custom domain. The repo ships a
`render.yaml` Blueprint so Render can create all of that from GitHub.

`npm run build` → `vite build` (client) + esbuild the server to `dist/index.js`.
`npm start` → `node dist/index.js`. The server reads `PORT` (Render sets it) and
runs DB migrations automatically on boot. **Push to `main` → Render auto-deploys.**

## What lives where (important)
- **SMTP (email), NowBookIt keys, venue settings** live in the **database**
  (`venue_settings` table), NOT in env vars — so they come across automatically
  when you migrate the data. Nothing to re-enter.
- **Login** is self-contained password auth (no Replit needed): set `ADMIN_PASSWORD`.
- **Only the AI "paste-to-parse" + maps helpers** used Replit's built-in proxy
  (`BUILT_IN_FORGE_*`). Core app works without them; to keep the AI helpers,
  set a real OpenAI key (`AI_INTEGRATIONS_OPENAI_API_KEY` + `_BASE_URL`).

## Environment variables
| Variable | Required? | Value |
|---|---|---|
| `DATABASE_URL` | ✅ (auto) | Provided by the Render database (wired in `render.yaml`) |
| `JWT_SECRET` | ✅ (auto) | Render generates it. Signs login sessions. |
| `ADMIN_PASSWORD` | ✅ **you set** | Your login password for the app |
| `NODE_ENV` | ✅ (auto) | `production` |
| `PUBLIC_BASE_URL` | recommended | `https://venueflowhq.com` |
| `REPORT_EMAIL` | optional | `anamaria@barfranco.nz` (weekly report) |
| `DEPOSIT_PROMPT_EMAIL` | optional | `anamaria@barfranco.nz` (deposit reminder) |
| `REPORT_WEEKDAY` / `REPORT_HOUR` | optional | default Mon / 08 (NZ) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` + `_BASE_URL` | only for AI helpers | your OpenAI key + `https://api.openai.com/v1` |

## Step-by-step
1. **Create a Render account** at render.com (sign in with GitHub).
2. **New → Blueprint** → pick the `anamaria-didenco/hostit` repo → Render reads
   `render.yaml` and proposes the web service + Postgres database. Click **Apply**.
3. When it asks, **set `ADMIN_PASSWORD`** (your app login password). Optionally
   add the OpenAI key if you want the AI helpers.
4. Wait for the first build/deploy to finish (a few minutes). It'll be live at a
   temporary `*.onrender.com` URL.
5. **Migrate the data** (Replit Postgres → Render Postgres):
   - In Replit: open the Database tool → copy the Postgres connection string.
   - In Render: open the `venueflowhq-db` → copy its **External** connection string.
   - From a terminal (or ask Claude to run it):
     ```bash
     pg_dump "<REPLIT_DATABASE_URL>" --no-owner --no-privileges -Fc -f vf.dump
     pg_restore --no-owner --no-privileges -d "<RENDER_EXTERNAL_DATABASE_URL>" vf.dump
     ```
   - This copies every event, booking, enquiry, runsheet, setting, etc.
6. **Point the domain**: in Render → the web service → Settings → Custom Domains →
   add `venueflowhq.com` (and `www`). Render shows the DNS records to set at your
   domain registrar. Add them; once verified + SSL issues, the site is live on Render.
7. **Turn off the Replit deployment** once you've confirmed Render is serving
   venueflowhq.com correctly.

## After cutover
- The weekly enquiry report now fires reliably (Render starter is always-on).
- Future changes: push to `main` → Render auto-deploys. No more "republish."

# Rice Flight Log — Cloudflare Worker + D1

This is the Cloudflare-hosted version of the Rice Flight Log dashboard. It replaces the
Claude Artifact version (which could only be shared with people inside the same
organization on a paid plan) with a normal website anyone can open, backed by a
real SQL database (Cloudflare D1).

- `public/index.html` — the dashboard itself (unchanged design, now talks to a small API instead of the Artifact database)
- `src/index.ts` — the Cloudflare Worker: serves the dashboard and a JSON/CSV API for the `flights` table
- `schema.sql` — the D1 table definition
- `seed.sql` — the 46 flights already transcribed, exported from the Claude Artifact database, ready to load into D1
- `wrangler.jsonc` — Cloudflare configuration (Worker name, D1 binding, static assets)

## One-time setup

You'll need a free Cloudflare account (cloudflare.com → sign up) and Node.js installed
(you already have this if you can run `node -v` in a terminal — anything v18+ works).

1. **Install dependencies** — from inside this folder:

   ```
   npm install
   ```

2. **Log in to Cloudflare from the command line** (this opens a browser to approve):

   ```
   npx wrangler login
   ```

3. **Create the D1 database:**

   ```
   npm run db:create
   ```

   This prints something like:

   ```
   [[d1_databases]]
   binding = "DB"
   database_name = "rice-flight-log"
   database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   ```

   Copy that `database_id` value and paste it into `wrangler.jsonc`, replacing
   `REPLACE_WITH_YOUR_DATABASE_ID`.

4. **Create the table and load the existing 46 flights:**

   ```
   npm run db:migrate:remote
   npm run db:seed:remote
   ```

## Try it locally first (optional but recommended)

```
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

This starts a local copy at `http://localhost:8787` using a local copy of the database
(nothing touches the real Cloudflare database until you deploy). Open it in a browser
and confirm the dashboard loads with the 46 flights, search works, and "Add a flight"
saves successfully.

## Deploy

The simplest path — deploy straight from the command line:

```
npm run deploy
```

Wrangler will print a URL like `https://rice-flight-log.<your-subdomain>.workers.dev`.
That URL is public — anyone you send it to can open it, no Claude account or
organization membership required. This is the link to send Russell.

## Getting this onto GitHub (so future updates are easy)

You mentioned wanting GitHub as the source of truth, so updates are simple. From
inside this folder:

```
git init
git add .
git commit -m "Rice Flight Log — Cloudflare Worker + D1"
gh repo create rice-flight-log --private --source=. --remote=origin --push
```

(If you don't have the `gh` CLI, create an empty repo on github.com instead, then:
`git remote add origin <the repo's URL>` and `git push -u origin main`.)

Once the repo is on GitHub, connect it to Cloudflare for automatic deploys:

1. In the Cloudflare dashboard, go to **Workers & Pages → your Worker → Settings → Builds**.
2. Connect the GitHub repository you just created.
3. From then on, every `git push` to the `main` branch automatically redeploys the
   site — no need to run `npm run deploy` by hand again.

## Adding new flights later

Two ways:

- **Through the dashboard itself** — the "Add flight" button in the top right writes
  straight into the live database.
- **In bulk from a Claude session** — bring a new batch of photographed logbook
  pages to a session, have them transcribed, and either use the dashboard's
  "Add flight" form for each one, or send the API a batch of `POST /api/flights`
  requests (one JSON body per flight, same shape as the form).

## API reference (for future scripting)

- `GET /api/flights` — all flights as JSON
- `POST /api/flights` — create one flight (JSON body: `date, aircraft, ident, from, to, duration, dayLandings, nightLandings, source, logbook, remarks`)
- `PUT /api/flights/:id` — update one flight
- `DELETE /api/flights/:id` — delete one flight
- `GET /api/export.csv` — download all flights as a CSV file (same as the "Export CSV" button)

## Known follow-ups

- Six rows (source photos IMG_0254–IMG_0259, ids f41–f46) are still page-level totals
  rather than itemized flight-by-flight rows — flagged in their remarks as "page total,
  individual flights not itemized yet." A future pass can break these out and `PUT`
  the individual rows in, then delete the placeholder.
- Linking each flight's "source" pill to the actual source photo (so Russell can
  verify a transcription against the original page) is possible now that this is a
  real website with real file storage — unlike the Claude Artifact, which had nowhere
  to put binary images. A simple approach: upload the source photos into an R2 bucket
  or into `public/photos/`, and change the source pill in `index.html` to a link.

## Logbooks LB1-LB3 (added Nov 2026)

Three more logbooks were transcribed from photos (`logbook/injest/new/LB1-3`):
LB1 = Jeppesen book, Mar 1983-Oct 1986; LB2 = two AOPA books, Oct 1986-Mar 2002;
LB3 = same brand as Book 1, Jan 2024-Sep 2026. Rows use ids `lb1-0001...`, `logbook` = `LB1`/`LB2`/`LB3`,
and `source` = `LB2/IMG_0168` style (the photo numbers repeat across folders).

These books have more columns than Book 1, so `migrations/0002_add_logbook_columns.sql` adds them
(single/multi engine, jet, rotorcraft, glider, retract, night, actual/simulated instrument, sim trainer,
approaches, cross-country, PIC, SIC, dual received, solo, ground instruction). The API returns and accepts
them in camelCase (`nightTime`, `actualInstrument`, `pic`, ...), and the CSV export includes them.

To apply on the live database (needs wrangler logged into the account that owns the D1 db):

```
npm run db:add-columns:remote
npm run db:load-lb1-3:remote
```

The load file uses `INSERT OR REPLACE`, so it is safe to re-run. **Do not run `db:migrate:remote`** on the
live database: `schema.sql` drops and recreates the table.

## Sign-in for editing (Cloudflare Access)

The dashboard and `GET /api/flights` stay public. All writes go to `/admin/api/flights` and require a
Cloudflare Access sign-in (email one-time code). Setup, in the Cloudflare account that hosts the Worker:

1. Zero Trust → Access → Applications → Add a self-hosted app for `flight-log.riceaviation.com/admin`
   (path `admin`), with a policy allowing Russell's (and Charlie's) email addresses.
2. Copy the app's **Application Audience (AUD) tag** and the team domain (`<team>.cloudflareaccess.com`).
3. Set Worker vars `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`. The Worker verifies the Access JWT itself.

"Sign in to edit" on the dashboard sends the user to `/admin/`, which Access protects and then bounces
back to the dashboard with Add / Edit / Delete enabled. Until Access is configured, writes are refused
unless the var `ALLOW_OPEN_WRITES` is `"true"`.

The **Hours report** tab totals any filter combination (aircraft, tail, date range, logbook) client-side.

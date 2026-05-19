## Database migrations

LenLearn uses **SQLite** for **Better Auth** (sessions, users, JWT JWKS, etc.) and **MySQL** for LMS persistence (`app_state`, faculties, sections, `curriculum_guides`, dedicated **`curriculum`** metadata table, `lms_activity_logs`).

### Better Auth (SQLite)

Default database file: `data/auth.db` (override with `AUTH_SQLITE_PATH`).

**Rotated `BETTER_AUTH_SECRET` and JWT errors?** The JWT plugin stores signing keys in the `jwks` table with the secret used at creation time. If you change the secret, signing can fail with *“Failed to decrypt private key”*. Clear stored keys and let Better Auth regenerate them:

```bash
npm run auth:clear-jwks
```

Then restart the auth server. Outstanding bearer JWTs from the old key stop verifying until clients obtain new ones; browser sessions are separate.

Apply schema updates with the official CLI (reads `server/auth.js` and your `.env`):

```bash
npm run migrate
```

### Better Auth Infra activity tracking (`lastActiveAt`)

`server/auth.js` registers `dash()` from `@better-auth/infra` with `activityTracking` (5-minute interval by default). The `"user"` table needs a `lastActiveAt` column (`TIMESTAMPTZ` on PostgreSQL).

After upgrading or if the auth server errors on missing `lastActiveAt`:

```bash
npm run pg:activity-tracking
```

Or:

```bash
psql "$DATABASE_URL" -f Database/migrations/003_add_activity_tracking.sql
```

Set `BETTER_AUTH_API_KEY` in `.env` (from [Better Auth Dash](https://better-auth.com)). In development, also set `BETTER_AUTH_DASH_ACTIVITY=true` to enable activity pings locally.

On startup, `server/auth.js` also applies bundled SQL under `server/migrations/sqlite/` (tracked in `schema_version` inside the auth DB) so plugin tables such as `jwks` exist even if you skip the CLI once.

Demo users: **`npm run seed`** seeds the **institute admin only** (requires `AUTH_DISABLE_SIGNUP=false`, already set in the script). It does **not** create a default faculty account. To **repair or create a faculty account** for the teacher dashboard (`/teacher/dashboard`): **`npm run ensure:teacher -- you@email.com`** with **`TEACHER_PASSWORD`** set in the environment (required). For the **`faderek`** demo (adolfo.jbukele@gmail.com): **`npm run ensure:faderek`**. To remove the legacy Glendale demo faculty (`teacher@glendale.edu` / username `teacher`): **`npm run purge:demo-teacher`**. The Faculty tile sign-in uses **Faculty Code ID** (stored as Better Auth **`username`**), not email. By default **`ensure:teacher`** turns on **`twoFactorEnabled`** (same as institute-created faculty); set **`TEACHER_ENABLE_2FA=0`** to skip the OTP step. Real inbox delivery needs **`SMTP_USER`** / **`SMTP_PASS`** in `.env` (see **`.env.example`**).

### LMS (MySQL)

Set `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_DATABASE` (or `DB_HOST`, `DB_USER`, `DB_NAME`) and optional password/port. Set **`LMS_USE_MYSQL=true`** when the server is running; with **`LMS_USE_MYSQL=false`** (or omitting `MYSQL_HOST`), LenLearn will not open a MySQL connection (avoids `ECONNREFUSED` when XAMPP MySQL is off). Auth still uses SQLite. Optional **`MYSQL_SSL`** for Node mysql2 is documented in **`.env.example`**.

Create LMS tables (including **`curriculum`** and **`curriculum_guides`**) with **`scripts/sql/lenlearn_db_bootstrap_schema.sql`** if the database exists but tables are missing. The Node server also runs `CREATE TABLE IF NOT EXISTS …` on startup when MySQL is enabled, and **each successful `PUT /api/v1/state` rebuilds the `curriculum` mirror table** from `state.curriculums`. To **inspect** what is stored, run **`scripts/sql/curriculum_inspect.sql`** in Workbench (read-only `SELECT`s for `curriculum`, `curriculum_guides`, and `app_state.default`). Do not rely on hand-inserted rows in `curriculum`; they are not the source of truth and can be overwritten on the next save.

If you previously ran an old seed script, remove stray rows with: `DELETE FROM curriculum WHERE title LIKE 'Sample subject%' OR description LIKE '%safe to delete%';` (you may need `SET SESSION sql_safe_updates = 0` in Workbench first if Error 1175 appears).

### MySQL Workbench shows old / “sample” rows, not your dashboard guides

The **authoritative** list of guides (e.g. `EXCUSE_LETTER_DT25.pdf`, grade, subject) is in **`app_state.json`** (`curriculums` array), not in hand-written SQL. The **`curriculum`** table is a **mirror** rebuilt when the institute dashboard successfully saves (`PUT /api/v1/state`).

1. In Workbench, confirm you are using **`USE lenlearn_db;`** (same name as `MYSQL_DATABASE` in `.env`).
2. Inspect real data: `SELECT LEFT(json, 4000) FROM app_state WHERE id = 'default';` and search for `curriculums` / your file name.
3. Open the LenLearn institute dashboard, make a tiny edit (or wait for “Saved to database”), then run **`scripts/sql/curriculum_inspect.sql`** (or `SELECT * FROM curriculum ORDER BY id DESC;`) again.
4. If MySQL keeps stopping when the app starts, fix XAMPP first (**[docs/xampp-mysql-windows.md](./xampp-mysql-windows.md)** §9); until MySQL stays up, the mirror table cannot refresh from the dashboard.

To create the database if missing:

```bash
npm run mysql:ensure
```

Then start the server. See `Database/schema.sql` for reference DDL.

### Windows + XAMPP

If MySQL will not start or clients cannot connect, see **[docs/xampp-mysql-windows.md](./xampp-mysql-windows.md)** (Workbench **1175 / 2013 / schema tree** in §10–§11; **clicking `lenlearn_db` stops MySQL** in §12). Light checks: **`scripts/sql/lenlearn_db_smoke_test.sql`**, **`scripts/sql/lenlearn_db_check_app_state_size.sql`**.

**Wipe all LMS MySQL data and recreate an empty `lenlearn_db`:** run **`scripts/sql/lenlearn_db_reset_fresh.sql`** as a user with `DROP` privilege (e.g. `root`), then run **`scripts/sql/lenlearn_db_bootstrap_schema.sql`** (or start the LenLearn server once) so **`app_state`**, **`curriculum`**, and other tables exist again. Auth accounts stay in **SQLite** (`data/auth.db`) unless you delete that file separately.

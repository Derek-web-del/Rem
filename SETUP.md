# LenLearn — Setup guide for new team members

This guide walks you through installing and running **LenLearn** (Glendale High School LMS) on your computer from scratch. You do not need to be a professional developer, but you should be comfortable following numbered steps and copying commands into a terminal.

**What you are installing**

- A **web app** (React + Vite) that runs in your browser
- A **backend API** (Node.js + Express) for sign-in, school data, and file uploads
- A **PostgreSQL** database that stores users, institute data, curriculum, and more

> **Note:** LenLearn uses **PostgreSQL only** for both sign-in (Better Auth) and LMS data. You do **not** need XAMPP MySQL. See **[docs/migrations.md](docs/migrations.md)** for schema and migration commands.

---

## 1. Prerequisites (install these first)

Install each item below before you open the project. On Windows, use the installers linked here unless your team gives you different versions.

| Software | Why you need it | Download |
|----------|-----------------|----------|
| **Node.js 22.x** | Runs the app and installs packages (`npm`) | [https://nodejs.org/](https://nodejs.org/) — choose the **LTS** installer. The project expects Node **22** (see `.nvmrc`). |
| **PostgreSQL 15+** | Database for users and school data | [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/) — include **pgAdmin** if offered (helps you create databases visually). |
| **Git** (optional) | Clone updates from a repository | [https://git-scm.com/download/win](https://git-scm.com/download/win) |
| **A code editor** (optional) | Edit `.env` and view files | [Visual Studio Code](https://code.visualstudio.com/) |

**You do not need**

- XAMPP Apache or MySQL for LenLearn (your folder may live under `C:\xampp\htdocs\` for convenience only)
- PHP

**After installing PostgreSQL**

1. Remember the **postgres user password** you chose during setup.
2. Make sure the PostgreSQL service is **running** (Windows: Services app → look for `postgresql-*`, status **Running**).

**Check Node.js**

Open **PowerShell** or **Command Prompt** and run:

```powershell
node -v
npm -v
```

You should see Node `v22.x.x` (or at least `v22`). If `node` is not recognized, restart the terminal or reinstall Node and tick “Add to PATH”.

---

## 2. Get the project folder

Pick **one** method.

### Option A — Git clone (if your team uses GitHub/GitLab)

```powershell
cd C:\xampp\htdocs
git clone <PASTE_YOUR_REPO_URL_HERE> LenLearn
cd LenLearn
```

Ask your team lead for the real repository URL if you do not have one.

### Option B — Copy a ZIP or shared folder

1. Copy the entire `LenLearn` folder to a location you can write to, for example `C:\xampp\htdocs\LenLearn`.
2. Open PowerShell in that folder:

```powershell
cd C:\xampp\htdocs\LenLearn
```

---

## 3. Install dependencies

From the **project root** (the folder that contains `package.json`):

```powershell
npm install
```

This downloads libraries into `node_modules/`. It also runs **patch-package** automatically to apply a small fix to the `better-auth` package (required for email OTP).

**If install fails**

- Run PowerShell **as Administrator** only if you get permission errors on `node_modules`.
- Delete `node_modules` and `package-lock.json`, then run `npm install` again.
- Confirm Node is version 22: `node -v`.

---

## 4. Environment setup (`.env` file)

The app reads settings from a file named **`.env`** in the project root. That file is **not** committed to Git (for security).

### 4.1 Create `.env`

```powershell
copy .env.example .env
```

Then open `.env` in Notepad or VS Code.

### 4.2 Generate a secret key

`BETTER_AUTH_SECRET` must be at least **32 random characters**. In PowerShell, from the project root:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the output and paste it on the line:

```env
BETTER_AUTH_SECRET=paste_the_long_string_here
```

(No spaces around `=`.)

### 4.3 Set your database connection

Create an empty database in PostgreSQL (name example: `lenlearn_db`):

- **pgAdmin:** Servers → PostgreSQL → Databases → right-click → Create → Database → name `lenlearn_db`
- **Or SQL:** `CREATE DATABASE lenlearn_db;`

In `.env`, set `DATABASE_URL` to match your PostgreSQL username, password, host, and database name:

```env
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/lenlearn_db
```

Replace `YOUR_PASSWORD` with your real postgres password. If the password contains special characters (`@`, `#`, `%`, etc.), ask a developer to help you **URL-encode** it, or use a simpler password for local dev only.

### 4.4 Minimum settings for local development

These are the values most new members need filled in first:

| Variable | Required for local dev? | What it does |
|----------|-------------------------|--------------|
| `BETTER_AUTH_SECRET` | **Yes** | Encrypts sessions and JWT keys. Never share or commit. |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string. Without it, the server **exits immediately**. |
| `BETTER_AUTH_URL` | Auto-adjusted by `npm run dev` | Browser URL for auth cookies. Default `http://localhost:5173`. |
| `AUTH_SERVER_PORT` | No (default `3001`) | Port for the API. `npm run dev` may pick the next free port if busy. |
| `AUTH_DISABLE_SIGNUP` | No (default `true`) | Blocks public registration. Seed scripts temporarily allow sign-up. |
| `SMTP_USER` / `SMTP_PASS` | **Yes if you use email 2FA** | Sends one-time codes to Gmail (or your SMTP). See §4.5. |
| `SMTP_HOST` | No (default `smtp.gmail.com`) | Mail server hostname. |
| `SMTP_PORT` | No (default `587`) | Mail server port. |
| `BETTER_AUTH_API_KEY` | No for basic local use | Better Auth Dash / Infra features. Optional in development. |

### 4.5 Gmail SMTP (for sign-in codes)

All portal roles (admin, faculty, student) use **email OTP** after username + password. SMTP must be configured in `.env` or sign-in will fail when sending a code.

For the recommended **two-account** setup (dedicated OTP sender + separate admin login), see **§4.5.1 GSuite / Gmail configuration** below.

Quick generic example:

```env
SMTP_USER=your.sender@gmail.com
SMTP_PASS=your16charapppassword
SMTP_FROM="LenLearn LMS <your.sender@gmail.com>"
```

Spaces in `SMTP_PASS` are ignored. Use a Google **App Password**, not your normal Gmail password.

Verify delivery: `npm run smtp:test`

### 4.5.1 GSuite / Gmail configuration

LenLearn supports school **Google Workspace (GSuite) emails** on faculty and student accounts. Users receive OTP codes at their school inbox (e.g. `@glendaleschool.edu`). They still sign in with **Login ID + LenLearn password**, not “Sign in with Google” (see [docs/GSUITE_SSO_PLAN.md](docs/GSUITE_SSO_PLAN.md) for future SSO).

#### Two Gmail accounts used

| Account | Purpose |
|---------|---------|
| `noreply.lenlearnotp@gmail.com` | Sends OTP codes to **all** users (`SMTP_USER` in `.env`) |
| `olympus.grp123@gmail.com` | Institute **admin login only** — not the SMTP sender |

#### Step-by-step: OTP sender (`noreply.lenlearnotp@gmail.com`)

1. Sign in to that Gmail account.
2. Open [myaccount.google.com](https://myaccount.google.com) → **Security** → **2-Step Verification** (enable first).
3. **Security** → **App passwords** → Create → name it `LenLearn LMS OTP`.
4. Copy the 16-character password into `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply.lenlearnotp@gmail.com
SMTP_PASS=paste16charapppassword
SMTP_FROM="LenLearn LMS <noreply.lenlearnotp@gmail.com>"
SEED_ADMIN_EMAIL=olympus.grp123@gmail.com
SEED_ADMIN_USERNAME=admin
```

5. Test: `npm run smtp:test` (optional: set `SMTP_TEST_TO=olympus.grp123@gmail.com` to receive the test at the admin inbox).

#### Faculty and student emails

- Use any valid email on accounts, including school GSuite addresses (`teacher@glendaleschool.edu`).
- **Per-user Gmail App Passwords are not required** — OTP is sent only from the system sender in `.env`.
- Faculty sign in with **Faculty Code ID**; students with **Student Login ID** (not email at the login screen).

#### What GSuite means in LenLearn today

| Supported | Not yet implemented |
|-----------|---------------------|
| GSuite email on account; OTP delivered to that inbox | “Sign in with Google” / Workspace SSO |
| Dedicated `noreply` sender for all verification codes | Auto-provisioning users from Google |

### 4.6 Full environment variable reference

Variables marked **(dev)** are mainly for local testing or advanced setups.

#### Authentication & security

| Variable | Default / example | Description |
|----------|-------------------|-------------|
| `BETTER_AUTH_SECRET` | *(you must set)* | Secret for Better Auth (min 32 chars). |
| `BETTER_AUTH_JWKS_DISABLE_ENCRYPTION` | off | If `true`, stores JWT private keys in plaintext (legacy only). Default encrypts JWKS with `BETTER_AUTH_SECRET`. |
| `BETTER_AUTH_RESET_JWKS` | off | If `1`/`true`, deletes JWT keys on startup (tests only; do not use in production casually). |
| `BETTER_AUTH_URL` | `http://localhost:5173` | Public site origin the browser uses. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | — | Comma-separated extra allowed origins (e.g. ngrok URLs). |
| `BETTER_AUTH_CROSS_ORIGIN_COOKIES` | off | Set `true` when UI and API are on different sites (needs HTTPS on API URL). |
| `BETTER_AUTH_API_KEY` | empty | Better Auth Infra / Dash API key. |
| `BETTER_AUTH_DASH_ACTIVITY` | off in dev | Set `true` to enable activity pings locally when API key is set. |
| `BETTER_AUTH_ACTIVITY_INTERVAL_MS` | `300000` | How often to update `lastActiveAt` (ms). |
| `BETTER_AUTH_API_URL` | `https://dash.better-auth.com` | Infra Dash API base URL. |
| `BETTER_AUTH_KV_URL` | `https://kv.better-auth.com` | Infra KV base URL. |
| `INFRA_SECURITY_ENABLED` | `true` in prod, looser in dev | Sentinel security checks via Infra. |
| `AUTH_SERVER_PORT` | `3001` | Auth/API listen port. |
| `PORT` | — | Overrides bind port (used by `npm run dev` internally). |
| `AUTH_DISABLE_SIGNUP` | `true` | When not `false`, blocks `/api/auth/sign-up/email`. |
| `AUTH_LOCK_MS` | 5 minutes | Account lockout duration after failed logins. |
| `AUTH_STARTUP_DB_STEP_TIMEOUT_MS` | `12000` | Max time per DB step during auth startup. |
| `AUTH_TWO_FACTOR_SKIP_VERIFY_ON_ENABLE` | off | Skips OTP verify when enabling 2FA (tests). |
| `AUTH_SMTP_DEV_FALLBACK` | off | If `1`, print OTP to console when SMTP fails (development only). |
| `AUTH_TEST_CAPTURE_OTP` | off | (dev) Tests capture OTP instead of sending mail. |
| `AUTH_MODULE_INSTANCE` | — | (dev) Forces auth module reload in tests. |
| `NODE_ENV` | `development` | `production` enforces stricter secret/API key rules. |
| `TRUST_PROXY` | — | Express trust proxy setting behind ngrok/CDN. |

#### Rate limiting (sign-in / OTP)

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_WINDOW_MS` | 15 min | Base window for limiters. |
| `RATE_LIMIT_MAX_SIGNIN` | `10` | Max sign-in attempts per window per IP. |
| `RATE_LIMIT_WINDOW_MS_SIGNIN` | — | Override window for sign-in. |
| `RATE_LIMIT_MAX_SEND_OTP` | `5` | Max “send OTP” requests. |
| `RATE_LIMIT_WINDOW_MS_SEND_OTP` | — | Window for send OTP. |
| `RATE_LIMIT_MAX_VERIFY_OTP` | `10` | Max OTP verify attempts. |
| `RATE_LIMIT_WINDOW_MS_VERIFY_OTP` | — | Window for verify OTP. |
| `RATE_LIMIT_MAX_TOKEN` | `30` | Max token endpoint hits. |
| `RATE_LIMIT_WINDOW_MS_TOKEN` | — | Window for token limiter. |

#### PostgreSQL

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | *(required)* | e.g. `postgres://postgres:pass@localhost:5432/lenlearn_db` |
| `PG_POOL_MAX` | `10` | Connection pool size. |
| `PG_CONNECT_TIMEOUT_MS` | `8000` | Connect timeout. |
| `PG_QUERY_TIMEOUT_MS` | `15000` | Query timeout. |
| `TEST_DATABASE_URL` | — | (dev) Separate DB for `npm test`. |

#### Google Drive backup (admin)

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | — | OAuth 2.0 client ID from Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | — | OAuth 2.0 client secret. |
| `GOOGLE_REDIRECT_URI` | `{BETTER_AUTH_URL}/api/auth/google/callback` (e.g. `http://localhost:5173/api/auth/google/callback`) | Must match an **Authorized redirect URI** in Google Cloud **exactly**. If unset, LenLearn derives it from `BETTER_AUTH_URL`. Use the **Vite UI port (5173)**, not the auth API port (3001). |
| `GOOGLE_DRIVE_FOLDER_NAME` | `LenLearn Backups` | Folder name created in the admin's Drive for `.lnbak` files. |
| `GOOGLE_OAUTH_SUCCESS_REDIRECT` | `{BETTER_AUTH_URL}/admin/backup` | Browser redirect after OAuth consent. |

1. In [Google Cloud Console](https://console.cloud.google.com/), enable the **Google Drive API**.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Under **Google Auth Platform → Data Access**, add OAuth scopes:
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/userinfo.email`
4. Under **Google Auth Platform → Clients → Authorized redirect URIs**, add the URI shown on the admin **Data Backup** page (or run `node --env-file=.env scripts/verify-google-drive.mjs`). For local dev, typically:
   - `http://localhost:5173/api/auth/google/callback`
   - Optional: `http://127.0.0.1:5173/api/auth/google/callback`
5. Paste `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into `.env`.
6. Add your Gmail under **Audience → Test users** while the app is in Testing mode.
7. Restart `npm run dev`, open **`http://localhost:5173`** (same host as `BETTER_AUTH_URL`), sign in as admin.
8. Open **Data Backup** → **Connect Google Drive** → Continue → Allow **all** requested permissions.
9. New backups upload automatically to the admin's Drive folder (local copies are still saved).

**Troubleshooting:**
- `redirect_uri_mismatch` — URI in Google Cloud does not match LenLearn's effective redirect (see diagnostics on Data Backup page).
- `invalid_state` — browser host/port differed between starting connect and callback; use `localhost:5173` consistently.
- `insufficient authentication scopes` on upload — add **Data Access** scopes above, then **Disconnect** and **Connect Google Drive** again in LenLearn (old tokens do not gain new scopes automatically).

#### Email (SMTP)

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server. |
| `SMTP_PORT` | `587` | SMTP port. |
| `SMTP_USER` | — | Sender account (e.g. Gmail address). |
| `SMTP_PASS` | — | App password or SMTP password. |
| `SMTP_FROM` | `SMTP_USER` | “From” address on outgoing mail. |
| `SMTP_TEST_TO` | `SMTP_USER` | Recipient for `npm run smtp:test`. |
| `VITE_OTP_SENDER_EMAIL` | `noreply.lenlearnotp@gmail.com` | Sender shown on login OTP screen. |
| `SCHOOL_DOMAIN` | — | Reference only (e.g. `glendaleschool.edu`). |
| `SMTP_USE_HOST_TRANSPORT` | off | Set `1` to use host/port instead of Gmail preset. |
| `SMTP_DEBUG` | off | Set `1` to log SMTP traffic in the terminal. |
| `SMTP_VERIFY_STRICT` | off | Set `1` to exit if SMTP verify fails on startup. |
| `SMTP_CONNECTION_TIMEOUT_MS` | `30000` | SMTP connect timeout. |
| `SMTP_GREETING_TIMEOUT_MS` | `30000` | SMTP greeting timeout. |
| `SMTP_SOCKET_TIMEOUT_MS` | `45000` | SMTP socket timeout. |

#### Seed & teacher setup scripts

| Variable | Default | Description |
|----------|---------|-------------|
| `SEED_ADMIN_EMAIL` | `olympus.grp123@gmail.com` | Institute admin email for `npm run seed`. |
| `SEED_ADMIN_USERNAME` | `admin` | Admin username (Faculty Code ID style login). |
| `SEED_ADMIN_PASSWORD` | `Admin123@` | Admin password after seed. |
| `TEACHER_EMAIL` | — | Email for `npm run ensure:teacher`. |
| `TEACHER_PASSWORD` | — | **Required** for `ensure:teacher` (no default in repo). |
| `TEACHER_NAME` | derived from email | Display name for teacher account. |
| `TEACHER_USERNAME` | derived from email | Faculty Code ID (Better Auth `username`). |
| `TEACHER_ENABLE_2FA` | `1` | Set `0` to disable 2FA for that teacher account. |

#### Frontend (Vite — usually leave empty for `npm run dev`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_AUTH_BASE_URL` | empty | API origin when not using Vite proxy (e.g. ngrok). |
| `VITE_LMS_API_BASE_URL` | empty | Override API base for LMS state only. |
| `VITE_BETTER_AUTH_INFRA_CLIENT` | off | Set `1` to enable Infra client plugins in dev. |
| `VITE_LMS_STATE_FETCH_MS` | `8000` | Max wait for GET `/api/v1/state` (ms). |
| `VITE_STATE_API_FETCH_MS` | `30000` | Institute dashboard state fetch timeout. |
| `VITE_SCHOOL_DISPLAY_NAME` | Glendale School, Inc. | Name shown on teacher pages. |
| `VITE_DEV_SERVER_PORT` | `5173` | Preferred Vite port (`npm run dev` may bump if busy). |
| `VITE_STRICT_PORT` | `true` | If `false`, Vite picks another port without failing. |
| `VITE_PROXY_AUTH_PORT` | set by `dev.mjs` | Auth port for Vite proxy (do not set manually for normal dev). |

#### Server / API

| Variable | Default | Description |
|----------|---------|-------------|
| `EXPRESS_BODY_LIMIT` | `10mb` | Max JSON body size (large faculty photos). |

#### JWT validation script (advanced)

| Variable | Description |
|----------|-------------|
| `LENLEARN_JWKS_URL` | JWKS URL for `docs/validate-lms-jwt.mjs`. |
| `LENLEARN_EXPECTED_ORIGIN` | Expected JWT origin. |
| `LENLEARN_REQUIRE_ISS_AUD` | Set `1` to enforce iss/aud checks. |

---

## 5. Database setup

All steps assume `.env` has a valid `DATABASE_URL`.

### 5.1 Test PostgreSQL connection

```powershell
npm run pg:ping
```

You should see `[postgres-ping] OK database= lenlearn_db` (or your database name). If this fails, fix PostgreSQL service, password, or `DATABASE_URL` before continuing.

### 5.2 Create Better Auth tables (required)

This creates sign-in tables (`user`, `session`, `account`, `jwks`, etc.):

```powershell
npm run migrate
```

Equivalent command:

```powershell
npx auth@latest migrate --yes --config server/auth.js
```

### 5.3 Activity tracking column (recommended)

If you use Better Auth Infra / `lastActiveAt`:

```powershell
npm run pg:activity-tracking
```

### 5.4 Extra LMS tables (optional scripts)

The server **also creates many LMS tables automatically** the first time it runs (`ensureSchema` in the API). For explicit SQL migrations, apply files under `Database/migrations/` **in numeric order** using **psql** or pgAdmin.

**PowerShell example** (adjust path to your PostgreSQL `bin` folder):

```powershell
$env:PGPASSWORD = "YOUR_PASSWORD"
psql -U postgres -d lenlearn_db -f Database\migrations\004_sections_catalog_postgres.sql
psql -U postgres -d lenlearn_db -f Database\migrations\005_subjects_postgres.sql
psql -U postgres -d lenlearn_db -f Database\migrations\006_announcements_postgres.sql
psql -U postgres -d lenlearn_db -f Database\migrations\008_add_archived_at.sql
psql -U postgres -d lenlearn_db -f Database\migrations\009_audit_logs.sql
psql -U postgres -d lenlearn_db -f Database\migrations\010_teacher_profile_stats_faculty.sql
psql -U postgres -d lenlearn_db -f Database\migrations\011_curriculum_guides_publish.sql
psql -U postgres -d lenlearn_db -f Database\migrations\012_study_materials.sql
```

| File | Purpose |
|------|---------|
| `003_add_activity_tracking.sql` | `lastActiveAt` on auth `user` (also via `npm run pg:activity-tracking`) |
| `004_sections_catalog_postgres.sql` | Sections catalog |
| `005_subjects_postgres.sql` | Subjects table |
| `006_announcements_postgres.sql` | Announcements |
| `007_purge_demo_teacher_account.sql` | **Optional cleanup** — removes legacy demo teacher |
| `008_add_archived_at.sql` | Archive timestamps |
| `009_audit_logs.sql` | Audit log table (also auto-created on server start) |
| `010_teacher_profile_stats_faculty.sql` | Teacher profile stats on faculties |
| `011_curriculum_guides_publish.sql` | Published curriculum guide columns |
| `012_study_materials.sql` | Study materials (teacher uploads; API can also create this table) |
| `036_student_pii_encryption.sql` | `students.dob` → TEXT for AES ciphertext |
| `037_faculty_terms_accepted.sql` | `faculties.terms_accepted*` columns |
| `038_user_terms_accepted.sql` | `user.terms_accepted*` columns (admin) |

After applying 036–038, verify with `npm run verify:migrations`. For a full step-by-step run guide including PII encryption and PWA setup, see **[docs/HOW_TO_RUN.md](docs/HOW_TO_RUN.md)**.

**npm helpers** (if present in your copy of the repo):

```powershell
npm run pg:sections-schema
npm run pg:subjects-schema
npm run pg:announcements-schema
```

These expect SQL files under `scripts/sql/`. If that folder is missing, use the matching files in `Database/migrations/` with `psql` instead (same content as noted in the migration headers).

### 5.5 Seed the institute admin account

```powershell
npm run seed
```

This creates or updates the **institute admin** user:

- **Username:** `admin` (unless you changed `SEED_ADMIN_USERNAME`)
- **Email:** `olympus.grp123@gmail.com` by default (see `shared/constants.js`)
- **Password:** `Admin123@` by default (override with `SEED_ADMIN_PASSWORD` in `.env`)

Sign-in uses **email OTP** — configure SMTP (§4.5). All portal roles (admin, faculty, student) require MFA on sign-in.

If OTP is skipped after a DB restore or live testing, run:

```powershell
npm run ensure:portal-mfa
```

### 5.6 Optional — teacher / faculty test account

Faculty sign-in uses **Faculty Code ID** (= Better Auth **username**), not email.

```powershell
$env:TEACHER_PASSWORD="Your#Strong1Pass"
npm run ensure:teacher -- your.email@example.com
```

The script prints the **username** to use on the Faculty login tile.

Pre-configured demo (only if your team uses it) — set `TEACHER_EMAIL` and `TEACHER_PASSWORD` in `.env` (or inline on the command line) first, no default credentials are stored in `package.json`:

```powershell
$env:TEACHER_EMAIL="your.email@example.com"
$env:TEACHER_PASSWORD="Your#Strong1Pass"
npm run ensure:faderek
```

The script always creates/updates the username `faderek` with 2FA enabled; only the email/password come from your environment.

---

## 6. Running the project

From the project root:

```powershell
npm run dev
```

This command:

1. Starts the **auth/API server** (default from port `3001`, or the next free port)
2. Waits until `http://127.0.0.1:<port>/health` responds
3. Starts the **Vite** frontend (default port `5173`, or the next free port)

**Watch the terminal** for lines like:

```text
[dev] Vite dev server will use port 5173 (http://localhost:5173)
Better Auth server listening on http://localhost:3001
```

### 6.1 Open the app

In your browser, go to the URL printed for Vite, usually:

**http://localhost:5173**

If port 5173 was busy, the terminal will say which port to use (e.g. `5174`).

### 6.2 Other useful commands

| Command | Purpose |
|---------|---------|
| `npm run dev:auth` | API server only |
| `npm run dev:web` | Vite frontend only (API must already run) |
| `npm run build` | Production build of the frontend |
| `npm run preview` | Preview production build |
| `npm test` | Run automated tests (needs DB + env) |

**Stop the servers:** press `Ctrl+C` in the terminal where `npm run dev` is running.

---

## 7. Signing in after setup

| Role | How to sign in | Notes |
|------|----------------|-------|
| **Institute admin** | Main login → institute flow | Username `admin` or seeded email; password from seed; **email OTP** then **terms** gate |
| **Faculty / teacher** | Faculty tile on login page | Use **Faculty Code ID** (username), not email; **email OTP** then `/teacher/terms` |
| **Student** | Student tile on login page | Login ID (username); **email OTP** then `/student/terms` |

**Terms and Conditions:** Each role must accept terms before using the portal. Terms are **reset on logout** (server clears `terms_accepted`); the next sign-in shows the terms page again. `terms_accepted_at` is kept for audit.

**MFA on account creation:** Admin-created faculty and student accounts always get `twoFactorEnabled=true` (enforced in `provisionPortalAuthUser`).

Default seeded admin password (unless changed): **`Admin123@`**

### Forgot password (all roles)

Self-service reset is available from the login screen (**Forgot Password?**).

1. Open `/login/forgot-password` and enter the **registered email** on the account (not the Login ID).
2. Check inbox for **LenLearn LMS — Password Reset** (configure SMTP first — see §4.5.1; run `npm run smtp:test` to verify).
3. Open the link within **30 minutes** (single-use). Set a strong new password on `/reset-password`.
4. Sign in again with your **Login ID + new password + email OTP** (OTP is still required after reset).

**Admin options:**

| Action | Where | Effect |
|--------|-------|--------|
| **Send Reset Email** | Faculty/Student list or profile | Emails a self-service reset link (safer; user chooses password) |
| **Set Password** | Faculty/Student edit form | Admin sets password immediately (audit: `PASSWORD_CHANGED`) |

Reset requests are rate-limited (3 per hour per IP). Unknown emails still show a generic success message (no account enumeration).

---

## 8. Common problems and fixes

### “DATABASE_URL is not set” or auth server exits immediately

- Create `.env` from `.env.example` (§4.1).
- Set `DATABASE_URL=postgres://...` with a real password and database name.
- Run `npm run pg:ping` to verify.

### `npm run pg:ping` fails (connection refused / password authentication failed)

- Start PostgreSQL (Windows Services).
- Confirm username/password in `DATABASE_URL` match pgAdmin.
- Confirm database `lenlearn_db` exists.
- Use `localhost` and port `5432` unless your install uses another port.

### `npm run migrate` fails

- Fix `pg:ping` first.
- Ensure `BETTER_AUTH_SECRET` is set (32+ characters).
- Run from project root where `server/auth.js` exists.

### “Failed to decrypt private key” or JWT errors after changing `BETTER_AUTH_SECRET`

```powershell
npm run auth:clear-jwks
```

Then restart `npm run dev`. Users may need to sign in again.

### Port already in use (`EADDRINUSE`)

- Prefer **`npm run dev`** — it picks the next free ports automatically.
- Or close the other program using port 3001/5173.
- Or set `AUTH_SERVER_PORT=3002` in `.env` and restart.

### “Auth server exited before ready” / health check timeout

- Read the red error lines **above** the message in the terminal.
- Almost always: bad `DATABASE_URL`, PostgreSQL stopped, or migrate not run.
- Check `http://127.0.0.1:3001/health` in a browser (use your actual auth port).

### Browser opens but login says verification timed out / cannot reach `/api/auth`

- Make sure **`npm run dev`** is still running (both API and Vite).
- Do not run only `dev:web` unless the API is already up.
- If you changed ports, use the URL from the terminal, not an old bookmark.

### 2FA / OTP email never arrives

- Set `SMTP_USER` and `SMTP_PASS` (Gmail **App Password**, §4.5).
- Check spam folder.
- Look at the auth server terminal for `[auth] SMTP configured=no` or SMTP errors.
- Too many attempts → wait 15 minutes (rate limit).

### “Too many attempts” when signing in

- Rate limits protect sign-in and OTP endpoints. Wait and try again.
- Developers can raise limits in `.env` (`RATE_LIMIT_MAX_SIGNIN`, etc.) for local testing only.

### `npm install` / patch-package errors

- Use Node 22.
- Delete `node_modules`, run `npm install` again from project root.

### `npm run pg:sections-schema` (or similar) — file not found

- Your copy may not include `scripts/sql/`. Apply the same migration from `Database/migrations/` with `psql` (§5.4).

### Sign-up disabled / cannot register

- Expected: `AUTH_DISABLE_SIGNUP=true`. Admins are created with `npm run seed` and `npm run ensure:teacher`, not public sign-up.

### Faculty login fails but admin works

- Faculty must use **username** (Faculty Code ID), not email.
- Run `npm run ensure:teacher` with `TEACHER_PASSWORD` set.

### Uploaded files / photos missing

- Uploads go under `public/uploads/` (e.g. `faculties/`, `materials/`). Ensure that folder exists and is writable.

---

## 9. Project layout (quick map)

| Path | What it is |
|------|------------|
| `Frontend/src/` | React UI (login, admin dashboard, teacher portal) |
| `server/` | Express API, Better Auth, LMS state, teacher routes |
| `Database/migrations/` | PostgreSQL SQL migrations |
| `.env` | Your local secrets (create from `.env.example`) |
| `public/uploads/` | Uploaded PDFs and images |
| `data/` | Created at runtime (local data; gitignored) |
| `docs/` | Developer notes (migrations, faculty guides) |

---

## 10. Getting help

1. Re-read the error in the terminal where `npm run dev` runs.
2. Confirm `npm run pg:ping` and `npm run migrate` succeeded.
3. Ask your team lead for the correct **repo URL**, **shared `.env` values** (never post secrets in public chat), and **PostgreSQL** host if you are not on localhost.

When reporting a bug, include: OS version, `node -v`, whether PostgreSQL is running, the exact command you ran, and the last 20 lines of terminal output (redact passwords).

---

## 11. Security configuration (evaluation matrix)

| Control | Configuration |
|--------|----------------|
| Account lockout | 5 failed sign-ins → 5 min lock (`AUTH_LOCK_MS` overrides in tests) |
| Admin API | `/api/v1/students`, `/api/v1/faculty`, etc. require admin session |
| Teacher API | `/api/teacher/*` requires `faculty` or `teacher` role; students scoped to advisory sections |
| Rate limits | Auth routes: dedicated limits; other `/api/*`: 100 GET / 50 write per 15 min per IP |
| Destructive ops | Body must include `confirm`: `DELETE` (archive), `PURGE`, `DELETE_IMMEDIATE`, or `RESTORE` (backup) |
| Audit log deletion | `DELETE /api/v1/audit-logs/:id` — set `SUPER_ADMIN_EMAILS=admin@school.edu` in `.env` |
| Record integrity | Run migration `Database/migrations/013_record_integrity.sql` (or restart server; columns auto-added) |

Run `npm run test` after security changes; includes lockout, sanitize-input, and helmet header checks.

---

## 12. AI-Powered Plagiarism Checker (faculty)

The faculty **AI-Powered Plagiarism Checker** (`/teacher/originality-checker`) analyzes pasted text or uploaded `.txt`, `.docx`, and `.pdf` files using **lexical TF-IDF + cosine similarity** and **semantic AI embeddings** (local transformer model by default) against web sources fetched at analysis time. See [`docs/AI_CHECKER_TECHNICAL_VERIFICATION.md`](docs/AI_CHECKER_TECHNICAL_VERIFICATION.md) for proof that the semantic layer is real AI, not just web search.

| Setting | Purpose |
|--------|---------|
| `PLAGIARISM_AI_PROVIDER` | `local` (default), `openai`, or `off` — semantic embedding provider |
| `OPENAI_API_KEY` | Required when `PLAGIARISM_AI_PROVIDER=openai` |
| `OPENAI_EMBEDDING_MODEL` | Optional — default `text-embedding-3-small` |
| `LOCAL_EMBEDDING_MODEL` | Optional — default `Xenova/all-MiniLM-L6-v2` (downloaded on first use) |

Web source discovery uses **DuckDuckGo HTML search** only (no API key required). On startup the auth server logs the web search and AI provider modes.

When AI is enabled, the final similarity score blends **40% lexical + 60% semantic**. Set `PLAGIARISM_AI_PROVIDER=off` for TF-IDF-only behavior (matches pre-upgrade analysis).

Apply migrations `Database/migrations/032_plagiarism_reports_web_sources.sql` and `033_plagiarism_reports_ai_metadata.sql` (or restart the server — columns are also added via `ensurePlagiarismReportsSchema`).

Uploaded files for parsing are stored temporarily under `public/uploads/originality/` and deleted after text extraction.

**Note:** OpenAI mode sends text snippets to OpenAI for embedding. Local mode runs entirely on your server but requires sufficient RAM/CPU for the first model download.

**API disclosure:** See [`docs/AI_CHECKER_API_DISCLOSURE.md`](docs/AI_CHECKER_API_DISCLOSURE.md) for every outbound integration, the free-only `.env` profile, and panel Q&A. See [`docs/AI_CHECKER_TECHNICAL_VERIFICATION.md`](docs/AI_CHECKER_TECHNICAL_VERIFICATION.md) for proof that semantic AI (transformer embeddings) is real machine learning, not just web search.

---

## 13. Production deployment (Railway)

Use this section when deploying LenLearn to **Railway** (or a similar Node + PostgreSQL host). For a step-by-step checklist, see **[docs/DEPLOYMENT_CHECKLIST.md](docs/DEPLOYMENT_CHECKLIST.md)**.

### 13.1 Overview

LenLearn runs as a **single Node process** in production:

1. **Build** — `npm run build` compiles the React frontend to `Frontend/dist`
2. **Start** — `node server/index.js` serves the API and static SPA
3. **Database** — PostgreSQL (Better Auth + LMS tables)

Copy **[`.env.production.example`](.env.production.example)** as a reference when setting Railway variables. **Never commit real production secrets.**

### 13.2 Railway services

| Service | Purpose |
|---------|---------|
| **PostgreSQL** | Empty database; link `DATABASE_URL` to the web service |
| **Web (Rem)** | GitHub repo, branch `release/railway-deploy` (or your deploy branch) |
| **Volume** (optional) | Mount at `/app/public/uploads` for persistent file uploads |

The repo includes **[`railway.toml`](railway.toml)** with build/start commands and health check path `/api/health`.

### 13.3 Required environment variables

Set these in the Railway dashboard for the **web service** (not in a committed `.env` file):

| Variable | Required | Notes |
|----------|----------|-------|
| `NODE_ENV` | Yes | `production` |
| `DATABASE_URL` | Yes | Reference `${{Postgres.DATABASE_URL}}` |
| `BETTER_AUTH_URL` | Yes | Public HTTPS URL, e.g. `https://your-app.up.railway.app` |
| `BETTER_AUTH_SECRET` | Yes | `openssl rand -base64 32` (min 32 chars) |
| `AES_256_SECRET_KEY` | Yes | 64 hex chars — see `.env.production.example` |
| `AUTH_DISABLE_SIGNUP` | Yes | `true` |
| `AUTH_TWO_FACTOR_SKIP_VERIFY_ON_ENABLE` | Yes | `false` |
| `AUTH_REQUIRE_MFA_ALL` | Yes | `true` |
| `SMTP_*` | Yes | Gmail App Password for OTP emails |
| `TRUST_PROXY` | Recommended | `1` (Railway sits behind a reverse proxy) |

Optional: `BETTER_AUTH_API_KEY` for Better Auth Dash audit logs.

### 13.4 First-time setup commands

Run these **once** against the production `DATABASE_URL` (locally with `railway run`, or from CI):

```powershell
# 1. Apply auth + LMS migrations
npm run db:migrate

# 2. Create institute admin (set SEED_ADMIN_* first)
npm run db:seed

# 3. Enable MFA on all portal accounts
npm run ensure:portal-mfa
npm run verify:portal-mfa

# 4. Encrypt existing student PII (if restoring data)
npm run pii:encrypt

# 5. Verify SMTP
npm run smtp:test

# 6. Verify database connectivity
npm run pg:ping
```

### 13.5 Deploy and verify

1. Push to your deploy branch or trigger a Railway deploy.
2. Confirm build logs show `npm run build` completing without errors.
3. Health check: `GET https://your-domain/api/health` → `{ "status": "ok", "database": "connected" }`.
4. Open the site root — the login SPA should load from `Frontend/dist`.
5. Sign in as admin, complete OTP, accept terms, change the seed password.

### 13.6 Domain and Cloudflare

1. In Railway, generate a service domain or add a custom domain.
2. In **Cloudflare DNS**, create a **CNAME** pointing to your Railway hostname.
3. Set SSL mode to **Full (strict)**.
4. Update `BETTER_AUTH_URL` to the final `https://` domain and redeploy if needed.

### 13.7 Build notes

- Vite output directory: **`Frontend/dist`** (served by Express in `server/index.js`).
- Start command: **`node server/index.js`** (reads env from the process environment, not a `.env` file).
- Health endpoint: **`/api/health`** (used by Railway health checks in `railway.toml`).

For the full pre/post deploy checklist, see **[docs/DEPLOYMENT_CHECKLIST.md](docs/DEPLOYMENT_CHECKLIST.md)**.


# LenLearn — Security test evidence capture guide

## IMPORTANT: Before running live tests

1. **Restart the dev server first** (resets in-memory rate-limit buckets):
   ```powershell
   npm run dev
   ```
2. Wait until both ports respond (API **3001**, Vite **5173**).
3. Run tests in this order:
   ```powershell
   npm run live:harness
   npm run live:api
   npm run security:evidence
   npm run test:auth
   ```
   Run `test:auth` **last** — it is safe on isolated ports but keeps the workflow consistent.
4. Do **not** set `LIVE_TEST_HAMMER_RATE_LIMIT=1` before `live:api` (that exhausts the sign-in bucket).
5. If any script returns **429**, restart `npm run dev`, wait ~10 seconds, and retry.

Optional rate-limit evidence only:
```powershell
$env:LIVE_TEST_HAMMER_RATE_LIMIT='1'
npm run live:harness
# then restart npm run dev before live:api
```

---

Capture screenshots into this folder (`docs/evidence/`). Run automated API/DB evidence first:

```bash
npm run dev
# separate terminal:
npm run security:evidence
```

Outputs: `docs/evidence/automated/*.txt`

---

## Prerequisites

| Item | Notes |
|------|--------|
| App running | `npm run dev` — note auth port (default **3001**) and Vite URL (**5173**) |
| PostgreSQL | `DATABASE_URL` in `.env`; `npm run pg:ping` |
| Test accounts | Seeded admin (`npm run seed`), faculty (`npm run ensure:teacher`), student (admin-created) |
| SMTP / OTP | For MFA screenshots: `SMTP_USER` + `SMTP_PASS`, or dev OTP if `AUTH_TEST_CAPTURE_OTP=1` on test server |
| Tools | Browser, pgAdmin or `psql`, optional DevTools → Network |

---

## A) Password hashing — `DB_Password_Hash_Evidence.png`

1. Open pgAdmin or `psql` connected to `lenlearn_db`.
2. Run (replace email with a real test user):

```sql
SELECT u.email, LEFT(a.password, 7) AS hash_prefix, LENGTH(a.password) AS hash_len
FROM account a
JOIN "user" u ON u.id = a."userId"
WHERE LOWER(u.email) = LOWER('your-test@email.com')
  AND a."providerId" = 'credential';
```

3. Screenshot showing `hash_prefix` = `$2b$` or `$2a$` (not a readable password).

---

## B) Generic login error — `Login_Error_Message_Evidence.png`

1. Open `http://localhost:5173/login/student` (or faculty/admin login path).
2. Enter a valid username/email and **wrong** password.
3. Screenshot the error banner from `App.jsx` (`formatAuthError`).
4. Caption should describe **generic** wording (avoid “user not found” / “wrong password” if UI does not show them).

Optional: repeat until lockout to show `ACCOUNT_LOCKED` generic message.

---

## C) RBAC — student → admin — `RBAC_Student_Admin_Block.png`

1. Sign in as **student**.
2. Navigate to `http://localhost:5173/admin/institute_dashboard` (not `/admin/dashboard`).
3. Screenshot redirect to `/student/dashboard` or login.

---

## D) RBAC — faculty → student — `RBAC_Faculty_Student_Block.png`

1. Sign in as **faculty** (Faculty Code ID username).
2. Navigate to `http://localhost:5173/student/dashboard`.
3. Screenshot redirect to `/teacher/dashboard`.

---

## E) RBAC — student → faculty — `RBAC_Student_Faculty_Block.png`

1. Sign in as **student**.
2. Navigate to `http://localhost:5173/teacher/dashboard`.
3. Screenshot redirect to `/student/dashboard`.

---

## F) Session logout — `Session_Logout_Evidence.png`

**Option 1 (UI):** Sign in → Logout → try opening `/student/dashboard` → should return to login.

**Option 2 (Network — pairs with automated evidence):**

1. DevTools → Network → sign in → note `Set-Cookie`.
2. Logout (`POST /api/auth/sign-out`).
3. Repeat `GET /api/v1/student/terms-status` **without** Cookie header → 401.
4. Screenshot Network response JSON.

See `automated/Session_Logout_Evidence.txt` after `npm run security:evidence`.

---

## G) File type validation — `File_Type_Validation_Evidence.png`

1. Faculty → Study Materials → add material.
2. Attempt upload of non-PDF (e.g. `.jpg` or `.exe`).
3. Screenshot client or server error (PDF-only label: `STUDY_MATERIAL_UPLOAD_LABEL`).

---

## H) File size validation — `File_Size_Validation_Evidence.png`

1. Attempt upload **> 25MB** PDF to study materials (or > 10MB on student assignment).
2. Screenshot error referencing size limit from `shared/uploadLimits.js`.

---

## I) Input validation — `Input_Validation_Evidence.png`

1. Open any create form (e.g. admin Add Student).
2. Submit with empty required fields.
3. Screenshot inline validation messages.

---

## J) XSS prevention — `XSS_Prevention_Evidence.png`

1. In a text field (announcement title or student name), enter: `<script>alert('xss')</script>`.
2. Save and reopen view.
3. Screenshot showing text escaped or sanitized (no script execution).

---

## K) Audit log — `Audit_Log_Student_Login.png`

**Important:** Students cannot open Admin Audit Logs.

1. Sign in as **student** (complete OTP if prompted).
2. Sign out or use another browser.
3. Sign in as **admin** → **Audit Logs** (`/admin/audit-logs`).
4. Filter/search for student sign-in event.
5. Screenshot row (timestamp, event type, user).

---

## L) Terms consent — `Terms_Consent_Evidence.png` (all portals)

1. Use a student who has **not** accepted terms (new student or reset `terms_accepted` in DB for test only).
2. Sign in as that student → screenshot forced `/student/terms` page.
3. Accept terms → screenshot dashboard redirect.
4. Optional DB screenshot:

```sql
SELECT id, student_username, terms_accepted, terms_accepted_at
FROM students
WHERE student_username = 'YOUR_TEST_USER';
```

Also see `automated/DB_Terms_Consent_Evidence.txt`.

**Faculty / admin (DB consent):**

1. Reset test faculty: `UPDATE faculties SET terms_accepted = false, terms_accepted_at = NULL WHERE faculty_code_id = 'TEST';`
2. Sign in as faculty → screenshot forced `/teacher/terms` → accept → verify `faculties.terms_accepted_at`.
3. Repeat for admin on `user` table and `/admin/terms`.

---

## M) API authentication — `API_Auth_Required_Evidence.png`

1. DevTools or curl **without** cookies:

```bash
curl -s -i http://127.0.0.1:3001/api/v1/student/terms-status
```

2. Screenshot status **401** and body containing `Sign-in required.`

Automated copy: `automated/API_Auth_Required_Evidence.txt`.

---

## N) MFA / OTP — `MFA_OTP_Evidence.png`

1. Sign in with account that has `twoFactorEnabled` (SMTP configured).
2. Screenshot OTP entry step after password.
3. Enter code from email (or test OTP in dev).
4. Screenshot successful redirect to role dashboard.

---

## O) Expanded audit events — `Audit_Log_Expanded_Events.png`

1. Sign in as **admin** → **Audit Logs** (`/admin/audit-logs`).
2. Trigger events (student quiz submit, faculty quiz create, material download, terms accept).
3. Filter by activity type: `QUIZ_SUBMITTED`, `QUIZ_VIEWED`, `QUIZ_CREATED`, `MATERIAL_DOWNLOADED`, `TERMS_ACCEPTED`, `PASSWORD_CHANGED`.
4. Screenshot filtered rows.

---

## P) Student PII encryption — `DB_Student_PII_Encryption_Evidence.png`

1. Set `AES_256_SECRET_KEY` in `.env` and run `node --env-file=.env scripts/encrypt-existing-student-pii.mjs`.
2. In pgAdmin/psql:

```sql
SELECT id, LEFT(first_name, 12) AS first_name_prefix, LEFT(last_name, 12) AS last_name_prefix
FROM students
LIMIT 5;
```

3. Screenshot showing `enc:v1:` prefix on name fields (not plaintext).

---

## Q) PWA / offline quiz — `PWA_Offline_Quiz_Evidence.png`

1. Sign in as student; open a quiz take page while online (caches quiz).
2. DevTools → Network → Offline (or disconnect network).
3. Screenshot `OfflineBanner` and cached quiz UI.
4. Submit an answer offline → reconnect → screenshot sync toast / successful submission.

---

## Filename checklist

| File | Test ID |
|------|---------|
| `DB_Password_Hash_Evidence.png` | A |
| `Login_Error_Message_Evidence.png` | B |
| `RBAC_Student_Admin_Block.png` | C |
| `RBAC_Faculty_Student_Block.png` | D |
| `RBAC_Student_Faculty_Block.png` | E |
| `Session_Logout_Evidence.png` | F |
| `File_Type_Validation_Evidence.png` | G |
| `File_Size_Validation_Evidence.png` | H |
| `Input_Validation_Evidence.png` | I |
| `XSS_Prevention_Evidence.png` | J |
| `Audit_Log_Student_Login.png` | K |
| `Terms_Consent_Evidence.png` | L |
| `API_Auth_Required_Evidence.png` | M |
| `MFA_OTP_Evidence.png` | N |
| `Audit_Log_Expanded_Events.png` | O |
| `DB_Student_PII_Encryption_Evidence.png` | P |
| `PWA_Offline_Quiz_Evidence.png` | Q |

---

## Linking to capstone documents

- Feature table: [../SECURITY_CHECKLIST.md](../SECURITY_CHECKLIST.md)
- STRIDE map: [../STRIDE_TEST_RESULTS.md](../STRIDE_TEST_RESULTS.md)
- Formal scope DOCX: [../Cybersecurity-Development-Scope-Checklist.docx](../Cybersecurity-Development-Scope-Checklist.docx)

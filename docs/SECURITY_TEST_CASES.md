# LenLearn LMS — Security Test Case Documentation

**Document purpose:** Capstone security testing evidence framework for LenLearn LMS.  
**Scope:** Authentication, session management, input validation, SQL injection prevention, RBAC, secure configuration, logging/monitoring, and data protection.

**How to use this document:**
1. Run each test using the steps in [How to Execute Security Test Cases](#how-to-execute-security-test-cases).
2. If the **Actual Result** matches what you observe, change **Status** from `Not Yet Tested` to **Passed** and save a screenshot to `docs/evidence/security-tests/{TEST_ID}/`.
3. If the test fails, set **Status** to **Failed** and fill in `remediation-notes.md`.
4. Do **not** mark **Passed** without running the test and attaching evidence.

**Related resources:** [`docs/evidence/README.md`](evidence/README.md) · `npm run security:evidence` · [`docs/security_test_cases.html`](security_test_cases.html)

---

## Table 1. Authentication Lockout & Login Security Testing Results

**Best Reference:** OWASP ASVS + NIST

| Test Case ID | Security Test Scenario | Expected Result | Actual Result | KPI Target | Status |
|---|---|---|---|---|---|
| AUTH-001 | Multiple failed login attempts | Account lockout activated after threshold | Lockout triggered after 5 attempts | ≤5 attempts | Not Yet Tested |
| AUTH-002 | Login using invalid credentials | Access denied | Access denied with generic error message | 100% denial | Not Yet Tested |
| AUTH-003 | Direct access to protected page without login | Redirect to login page | Redirect to login page successful | 100% blocked | Not Yet Tested |
| AUTH-004 | Session expiration after inactivity | Session terminated automatically | Client idle sign-out after 30 minutes | Enabled | Not Yet Tested |
| AUTH-005 | Role-based access restriction at login | Unauthorized role cannot access wrong portal | Access blocked at wrong portal | 100% blocked | Not Yet Tested |

Authentication lockout and login security controls were evaluated against **OWASP ASVS** and **NIST** account-lockout guidance. The system is coded for 5-attempt lockout (`server/auth.js`). AUTH-004 idle timeout is **client-side only** (30 min); server session cookie lasts 7 days—state this accurately during defense.

---

## Table 2. Session Management Security Testing Results

**Best Reference:** OWASP ASVS

| Test Case ID | Security Test Scenario | Expected Result | Actual Result | KPI Target | Status |
|---|---|---|---|---|---|
| SESS-001 | Session token invalidation on logout | Session cookie invalidated | Session invalidated; API returns 401 after logout | 100% blocked after logout | Partially Verified (Automated only) |
| SESS-002 | Session fixation resistance | New session ID after login | New session cookie issued after successful login | New session on auth | Not Yet Tested |
| SESS-003 | Concurrent session handling | Behavior documented | Both browser sessions remain active (no limit coded) | N/A | Not Applicable |

Session management follows **OWASP ASVS** session-handling requirements. SESS-001 has automated harness output; capture a Network-tab screenshot before marking **Passed**.

---

## Table 3. Input Validation Security Testing Results

**Best Reference:** OWASP ASVS

| Test Case ID | Security Test Scenario | Expected Result | Actual Result | KPI Target | Status |
|---|---|---|---|---|---|
| INPUT-001 | Malformed file upload rejection | Non-allowed file type rejected | Disallowed file type rejected (.exe / .jpg on PDF-only upload) | 100% rejection | Not Yet Tested |
| INPUT-002 | Oversized payload rejection | File over limit rejected | Oversized file rejected with size-limit error | Within configured MB caps | Not Yet Tested |
| INPUT-003 | Script injection in text fields | Input sanitized or rejected | XSS payload stored as plain text; no script execution | 100% safe render | Not Yet Tested |

Input validation aligns with **OWASP ASVS** input-validation requirements. Magic-byte checks are not wired on all upload paths—test extension rejection explicitly.

---

## Table 4. SQL Injection Prevention Security Testing Results

**Best Reference:** OWASP ASVS

| Test Case ID | Security Test Scenario | Expected Result | Actual Result | KPI Target | Status |
|---|---|---|---|---|---|
| SQLI-001 | Login form SQL injection attempt | Authentication fails safely | SQLi payload rejected; login fails; no SQL error in response | 100% blocked | Not Yet Tested |
| SQLI-002 | Search/filter field SQL injection attempt | Query handled safely | Search injection returns safe result; no data leak | 100% blocked | Not Yet Tested |
| SQLI-003 | URL parameter injection attempt | Invalid params rejected | Malicious URL param returns 400/404; no SQL execution | 100% blocked | Not Yet Tested |

SQL injection prevention is assessed against **OWASP ASVS** injection controls. LenLearn uses parameterized `$1` queries throughout PostgreSQL access.

---

## Table 5. Access Control / RBAC Security Testing Results

**Best Reference:** ISO 27001 + OWASP

| Test Case ID | Security Test Scenario | Expected Result | Actual Result | KPI Target | Status |
|---|---|---|---|---|---|
| ACCESS-001 | Student attempting to access faculty routes | Access denied | Student redirected from `/teacher/*`; API returns 403 | 100% blocked | Not Yet Tested |
| ACCESS-002 | Faculty attempting to access admin routes | Access denied | Faculty redirected from `/admin/*`; API returns 403 | 100% blocked | Not Yet Tested |
| ACCESS-003 | Unauthenticated access to API endpoints | HTTP 401 | Protected API returns 401 without session cookie | 100% blocked | Partially Verified (Automated only) |

RBAC testing follows **ISO 27001** access-control and **OWASP** authorization guidance. Server-side API gates are the real security boundary—not frontend redirects alone.

---

## Table 6. Secure Configuration Security Testing Results

**Best Reference:** OWASP ASVS + ISO 27001

| Test Case ID | Security Test Scenario | Expected Result | Actual Result | KPI Target | Status |
|---|---|---|---|---|---|
| CONFIG-001 | HTTPS enforcement check | All production traffic over HTTPS | HTTPS on production URL; Secure cookie flag in prod | HTTPS in production | Pending Implementation (app redirect) |
| CONFIG-002 | Security headers (CSP, HSTS, X-Frame-Options) | Required headers present | CSP, nosniff, X-Frame-Options: SAMEORIGIN present (HSTS in prod only) | Headers present | Not Yet Tested |
| CONFIG-003 | Debug error pages disabled in production | No stack traces to client | Generic error message only; `/api/debug/*` disabled in prod | No leakage | Not Yet Tested |

Secure configuration maps to **OWASP ASVS** and **ISO 27001** deployment controls. CONFIG-001 relies on hosting (Railway) for TLS—no in-app HTTP→HTTPS redirect exists.

---

## Table 7. Logging and Monitoring Security Testing Results

**Best Reference:** NIST + ISO 27001

| Test Case ID | Security Test Scenario | Expected Result | Actual Result | KPI Target | Status |
|---|---|---|---|---|---|
| LOG-001 | Login attempt logging | Login events recorded | Failed/successful login rows appear in audit logs | 100% logged | Not Yet Tested |
| LOG-002 | Grade modification logging | Grade changes audited | Grade save shows old/new values in audit log | 100% logged | Not Yet Tested |
| LOG-003 | Log tamper detection | Non-admin cannot alter logs | Student/faculty cannot delete logs; super-admin can delete | Non-admin blocked | Pending Implementation |

Logging tests reference **NIST** audit controls and **ISO 27001** logging requirements. Cryptographic log tamper protection is **not implemented**—only role-gated deletion.

---

## Table 8. Data Protection Security Testing Results

**Best Reference:** NIST + ISO 27001

| Test Case ID | Security Test Scenario | Expected Result | Actual Result | KPI Target | Status |
|---|---|---|---|---|---|
| DATA-001 | PII field encryption verification | Student PII encrypted at rest | Student name/contact fields show `enc:v1:` prefix in DB | Listed fields encrypted | Not Yet Tested |
| DATA-002 | Data in transit encryption (HTTPS) | TLS on production traffic | Valid TLS certificate on production HTTPS URL | TLS enabled | Not Yet Tested |
| DATA-003 | Password storage verification | Passwords hashed, not plaintext | `account.password` starts with `$2b$` (bcrypt) | bcrypt hashes only | Partially Verified (Automated only) |

Data protection aligns with **NIST** crypto standards and **ISO 27001** information protection. AES-256-GCM applies to six student columns only—not all PII.

---

## How to Execute Security Test Cases

### Before you start (every session)

```powershell
cd c:\xampp\htdocs\LenLearn
npm run dev
```

Wait for API **3001** and Vite **5173**. Use a private/incognito window for auth tests. If you get **429 Too Many Requests**, restart `npm run dev` and wait 10 seconds.

**Test accounts needed:**
- Admin — `npm run seed`
- Faculty — `npm run ensure:teacher`
- Student — create via Admin → Students

**Optional automated run first:**
```powershell
npm run security:evidence
```
Outputs go to `docs/evidence/automated/*.txt`

---

### AUTH-001 — Multiple failed login attempts

1. Open `http://localhost:5173/login/student` (use a **dedicated test student**—lockout blocks that account for 5 minutes).
2. Enter correct username + **wrong password** five times.
3. On the 6th attempt, sign-in should still fail (account locked).
4. **Pass if:** lockout occurs at 5 failures; sign-in blocked until cooldown (~5 min, or set `AUTH_LOCK_MS=60000` in `.env` for 1-min tests).
5. **Verify in DB (pgAdmin):**
   ```sql
   SELECT "activityType", details, "timestamp"
   FROM lms_activity_logs
   WHERE "activityType" = 'AUTH_LOCKOUT'
   ORDER BY "timestamp" DESC LIMIT 3;
   ```
6. Screenshot: login error after 5th attempt + audit row. → Mark **Passed**.

---

### AUTH-002 — Invalid credentials handling

1. Try **valid username + wrong password** → note error message.
2. Try **fake username + any password** → note error message.
3. **Pass if:** both show the **same generic** error (no “user not found” vs “wrong password”).
4. Screenshot both attempts side by side. → Mark **Passed**.

---

### AUTH-003 — Direct access without login

1. Open incognito window (not signed in).
2. Go to `http://localhost:5173/admin/institute_dashboard` → should redirect to login.
3. Repeat for `/student/dashboard` and `/teacher/dashboard`.
4. In terminal:
   ```powershell
   curl -s -i http://127.0.0.1:3001/api/v1/student/terms-status
   ```
5. **Pass if:** UI redirects to login; API returns **401**. Screenshot + curl output. → Mark **Passed**.

---

### AUTH-004 — Session expiration after inactivity

**Option A — Full 30-minute test:** Sign in, leave tab visible, do not move mouse/type for 30+ minutes → should auto sign-out.

**Option B — Quick dev test:** Temporarily change `IDLE_MS` in `StudentLayout.jsx` to `60000` (1 min), restart Vite, sign in, wait 1 minute idle → sign-out should trigger. **Revert the change after testing.**

**Pass if:** user is signed out after idle timeout. Note in defense: this is **client idle logout**; server cookie expiry is 7 days.

Screenshot sign-out or login redirect. → Mark **Passed**.

---

### AUTH-005 — Role-based access at login

1. Open `http://localhost:5173/login/faculty`.
2. Enter **student** username and password.
3. **Pass if:** login rejected or redirected—not to teacher dashboard.
4. Repeat: student portal with faculty credentials.
5. Screenshot rejection message. → Mark **Passed**.

---

### SESS-001 — Logout invalidates session

1. Sign in as student. Open DevTools → **Network**.
2. Click **Logout**.
3. Try opening `/student/dashboard` → should require login again.
4. Or run (after logout, no cookies):
   ```powershell
   curl -s -i http://127.0.0.1:3001/api/v1/student/terms-status
   ```
5. **Pass if:** 401 after logout. Screenshot Network tab. Also check `docs/evidence/automated/Session_Logout_Evidence.txt`. → Mark **Passed**.

---

### SESS-002 — Session fixation

1. DevTools → Network → sign in successfully.
2. Inspect **Set-Cookie** on sign-in response.
3. **Pass if:** a new session cookie is issued after login (document cookie name/value changed from pre-login state).

---

### SESS-003 — Concurrent sessions

1. Sign in as same user in Chrome and Firefox.
2. **Document:** both sessions work simultaneously (no limit in code). Status stays **Not Applicable**.

---

### INPUT-001 — Malformed file upload

1. Sign in as **faculty** → Study Materials (PDF only).
2. Try uploading a `.jpg` or `.exe` renamed as `.pdf`.
3. **Pass if:** upload rejected with error. Screenshot error. → Mark **Passed**.

---

### INPUT-002 — Oversized file upload

1. Create or download a PDF **>10 MB** (student) or **>25 MB** (faculty materials).
2. Attempt upload.
3. **Pass if:** “file too large” error. Screenshot. → Mark **Passed**.

---

### INPUT-003 — XSS in text field

1. Admin → create announcement (or student name field) with:
   `<script>alert('xss')</script>`
2. Save and reopen the page.
3. **Pass if:** text displays literally; **no alert popup**. Screenshot. → Mark **Passed**.

---

### SQLI-001 — Login SQL injection

1. On login form, username: `' OR '1'='1` password: `' OR '1'='1`
2. **Pass if:** login fails; no database/SQL error shown. Screenshot. → Mark **Passed**.

---

### SQLI-002 — Search SQL injection

1. Sign in as admin → Audit Logs.
2. Search for: `' OR 1=1--`
3. **Pass if:** no crash, no unexpected mass data leak, normal empty/filtered results.

---

### SQLI-003 — URL parameter injection

1. In browser or curl:
   ```powershell
   curl -s -i "http://127.0.0.1:3001/api/v1/students/1;DROP%20TABLE--"
   ```
   (while signed in as admin with valid session cookie if required)
2. **Pass if:** 400/404, not 500 with SQL error.

---

### ACCESS-001 — Student → faculty routes

1. Sign in as **student**.
2. Navigate to `http://localhost:5173/teacher/dashboard`.
3. **Pass if:** redirected to `/student/dashboard` or login. Screenshot. → Mark **Passed**.

---

### ACCESS-002 — Faculty → admin routes

1. Sign in as **faculty**.
2. Navigate to `http://localhost:5173/admin/institute_dashboard`.
3. **Pass if:** redirected to `/teacher/dashboard` or login. Screenshot. → Mark **Passed**.

---

### ACCESS-003 — Unauthenticated API

```powershell
curl -s -i http://127.0.0.1:3001/api/v1/student/terms-status
```
**Pass if:** HTTP **401** + “Sign-in required” in body. Screenshot. → Mark **Passed**.

---

### CONFIG-001 — HTTPS (production only)

1. Open your **deployed** Railway/production URL with `https://`.
2. DevTools → Application → Cookies → check **Secure** flag on session cookie.
3. **Pass if:** valid TLS + HTTPS URL. (Local HTTP dev is OK for development.)
4. App-level HTTP→redirect: **not implemented** — keep **Pending Implementation** unless you add middleware.

---

### CONFIG-002 — Security headers

```powershell
curl -s -I http://127.0.0.1:3001/health
```
**Pass if:** headers include `content-security-policy`, `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`. HSTS only when `NODE_ENV=production`. Screenshot DevTools → Network → Response Headers. → Mark **Passed**.

---

### CONFIG-003 — Production error handling

1. Run server with `NODE_ENV=production` (or test on staging).
2. Trigger an invalid API call; confirm response is generic (no stack trace).
3. Try `GET /api/debug/infra-user-events` → should be disabled/404 in production.

---

### LOG-001 — Login logging

1. Perform one failed login and one successful student login.
2. Admin → **Audit Logs** (`/admin/audit-logs`) or query:
   ```sql
   SELECT type, payload, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 10;
   ```
3. **Pass if:** login events appear with timestamp and user. Screenshot. → Mark **Passed**.

---

### LOG-002 — Grade change logging

1. Faculty: save a score on an assignment/quiz.
2. Admin: Audit Logs → find grade event with old/new values.
3. **Pass if:** audit row shows who changed what. Screenshot. → Mark **Passed**.

---

### LOG-003 — Log tamper detection

1. As **student**, try to open `/admin/audit-logs` → blocked.
2. As student, `curl` delete audit endpoint → should **403/401**.
3. **Honest result:** non-admin blocked; super-admin **can** delete logs — true tamper-proofing is **Pending Implementation**.

---

### DATA-001 — PII encryption

1. Ensure `AES_256_SECRET_KEY` is in `.env`.
2. Admin: create/update a student.
3. In pgAdmin:
   ```sql
   SELECT id, LEFT(first_name,15), LEFT(last_name,15) FROM students ORDER BY id DESC LIMIT 3;
   ```
4. **Pass if:** values start with `enc:v1:`. Screenshot. → Mark **Passed**.

---

### DATA-002 — TLS in transit

1. On production URL, verify browser padlock / valid certificate.
2. **Pass if:** HTTPS with valid cert. → Mark **Passed** (production only).

---

### DATA-003 — Password hashing

```sql
SELECT u.email, LEFT(a.password, 7) AS hash_prefix
FROM account a JOIN "user" u ON u.id = a."userId"
WHERE a."providerId" = 'credential' LIMIT 3;
```
**Pass if:** `hash_prefix` is `$2b$12` or similar bcrypt—not plaintext. Screenshot. Check `docs/evidence/automated/DB_Password_Hash_Evidence.txt`. → Mark **Passed**.

---

## Quick reference: mark Passed when…

| ID | Mark **Passed** when you observe… |
|---|---|
| AUTH-001 | 5 wrong passwords → account locked ~5 min |
| AUTH-002 | Same generic error for wrong user vs wrong password |
| AUTH-003 | Incognito → protected URLs redirect; API → 401 |
| AUTH-004 | Idle 30 min (or 1 min dev tweak) → auto sign-out |
| AUTH-005 | Student credentials rejected on faculty login |
| SESS-001 | After logout, dashboard/API returns login/401 |
| INPUT-001 | Non-PDF upload rejected |
| INPUT-002 | Oversized file rejected |
| INPUT-003 | XSS string shown as text, no alert |
| SQLI-001 | SQLi login strings fail safely |
| ACCESS-001/002 | Wrong role redirected away |
| ACCESS-003 | curl without cookie → 401 |
| CONFIG-002 | Helmet headers visible on `/health` |
| LOG-001/002 | Events visible in Audit Logs |
| DATA-001 | `enc:v1:` in student DB columns |
| DATA-003 | bcrypt hash in `account` table |

---

## Discrepancies: Code vs. Documentation Claims

| # | Claim | Actual implementation | Impact |
|---|---|---|---|
| 1 | 30-minute session timeout | Client idle only; server session = 7 days | State accurately in AUTH-004 |
| 2 | X-Frame-Options: DENY | Code uses **SAMEORIGIN** | CONFIG-002: verify live headers |
| 3 | Tamper-proof audit logs | Super-admin can delete rows | LOG-003: Pending Implementation |
| 4 | ACCOUNT_LOCKED error code | Server returns INVALID_EMAIL_OR_PASSWORD | AUTH-002: generic message still passes |
| 5 | AES-256 for all PII | Six student columns only | DATA-001: scope limited |
| 6 | HTTPS enforced in app | Deploy-level TLS only | CONFIG-001: infra verification |

---

## Supporting Evidence Checklist

Per test case folder: `docs/evidence/security-tests/{TEST_ID}/`

| Artifact | Status |
|---|---|
| Test case sheet | Complete (this document) |
| Screenshots | Capture during test execution |
| Video | Record during test execution |
| Logs | Extract during test run |
| Result summary | Complete after each test |
| Remediation notes | Fill only if Failed |

**Execution order:** `npm run dev` → `npm run security:evidence` → manual tests → update Status to **Passed** with evidence.

---

*Update Status to **Passed** only after you run the test and save proof. Expected Actual Result values above describe what a successful run should show based on the codebase.*

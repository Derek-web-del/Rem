# LenLearn Security Checklist

Operational guidance for XSS prevention, MFA enforcement, and pre-auth login messaging.

---

## Rich HTML (XSS)

### Rules

- **Always** call `sanitizeHtml()` from `Frontend/src/lib/sanitizeHtml.js` before:
  - `dangerouslySetInnerHTML`
  - Writing to `contentEditable` via `element.innerHTML`
- **Always** call `escapeHtml()` on plain text before wrapping in HTML tags (e.g. plagiarism `<mark>` highlights).
- DOMPurify is **browser-only** — do not import `sanitizeHtml.js` from server code.

### Allowed tags (lesson/report allowlist)

`p`, `br`, `strong`, `em`, `u`, `ol`, `ul`, `li`, `h1`–`h4`, `blockquote`, `span`, `div`, `table`, `tr`, `td`, `th`, `mark`

Allowed attributes: `class`, `style`, `href`, `target`, `rel`

### API input scanning

`server/middleware/sanitizeInput.js` scans **all** `/api/*` requests except paths on the skip list (`NON_AUDITABLE_PATH_PATTERNS` — session refresh, backup multipart, static uploads, health, etc.).

Student write paths (`/api/v1/student/quizzes`, assignments, activities, etc.) are covered automatically.

---

## MFA (email OTP 2FA)

### New deployments

1. Run migrations and seed as usual.
2. Enable MFA for all portal accounts:
   ```bash
   npm run ensure:portal-mfa
   ```
3. Verify (CI-friendly, exit code 1 if any account lacks MFA):
   ```bash
   npm run verify:portal-mfa
   ```

### Production startup

In `NODE_ENV=production`, the auth server queries portal users (`admin`, `teacher`, `student`, `faculty`) missing `twoFactorEnabled` or `emailVerified`.

- Logs an **error** and **exits** unless `AUTH_REQUIRE_MFA_ALL=false`.
- Default: strict (exit on missing MFA).

### Environment variables

| Variable | Purpose |
|----------|---------|
| `AUTH_TWO_FACTOR_SKIP_VERIFY_ON_ENABLE` | **Never `true` in production.** Test/dev only — skips OTP verification when enabling 2FA via Better Auth API. |
| `AUTH_REQUIRE_MFA_ALL` | Production startup gate. Default strict; set `false` to warn without exiting. |

### New portal users

`server/lib/provisionPortalAuthUser.js` should keep `twoFactorEnabled !== false` for newly provisioned roster users.

---

## Login error message policy (pre-auth)

To prevent user enumeration, **all failed sign-in attempts before authentication** return the same client-visible shape:

- Code: `INVALID_EMAIL_OR_PASSWORD`
- Message: `Invalid email or password`

This applies to:

- Unknown email/username
- Wrong password
- Account in lockout cooldown

**Internal audit logs** retain full detail (`LOGIN_FAILED`, `AUTH_LOCKOUT`, lockout payloads, IP, portal).

**UX tradeoff:** Locked-out users see the generic message at login; detailed lockout messaging may appear only on post-auth surfaces if implemented.

---

## Quick verification

```bash
npm run build
npm run test -- tests/sanitize-input.test.js
npm run verify:portal-mfa    # after ensure:portal-mfa
```

Manual checks:

- Lesson description with `<script>alert(1)</script>` — no script execution.
- Login with wrong password vs locked account — same error text in UI.
- Admin/teacher/student login — OTP email required after password when MFA is on.

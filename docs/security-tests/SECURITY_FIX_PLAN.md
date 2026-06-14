# LenLearn Security Fix Plan

**Source:** Security Code Review findings (June 14, 2026)  
**Scope:** XSS + Broken Auth / 2FA only. SQL Injection, CSRF, and Brute Force remain as-is.  
**Status:** Implemented

---

## Expected outcome

| Attack | Before | After |
|--------|--------|-------|
| SQL Injection | OK | OK |
| XSS | NEEDS ATTENTION | OK |
| CSRF | OK | OK |
| Brute Force | OK | OK |
| Broken Auth | NEEDS ATTENTION | OK |

**Overall:** NEEDS ATTENTION → OK for reviewed categories

---

## Issue 1 — XSS (stored/reflected HTML)

### Problem

Rich HTML was rendered without sanitization in 4 frontend files. `server/middleware/sanitizeInput.js` only scanned routes matching `AUDITABLE_PATH_PATTERNS`; many `/api/v1/student/*` and other write paths were skipped.

### Affected files

| File | Risk |
|------|------|
| `Frontend/src/pages/teachers/subject-detail/shared/LessonViewerModal.jsx` | 2× `dangerouslySetInnerHTML` with `lesson.description` |
| `Frontend/src/pages/teachers/subject-detail/shared/LessonClassroomView.jsx` | `dangerouslySetInnerHTML` with `lesson.description` |
| `Frontend/src/pages/teachers/subject-detail/shared/LessonRichTextField.jsx` | `el.innerHTML` read/write (editor) |
| `Frontend/src/pages/teachers/TeacherOriginalityReportView.jsx` | `highlightContent()` builds HTML via string replace, then `dangerouslySetInnerHTML` |

### Fix (implemented)

1. Added `dompurify` and `Frontend/src/lib/sanitizeHtml.js` (`sanitizeHtml`, `escapeHtml`).
2. Patched all four frontend files to sanitize before render/read/write.
3. Refactored `sanitizeInput.js` to scan all `/api` routes except `NON_AUDITABLE_PATH_PATTERNS`.

---

## Issue 2 — Broken Auth / 2FA gap

### Problem

1. Existing DB rows could have `twoFactorEnabled` false/null.
2. `skipVerificationOnEnable` could be true via env in non-test environments.
3. Login responses differed: `ACCOUNT_LOCKED` vs `INVALID_EMAIL_OR_PASSWORD` (user enumeration).
4. MFA was not verified at server startup in production.

### Fix (implemented)

1. Added `scripts/verify-mfa-all-accounts.mjs` and `npm run verify:portal-mfa`.
2. Hardened `resolveTwoFactorSkipVerificationOnEnable()` in `server/auth.js`.
3. Production startup MFA count check in `server/index.js` (`AUTH_REQUIRE_MFA_ALL`).
4. Lockout pre-auth errors now return `INVALID_EMAIL_OR_PASSWORD` (audit detail unchanged).
5. Documented env vars in `.env.example`.

---

## Verification checklist

**XSS**

- Inject `<script>alert(1)</script>` in lesson description → no alert; content stripped/escaped.
- Plagiarism report with `<img onerror=...>` in content → sanitized.
- Student quiz submit with SQLi/XSS probe in text field → 400 from middleware (when not binary-skipped).

**2FA**

- `npm run verify:portal-mfa` returns exit 0 after `npm run ensure:portal-mfa`.
- Login as admin/teacher/student: password → OTP email → session only after verify.
- Wrong password / unknown user / locked account: same generic client error.
- Audit logs still show `LOGIN_FAILED`, `AUTH_LOCKOUT` with full detail.

**Build**

- `npm run build` passes (DOMPurify is client-only).

---

## Files changed

| File | Change |
|------|--------|
| `package.json` | Add `dompurify`, `verify:portal-mfa` script |
| `Frontend/src/lib/sanitizeHtml.js` | New |
| Lesson viewer/editor + originality report | Sanitize HTML |
| `server/middleware/sanitizeInput.js` | Scan all `/api` (skip list only) |
| `server/auth.js` | Generic login errors; production 2FA bypass guard |
| `server/index.js` | Startup MFA validation |
| `.env.example` | MFA env vars |
| `scripts/verify-mfa-all-accounts.mjs` | New |

See `SECURITY_CHECKLIST.md` for ongoing operational guidance.

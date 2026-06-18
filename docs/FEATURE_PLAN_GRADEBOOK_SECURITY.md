# Feature Plan: Gradebook & Security (4 Features)

**Scope:** Implementation reference for four LenLearn LMS security and gradebook features.

**Recommended implementation order:** Feature 1 → Feature 2 → Feature 3 → Feature 4

---

## Cross-cutting findings

| Topic | Current LenLearn behavior |
|-------|---------------------------|
| Deadlines | `submission_deadline` (assignments/activities), `deadline` (quizzes) as `TIMESTAMPTZ`; server compares UTC instants via `isDeadlinePassed()` (`deadline >= now` = still open) |
| Score lock | Teacher PATCH score APIs return `403 SCORE_LOCKED` after deadline; admin bypass via `PATCH /api/v1/admin/grade-override` |
| Gradebook bypass | `POST /api/v1/teacher/subjects/:subjectId/gradebook/scores` has no deadline guard |
| Password reset audit | Both self and admin flows log `PASSWORD_RESET_REQUESTED`; admin distinguished only by `details.source: "admin"` |
| Archive restore | Simple yes/no modal in Archive Vault; no password re-auth |

---

# Feature 1 — Distinguish Who Initiated a Password Reset

## 1. Current behavior

- **Scenario A (self):** `ForgotPassword.jsx` → Better Auth `POST /api/auth/request-password-reset` → logs `PASSWORD_RESET_REQUESTED` with `details.source: "self"`.
- **Scenario B (admin):** Send Reset Email on Students/Faculties pages → `POST /api/v1/admin/send-password-reset` → same event type with `source: "admin"` metadata.
- **Completion:** `PASSWORD_RESET_COMPLETED` always logs `source: 'self'`.
- **Monitoring:** Generic labels; no initiator/target display.

## 2. Problem

Both scenarios use one event type; admin identity is buried in JSON; UI does not surface who initiated the reset.

## 3. Required new behavior

| Scenario | Event type | Initiated by | Description |
|----------|------------|--------------|-------------|
| A | `PASSWORD_RESET_REQUESTED` | User themselves | "User requested their own password reset" |
| B | `ADMIN_INITIATED_PASSWORD_RESET` | Admin name + id | "Admin [Name] sent a password reset email to [User Name]" |

## 4. Files to change

- `server/auth.js`, `server/services/CustomActivityLogger.js`, `server/api/adminPasswordResetV1.js`
- `Frontend/src/lib/auditEventDisplay.js`, `Frontend/src/pages/MonitoringRecords.jsx`, `shared/auditPortalModules.js`
- `tests/password-reset.test.js`

## 5–7. Database / APIs / UI

No DB changes. No new endpoints. Audit display only.

## 8. Audit log events

- `PASSWORD_RESET_REQUESTED` — self-service only
- `ADMIN_INITIATED_PASSWORD_RESET` — admin send
- `PASSWORD_RESET_COMPLETED` — user completes reset

## 9. Implementation order

1. Add `logAdminInitiatedPasswordReset()` in CustomActivityLogger
2. Update `adminPasswordResetV1.js` to log new event (replace duplicate)
3. Update `auth.js` — skip `PASSWORD_RESET_REQUESTED` when `source === 'admin'`
4. Update audit labels + Monitoring Records
5. Extend tests

## 10. Edge cases

- Admin sends for unknown email: log only when user found (anti-enumeration)
- Include `targetRole` in details
- `PASSWORD_CHANGED` (Set Password) remains separate

---

# Feature 2 — Require Admin Password Confirmation to Restore Archived Accounts

## 1. Current behavior

Restore uses session-only auth with a simple yes/no modal. No password re-verification.

## 2. Problem

Weaker gate than backup restore; accidental restore possible.

## 3. Required new behavior

Restore modal requires admin password; backend verifies before `archived_at = NULL`.

## 4. Files to change

- `server/lib/verifySessionPassword.js` (new), `server/api/state/archiveRouter.js`
- `Frontend/src/pages/ArchiveVault.jsx`

## 5–7. Database / APIs / UI

No DB changes. Extend `POST /api/v1/admin/restore/:type/:id` with `{ password }`. Password field in restore modal.

## 8. Audit log events

- `RESTORE_PASSWORD_FAILED` — wrong password
- `STUDENT_RESTORED` / `FACULTY_RESTORED` — add `restore_confirmed_with_password: true`

## 9. Implementation order

1. `verifyAdminPassword()` helper
2. Archive restore route password check
3. ArchiveVault UI
4. Failure audit logging

## 10. Edge cases

- 3 failures / 15 min → 429
- OAuth-only admin without password → clear error
- Keep 7-day auto-delete warning

---

# Feature 3 — Teacher Cannot Directly Edit Grades in Gradebook

## 1. Current behavior

Gradebook cells are inline number inputs with Save Grades → `POST .../gradebook/scores`. Bypasses deadline locks.

## 2. Problem

Shortcut undermines proper grading flow and Feature 4.

## 3. Required new behavior

Read-only gradebook cells; block POST scores API; link to item views for grading.

## 4. Files to change

- `GradebookTable.jsx`, `TeacherSubjectGradebookPage.jsx`, `teacherGradebook.js`
- `server/api/teacherGradebookV1.js`, `server/lib/gradebookDb.js`

## 5–7. Database / APIs / UI

No DB. Block existing POST endpoint. Read-only table UI + info banner.

## 8. Audit log events

None required if API hard-disabled.

## 9. Implementation order

1. Backend 403 on POST scores
2. Frontend read-only cells, remove Save
3. Navigation hints to grading views

## 10. Edge cases

- Banner: "Grades are updated from Assignments, Activities, and Quizzes"
- Export uses DB scores only

---

# Feature 4 — Overdue Deadline Logic + Admin Overwrite Approval

## 1. Current behavior

List Edit always shown; PUT allowed after deadline. Score edit locked after deadline. Admin `GRADE_OVERRIDE` only; no teacher request workflow.

## 2. Problem

Teachers can edit overdue items; no approval trail for post-deadline score changes.

## 3. Required new behavior

**Part A:** Hide Edit when overdue; block PUT server-side.

**Part B:** Teacher overwrite requests → admin approve/reject → audit chain.

## 4. Files to change

- Teacher list pages + PUT handlers (assignments, activities, quizzes)
- `server/lib/scoreOverwriteRequestsDb.js`, `server/api/scoreOverwriteRequestsV1.js`
- `ScoreOverwriteRequestModal.jsx`, `AdminScoreOverwriteRequestsPage.jsx`
- Teacher item views (Request button when locked)

## 5. Database changes

Migration `056_score_overwrite_requests.sql` — table `score_overwrite_requests`.

## 6. New API endpoints

- `POST/GET /api/v1/teacher/score-overwrite-requests`
- `GET/PATCH /api/v1/admin/score-overwrite-requests/:id`

## 7. New UI components

- `ScoreOverwriteRequestModal.jsx`
- `AdminScoreOverwriteRequestsPage.jsx`

## 8. Audit log events

- `SCORE_OVERWRITE_REQUESTED`, `SCORE_OVERWRITE_APPROVED`, `SCORE_OVERWRITE_REJECTED`

## 9. Implementation order

1. Migration + DB layer
2. Teacher + admin APIs
3. Part A overdue edit lock
4. Teacher request modal
5. Admin review page + nav
6. Audit labels

## 10. Edge cases

- Deadline inclusive until exact instant (`>= now` open)
- Duplicate pending request rejected per submission
- Approve triggers final grade recompute
- Delete still allowed when overdue

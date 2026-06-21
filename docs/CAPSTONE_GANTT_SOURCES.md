# LenLearn Gantt Chart — Task Evidence Sources

This document maps each row in [`capstone_gantt_chart.html`](capstone_gantt_chart.html) to repository evidence. Use it when defending schedule feasibility during capstone panel review.

## Date methodology

| Label | Meaning |
|-------|---------|
| **Inferred** | No git commits exist before **19 May 2026**. Sprint 1–2 and early Sprint 3 start dates are aligned with capstone milestones and reference-style sprint planning (May 1–18). |
| **Git-anchored** | Start/end dates derived from commit timestamps, migration introduction, or file first-appearance in version control. |
| **Evidence-anchored** | Dates supported by automated test output timestamps under `docs/evidence/automated/`. |

**Timeline range:** May 1 – June 19, 2026 (50 calendar days; bar math uses 49 intervals with May 1 = day 0).

**Git repository span:** `aa98e8c` (2026-05-19) through `84c0ae8` (2026-06-19), author `Derek-web`.

---

## SPRINT 1 — Planning and requirements

| Task | Dates | Owner | Evidence type | Source |
|------|-------|-------|---------------|--------|
| 1.1 Requirements gathering | 5/1 – 5/5 | All | Inferred | Capstone planning phase; no repo artifacts |
| 1.2 Stakeholder interviews | 5/5 – 5/9 | All | Inferred | Capstone planning phase; no repo artifacts |
| 1.3 Feasibility study (technical, economic, security) | 5/8 – 5/12 | All | Inferred | Matches manuscript sections 3.2.4.x (technical, economic, security feasibility) |

---

## SPRINT 2 — Design and prototyping

| Task | Dates | Owner | Evidence type | Source |
|------|-------|-------|---------------|--------|
| 2.1 UI/UX wireframes (Admin, Faculty, Student) | 5/10 – 5/17 | All | Inferred | Portal layouts reflected in `Frontend/src/` component structure |
| 2.2 PostgreSQL schema design (migrations 003–028) | 5/12 – 5/19 | Derek-web | Git-anchored | Initial snapshot commit `aa98e8c` (2026-05-19) includes `Database/migrations/003` through `028` |
| 2.3 Security architecture design (RBAC, AES-256, audit) | 5/14 – 5/19 | Derek-web | Git-anchored (partial) | `server/lib/security.js`, `Database/migrations/009_audit_logs.sql` in snapshot; AES-256-GCM finalized in deploy commit `7d84891` (2026-06-14): `server/lib/aes256.js`, `Database/migrations/036_student_pii_encryption.sql` |

---

## SPRINT 3 — Core development

| Task | Dates | Owner | Evidence type | Source |
|------|-------|-------|---------------|--------|
| 3.1 Authentication (Better Auth, bcrypt, email OTP 2FA) | 5/18 – 5/25 | Derek-web | Git-anchored | `server/auth.js`, `server/password.js` in snapshot `aa98e8c`; bcrypt cost 12, `twoFactor` email OTP plugin |
| 3.2 Admin portal (users, subjects, sections, curriculum) | 5/20 – 5/28 | All | Git-anchored | `Frontend/src/InstituteDashboard.jsx`, `Frontend/src/pages/Students.jsx`, `Frontend/src/pages/Faculties.jsx` in snapshot |
| 3.3 Faculty portal (quizzes, materials, sections) | 5/22 – 5/31 | All | Git-anchored | `Frontend/src/pages/teachers/` (quizzes, materials, sections, dashboard) in snapshot |
| 3.4 Student portal (dashboard, quizzes, assignments) | 5/28 – 6/7 | All | Git-anchored | Major student pages added in commit `7d84891` (2026-06-14): `Frontend/src/pages/students/StudentDashboard.jsx`, `StudentQuizTakePage.jsx`, assignment/activity pages |
| 3.5 Online quiz & exam lockdown | 5/25 – 6/10 | Derek-web | Git-anchored | `Frontend/src/lib/quizSessionGuard.js`, `Database/migrations/047_quiz_submission_violations.sql`, `Database/migrations/030_quiz_submissions.sql` — commit `7d84891` |
| 3.6 Gradebook & grading criteria | 6/1 – 6/12 | All | Git-anchored | `Frontend/src/pages/teachers/subject-detail/gradebook/`, `TeacherSubjectGradebookPage.jsx`, `Database/migrations/046_subject_grade_components.sql` — commit `7d84891` |
| 3.7 AI plagiarism checker | 6/3 – 6/12 | Derek-web | Git-anchored | `Database/migrations/029_plagiarism_reports.sql` through `034`, `Frontend/src/pages/teachers/TeacherOriginalityCheckerPage.jsx`, `server/api/plagiarismReportsV1.js` — commit `7d84891`; fix `988de57` (2026-06-16) |
| 3.8 Monitoring, audit logs & PII encryption | 5/22 – 6/10 | Derek-web | Git-anchored | `Frontend/src/pages/MonitoringRecords.jsx`, `server/routes/monitoring.js` in snapshot; PII encryption `036` + `aes256.js` in `7d84891`; audit UX fixes through `0883057` (2026-06-17) |
| 3.9 Backup & recovery (.lnbak, Google Drive) | 5/25 – 6/18 | Derek-web | Git-anchored | `Frontend/src/pages/BackupPage.jsx`, `server/lib/backupService.js` in snapshot; manifest migration `055_backup_files_metadata.sql` in `bc56310` (2026-06-18) |

---

## SPRINT 4 — Testing and deployment

| Task | Dates | Owner | Evidence type | Source |
|------|-------|-------|---------------|--------|
| 4.1 Security testing & evidence capture | 6/5 – 6/12 | All | Evidence-anchored | `docs/evidence/automated/*.txt` generated **2026-06-09** (`RBAC_Evidence.txt`, `DB_Password_Hash_Evidence.txt`, `Session_Logout_Evidence.txt`, etc.); run via `npm run security:evidence` per `docs/evidence/README.md` |
| 4.2 Railway + Cloudflare production deploy | 6/12 – 6/17 | Derek-web | Git-anchored | `railway.toml`, `docs/DEPLOYMENT_CHECKLIST.md` — commits `5d90804` (2026-06-15), `3628383`–`a74387c` (2026-06-16 Resend/SMTP/CSP fixes); Cloudflare DNS per `SETUP.md` §13.6 |
| 4.3 QA, bug fixing & final polish | 6/14 – 6/19 | All | Git-anchored | Commits `7d84891` through `84c0ae8`: upload fixes (`e5cbe80`), grade criteria audit (`817093c`, `60ae4d3`), faculty grades scope (`097062b`), archive auto-purge (`bc56310`) |

---

## Key git commits (chronological)

| Date | Commit | Summary |
|------|--------|---------|
| 2026-05-19 | `aa98e8c` | Full project snapshot — core admin/faculty portals, auth, migrations 003–028 |
| 2026-06-09 | — | Automated security evidence captured (`docs/evidence/automated/`) |
| 2026-06-14 | `7d84891` | Production deploy batch — student portal, gradebook, plagiarism, quiz lockdown, PII encryption |
| 2026-06-15 | `5d90804` | Railway tooling, health checks, deployment checklist |
| 2026-06-15 | `aac9c4a` | Security hardening, operational data visibility |
| 2026-06-16 | Multiple | Railway SMTP/Resend, CSP, migration repairs |
| 2026-06-18 | `bc56310` | Backup manifest, archive auto-purge |
| 2026-06-19 | `84c0ae8` | Final polish |

---

## Capstone narrative (for manuscript)

> **Figure X.** presents the project Gantt chart for the LenLearn LMS development schedule from May 1 to June 19, 2026. Tasks are grouped into four sprints covering planning, design, core module development, and testing/deployment. Dates for work prior to May 19 are inferred from capstone milestones; dates from May 19 onward are anchored to version-control commits and automated security evidence capture.

---

## Owner column note

Custom team names were not provided at plan time. The chart uses **All** for collaborative/planning tasks and **Derek-web** (git author) for backend, security, and deployment tasks. Replace these labels in `capstone_gantt_chart.html` if your panel requires individual member names.

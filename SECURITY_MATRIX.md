# Security Evaluation Matrix — LenLearn LMS

This matrix aligns the LenLearn LMS implementation with the thesis Security Evaluation Matrix (STRIDE threats, functionality evaluation, and OWASP Top 10 2021 controls).

| Research Objective | Functional Output / Module | Functionality Evaluation | STRIDE Threat | Security Test / Metric | Expected Chapter 4 Evidence |
| --- | --- | --- | --- | --- | --- |
| Develop secure user authentication and account management for authorized users | Login / User Management Module | Functional Suitability, Usability | Spoofing | Invalid Login Blocking, Account Lockout, Role-Based Access Restriction (OWASP A07:2021 Identification and Authentication Failures; OWASP A01:2021 Broken Access Control) | Authentication Security Results |
| Develop secure data entry and student record management features | Records / Database Management Module | Functional Correctness, Reliability | Tampering | Unauthorized Record Modification Detection, Input Validation Accuracy, Record Integrity Checking (OWASP A03:2021 Injection; OWASP A04:2021 Insecure Design) | Input Validation Results |
| Implement audit trail and monitoring mechanisms for accountability | Logs / Monitoring Module | Reliability, Functional Suitability | Repudiation | Activity Log Completeness, User Action Tracking Accuracy, Monitoring Reliability (OWASP A09:2021 Security Logging and Monitoring Failures) | Logging & Monitoring Results |
| Protect sensitive student records and assessment data | Reports / Protected Records / Session Controls | Reliability, Functional Correctness | Information Disclosure | Access Permission Validation, Unauthorized Access Blocking Rate, Secure Data Handling (OWASP A02:2021 Cryptographic Failures; OWASP A01:2021 Broken Access Control) | Data Protection Results |
| Maintain system continuity during interruptions | Core Services / Offline Framework | Performance Efficiency, Availability | Denial of Service | LAN Accessibility, Offline Stability, Recovery (OWASP A05:2021 Security Misconfiguration) | Availability Results |
| Enforce secure session handling | Session Management | Functional Correctness, Reliability | Elevation of Privilege | Session Timeout Enforcement, Access Restriction (OWASP A07:2021 Identification and Authentication Failures; OWASP A01:2021 Broken Access Control) | Session Security Results |
| Provide user-friendly LMS | Dashboard / Interface Module | Usability, Accessibility | Multiple | Ease of Navigation, User Satisfaction (OWASP A05:2021 Security Misconfiguration; OWASP A08:2021 Software and Data Integrity Failures) | Usability Evaluation Results |

## LenLearn implementation mapping (reference)

| Row | Module | Primary controls in codebase |
| --- | --- | --- |
| 1 | Login / User Management | Better Auth sign-in, 5-attempt lockout (`AUTH_LOCK_MS`), password policy, admin/faculty RBAC (`requireAdminSession`, `requireFacultyOrTeacherSession`) |
| 2 | Records / Database | Parameterized PostgreSQL queries, `sanitizeInput` middleware, `last_modified_by` / `updated_at` on students and faculties |
| 3 | Logs / Monitoring | `CustomActivityLogger`, `lms_activity_logs`, `audit_logs`, failed-login and institute CRUD events |
| 4 | Protected Records | Section-scoped teacher student access, bcrypt password hashing, secrets stripped from API and `localStorage` |
| 5 | Core Services / Offline | Express rate limits, Helmet headers, graceful error handling, offline `localStorage` sync (no secrets) |
| 6 | Session Management | 7-day session with refresh, httpOnly cookies, sign-out audit, forbidden self-update of `role` / lockout fields |
| 7 | Dashboard / Interface | React admin/teacher UI, generic API errors, destructive-action `confirm` tokens, no sensitive data in browser storage |

See also `SETUP.md` §11 for operational security configuration.

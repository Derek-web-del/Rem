/**
 * Backup / restore coverage map — every admin, teacher, and student data domain.
 * Used for validation, diagnostics, and tests (tables must appear in LNBAK_TABLE_ORDER).
 */

/** @typedef {{ module: string, roles: string[], tables: string[], fileFields?: string[], uploadDirs?: string[] }} BackupModuleCoverage */

export const BACKUP_MODULE_COVERAGE = /** @type {BackupModuleCoverage[]} */ ([
  {
    module: 'Auth — admin, teacher, student logins',
    roles: ['admin', 'teacher', 'student'],
    tables: ['user', 'account'],
  },
  {
    module: 'Admin — students & enrollment',
    roles: ['admin'],
    tables: ['students', 'sections', 'faculty_sections'],
  },
  {
    module: 'Admin — faculty profiles',
    roles: ['admin'],
    tables: ['faculties'],
    fileFields: ['photo_data_url', 'photo_url'],
    uploadDirs: ['faculties'],
  },
  {
    module: 'Admin — subjects & schedules',
    roles: ['admin'],
    tables: ['subjects', 'subject_schedules'],
    fileFields: ['subject_photo', 'syllabus_pdf'],
    uploadDirs: ['Subjects_images', 'syllabus'],
  },
  {
    module: 'Admin — curriculum guides',
    roles: ['admin'],
    tables: ['curriculum', 'curriculum_guides'],
    fileFields: ['file_url', 'file_data_url'],
    uploadDirs: ['curriculum'],
  },
  {
    module: 'Admin — announcements',
    roles: ['admin'],
    tables: ['announcements'],
    fileFields: ['image_path', 'announcement_image'],
    uploadDirs: ['announcements'],
  },
  {
    module: 'Teacher — subject structure (topics, lessons, subtopics)',
    roles: ['teacher'],
    tables: ['subject_topics', 'subject_modules', 'subject_module_subtopics'],
    fileFields: ['file_path', 'lesson_pdf', 'pdf_path'],
    uploadDirs: ['lessons'],
  },
  {
    module: 'Teacher — grade components & criteria',
    roles: ['teacher'],
    tables: ['subject_grade_components', 'subject_grade_criteria', 'subject_student_final_grades'],
  },
  {
    module: 'Teacher — assignments (create, publish, attachments)',
    roles: ['teacher'],
    tables: ['assignments'],
    fileFields: ['file_path'],
    uploadDirs: ['assignments'],
  },
  {
    module: 'Student — assignment submissions',
    roles: ['student'],
    tables: ['assignment_submissions'],
    fileFields: ['file_path', 'submission_file'],
    uploadDirs: ['submissions/assignments'],
  },
  {
    module: 'Teacher — activities (create, publish, attachments)',
    roles: ['teacher'],
    tables: ['activities'],
    fileFields: ['file_path'],
    uploadDirs: ['activities'],
  },
  {
    module: 'Student — activity submissions',
    roles: ['student'],
    tables: ['activity_submissions'],
    fileFields: ['file_path', 'submission_file'],
    uploadDirs: ['submissions/activities'],
  },
  {
    module: 'Teacher — quizzes (parts, questions, choices, passwords)',
    roles: ['teacher'],
    tables: [
      'quizzes',
      'quiz_parts',
      'quiz_questions',
      'quiz_choices',
      'quiz_answers',
      'quiz_password_access',
    ],
  },
  {
    module: 'Student — quiz attempts & answers',
    roles: ['student'],
    tables: ['quiz_submissions', 'quiz_student_answers'],
  },
  {
    module: 'Teacher — study & subject materials',
    roles: ['teacher'],
    tables: ['study_materials', 'subject_materials', 'faculty_study_materials'],
    fileFields: ['file_url', 'file_path'],
    uploadDirs: ['materials'],
  },
  {
    module: 'Teacher — plagiarism / originality uploads',
    roles: ['teacher'],
    tables: ['plagiarism_reports'],
    uploadDirs: ['originality'],
  },
  {
    module: 'Admin — grade overwrite requests',
    roles: ['admin'],
    tables: ['score_overwrite_requests'],
  },
  {
    module: 'Admin — audit & activity logs',
    roles: ['admin'],
    tables: ['audit_logs', 'lms_activity_logs'],
  },
  {
    module: 'Admin — Google Drive backup OAuth',
    roles: ['admin'],
    tables: ['google_oauth_tokens'],
  },
  {
    module: 'Institute UI snapshot (sections/faculty/curriculum mirrors)',
    roles: ['admin'],
    tables: [],
  },
])

/** All PostgreSQL table keys that must be included in a full .lnbak export. */
export function allBackupModuleTableKeys() {
  const set = new Set()
  for (const m of BACKUP_MODULE_COVERAGE) {
    for (const t of m.tables || []) set.add(t)
  }
  return [...set]
}

/** All DB column names that may reference files on disk. */
export function allBackupFileFields() {
  const set = new Set()
  for (const m of BACKUP_MODULE_COVERAGE) {
    for (const f of m.fileFields || []) set.add(f)
  }
  return [...set]
}

/** Upload subdirectories that must be packed into uploads_archive.tar.gz. */
export function allBackupUploadDirs() {
  const set = new Set()
  for (const m of BACKUP_MODULE_COVERAGE) {
    for (const d of m.uploadDirs || []) set.add(d)
  }
  return [...set]
}

/** Tables validated after restore (row count vs backup snapshot). */
export function allRestoreValidationTableKeys() {
  return allBackupModuleTableKeys().filter((k) => k !== 'user' || true)
}

export function summarizeModuleCoverage(tableOrderKeys) {
  const orderSet = new Set(tableOrderKeys || [])
  return BACKUP_MODULE_COVERAGE.map((m) => {
    const missing = (m.tables || []).filter((t) => !orderSet.has(t))
    return {
      module: m.module,
      roles: m.roles,
      tables: m.tables,
      upload_dirs: m.uploadDirs || [],
      covered: missing.length === 0,
      missing_tables: missing,
    }
  })
}

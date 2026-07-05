/** Logical backup keys → PostgreSQL identifiers (whitelist only). */
export const LNBAK_TABLE_KEYS = [
  'user',
  'account',
  'google_oauth_tokens',
  'curriculum',
  'curriculum_guides',
  'sections',
  'faculties',
  'faculty_study_materials',
  'faculty_sections',
  'subjects',
  'subject_grade_criteria',
  'subject_grade_components',
  'subject_topics',
  'subject_modules',
  'subject_module_subtopics',
  'students',
  'subject_student_final_grades',
  'announcements',
  'study_materials',
  'subject_materials',
  'assignments',
  'activities',
  'assignment_submissions',
  'activity_submissions',
  'score_overwrite_requests',
  'quizzes',
  'quiz_password_access',
  'quiz_parts',
  'quiz_questions',
  'quiz_choices',
  'quiz_answers',
  'quiz_submissions',
  'quiz_student_answers',
  'plagiarism_reports',
  'audit_logs',
  'lms_activity_logs',
]

/** Included in .lnbak `data` but restored separately (not truncated with roster tables). */
export const LNBAK_EXTRA_DATA_KEYS = ['app_state']

export const BACKUP_TABLE_REGISTRY = {
  sections: {
    fromSql: 'public.sections',
    deleteOrder: 10,
    insertOrder: 10,
    orderBy: 'id',
  },
  curriculum: {
    fromSql: 'public.curriculum',
    deleteOrder: 15,
    insertOrder: 15,
    orderBy: 'id',
  },
  students: {
    fromSql: 'public.students',
    deleteOrder: 30,
    insertOrder: 20,
    orderBy: 'id',
  },
  faculties: {
    fromSql: 'public.faculties',
    deleteOrder: 25,
    insertOrder: 25,
    orderBy: 'created_at',
  },
  faculty_sections: {
    fromSql: 'public.faculty_sections',
    deleteOrder: 35,
    insertOrder: 30,
    orderBy: 'faculty_id',
  },
  subjects: {
    fromSql: 'public.subjects',
    deleteOrder: 40,
    insertOrder: 35,
    orderBy: 'id',
  },
  announcements: {
    fromSql: 'public.announcements',
    deleteOrder: 50,
    insertOrder: 40,
    orderBy: 'created_at',
  },
  audit_logs: {
    fromSql: 'public.audit_logs',
    deleteOrder: 60,
    insertOrder: 50,
    orderBy: 'created_at',
  },
  lms_activity_logs: {
    fromSql: 'public.lms_activity_logs',
    deleteOrder: 65,
    insertOrder: 55,
    orderBy: '"timestamp"',
  },
  users: {
    fromSql: '"user"',
    deleteOrder: 70,
    insertOrder: 60,
    orderBy: 'id',
  },
}

export const DEFAULT_BACKUP_TABLE_KEYS = [...LNBAK_TABLE_KEYS]

export function normalizeBackupTableKeys(tables) {
  const raw = Array.isArray(tables) ? tables : DEFAULT_BACKUP_TABLE_KEYS
  const allowed = new Set([...LNBAK_TABLE_KEYS, ...Object.keys(BACKUP_TABLE_REGISTRY)])
  const out = []
  for (const key of raw) {
    const k = String(key || '').trim()
    if (k && allowed.has(k) && !out.includes(k)) out.push(k)
  }
  return out.length ? out : [...DEFAULT_BACKUP_TABLE_KEYS]
}

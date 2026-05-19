/** Logical backup keys → PostgreSQL identifiers (whitelist only). */
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

export const DEFAULT_BACKUP_TABLE_KEYS = [
  'sections',
  'curriculum',
  'students',
  'faculties',
  'faculty_sections',
  'subjects',
  'announcements',
  'audit_logs',
  'lms_activity_logs',
  'users',
]

export function normalizeBackupTableKeys(tables) {
  const raw = Array.isArray(tables) ? tables : DEFAULT_BACKUP_TABLE_KEYS
  const out = []
  for (const key of raw) {
    const k = String(key || '').trim()
    if (k && BACKUP_TABLE_REGISTRY[k] && !out.includes(k)) out.push(k)
  }
  return out.length ? out : [...DEFAULT_BACKUP_TABLE_KEYS]
}

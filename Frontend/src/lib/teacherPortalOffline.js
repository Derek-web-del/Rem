import { fetchWithOfflineCache } from './offlineFetch.js'

import { getListSnapshot, saveListSnapshot } from './indexedDB.js'

import { isOnline } from './offlineSync.js'



async function teacherFetchJson(path) {

  const { apiUrl } = await import('./lmsStateStorage.js')

  const res = await fetch(apiUrl(path), { credentials: 'include' })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {

    throw new Error(String(data?.message || data?.error || `Request failed (${res.status})`))

  }

  return data

}



export async function invalidateTeacherSubjectsCache() {
  await saveListSnapshot('teacher_subjects', [])
}

export async function fetchTeacherSubjects({ forceRefresh = false } = {}) {

  if (!isOnline()) {

    const cached = await getListSnapshot('teacher_subjects')

    if (cached.length > 0) return cached

    throw new Error('No offline data — connect to load content.')

  }

  if (forceRefresh) {
    await saveListSnapshot('teacher_subjects', [])
  }

  const data = await teacherFetchJson('/api/teacher/subjects')

  const subjects = Array.isArray(data)

    ? data

    : Array.isArray(data?.subjects)

      ? data.subjects

      : []

  await saveListSnapshot('teacher_subjects', subjects)

  return subjects

}



export async function fetchTeacherAdvisorySections() {

  if (!isOnline()) {

    const cached = await getListSnapshot('teacher_sections')

    if (cached.length > 0) return cached

    throw new Error('No offline data — connect to load content.')

  }

  const data = await teacherFetchJson('/api/teacher/advisory-sections')

  const sections = Array.isArray(data) ? data : Array.isArray(data?.sections) ? data.sections : []

  await saveListSnapshot('teacher_sections', sections)

  return sections

}



export async function fetchTeacherAssignmentView(id) {

  const aid = String(id ?? '').trim()

  if (!aid) throw new Error('Invalid assignment id.')

  const key = `assignment:${aid}`

  return fetchWithOfflineCache({

    storeName: 'faculty_work_details',

    id: key,

    fetchOnline: async () => {

      const { fetchTeacherAssignmentSubmissions } = await import('./teacherAssignments.js')

      return fetchTeacherAssignmentSubmissions(aid)

    },

    toCache: (payload) => ({ id: key, kind: 'assignment', ...payload }),

    fromCache: (row) => {

      if (!row?.assignment) return null

      return {

        assignment: row.assignment,

        submissions: Array.isArray(row.submissions) ? row.submissions : [],

        expiredUpdated: false,

      }

    },

  })

}



export async function fetchTeacherActivityView(id) {

  const aid = String(id ?? '').trim()

  if (!aid) throw new Error('Invalid activity id.')

  const key = `activity:${aid}`

  return fetchWithOfflineCache({

    storeName: 'faculty_work_details',

    id: key,

    fetchOnline: async () => {

      const { fetchTeacherActivitySubmissions } = await import('./teacherActivities.js')

      return fetchTeacherActivitySubmissions(aid)

    },

    toCache: (payload) => ({ id: key, kind: 'activity', ...payload }),

    fromCache: (row) => {

      if (!row?.activity) return null

      return {

        activity: row.activity,

        submissions: Array.isArray(row.submissions) ? row.submissions : [],

        expiredUpdated: false,

      }

    },

  })

}



export async function fetchTeacherQuizView(id) {

  const qid = String(id ?? '').trim()

  if (!qid) throw new Error('Invalid quiz id.')

  const key = `quiz:${qid}`

  return fetchWithOfflineCache({

    storeName: 'faculty_work_details',

    id: key,

    fetchOnline: async () => {

      const { fetchTeacherQuiz } = await import('./teacherQuizzes.js')

      const quiz = await fetchTeacherQuiz(qid)

      return { quiz }

    },

    toCache: (payload) => ({ id: key, kind: 'quiz', ...payload }),

    fromCache: (row) => (row?.quiz ? { quiz: row.quiz } : null),

  })

}



export async function fetchTeacherQuizRosterView(id, { sectionId } = {}) {

  const qid = String(id ?? '').trim()

  if (!qid) throw new Error('Invalid quiz id.')

  const section = sectionId != null && String(sectionId).trim() !== '' ? String(sectionId).trim() : ''

  const key = section ? `quiz-roster:${qid}:${section}` : `quiz-roster:${qid}`

  return fetchWithOfflineCache({

    storeName: 'faculty_work_details',

    id: key,

    fetchOnline: async () => {

      const { fetchTeacherQuizRosterScores } = await import('./teacherQuizzes.js')

      const roster = await fetchTeacherQuizRosterScores(qid, { sectionId: section || undefined })

      return { roster }

    },

    toCache: (payload) => ({ id: key, kind: 'quiz-roster', ...payload }),

    fromCache: (row) => (row?.roster ? { roster: row.roster } : null),

  })

}



export async function fetchFacultySubjectStream(subjectId) {

  const id = String(subjectId ?? '').trim()

  if (!id) throw new Error('Invalid subject id.')

  return fetchWithOfflineCache({

    storeName: 'faculty_subject_streams',

    id,

    fetchOnline: async () => {

      const { fetchSubjectTopics } = await import('./teacherSubjectCurriculum.js')

      const topics = await fetchSubjectTopicsOnline(id)

      return topics

    },

    toCache: (topics) => ({ id, topics }),

    fromCache: (row) => (Array.isArray(row.topics) ? row.topics : null),

  })

}



async function fetchSubjectTopicsOnline(subjectId) {

  const { apiUrl } = await import('./lmsStateStorage.js')

  const res = await fetch(apiUrl(`/api/teacher/subjects/${encodeURIComponent(subjectId)}/stream`), {

    credentials: 'include',

  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {

    throw new Error(String(data?.message || data?.error || 'Could not load subject stream.'))

  }

  return Array.isArray(data.topics) ? data.topics : []

}



/** Pre-fetch faculty list endpoints while online (dashboard warmup for offline). */

export async function warmFacultyOfflineCache() {

  if (!isOnline()) return

  const { fetchFacultyStudyMaterials } = await import('./facultyStudyMaterials.js')

  const { fetchTeacherAnnouncements } = await import('./teacherAnnouncements.js')

  const { fetchTeacherAssignments } = await import('./teacherAssignments.js')

  const { fetchTeacherActivities } = await import('./teacherActivities.js')

  const { fetchTeacherQuizzes } = await import('./teacherQuizzes.js')

  const { prefetchStudyMaterialPdfs } = await import('./pdfCacheStatus.js')

  const { getListSnapshot } = await import('./indexedDB.js')

  await Promise.allSettled([

    fetchTeacherSubjects(),

    fetchTeacherAdvisorySections(),

    fetchFacultyStudyMaterials(),

    fetchTeacherAnnouncements(),

    fetchTeacherAssignments(1),

    fetchTeacherActivities(1),

    fetchTeacherQuizzes(),

  ])

  try {

    const materials = await getListSnapshot('study_materials', 'faculty_list')

    await prefetchStudyMaterialPdfs(materials.map((m) => m?.file_url).filter(Boolean))

  } catch {

    void 0

  }

}



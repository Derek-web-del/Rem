const DB_NAME = 'lenlearn_offline'
const DB_VERSION = 3

/** All object store names (used by live-test-harness). */
export const OFFLINE_STORE_NAMES = [
  'quiz_progress',
  'quiz_answers',
  'sync_queue',
  'cached_quizzes',
  'student_profile',
  'announcements',
  'subjects',
  'study_materials',
  'assignments',
  'activities',
  'grades',
  'teacher_sections',
  'teacher_subjects',
  'quiz_list',
  'work_details',
  'announcement_details',
  'subject_streams',
  'quiz_details',
  'quiz_results',
  'admin_students',
  'admin_faculties',
  'admin_subjects',
  'admin_sections',
  'faculty_work_details',
  'faculty_grades_overview',
  'faculty_subject_streams',
]

const AUTO_INCREMENT_STORES = new Set(['sync_queue', 'grades'])

function storeOptions(name) {
  if (AUTO_INCREMENT_STORES.has(name)) {
    return { keyPath: 'id', autoIncrement: true }
  }
  return { keyPath: 'id' }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of OFFLINE_STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, storeOptions(name))
        }
      }
    }
  })
}

async function putStore(storeName, record) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put(record)
    tx.oncomplete = () => resolve(record)
    tx.onerror = () => reject(tx.error)
  })
}

async function getStore(storeName, id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).get(String(id))
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

async function getAllStore(storeName) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

/** @param {string} storeName @param {Record<string, unknown>} record */
export async function saveToStore(storeName, record) {
  if (!record || record.id == null) return null
  return putStore(storeName, { ...record, cachedAt: Date.now() })
}

/** @param {string} storeName @param {Array<Record<string, unknown>>} records */
export async function saveManyToStore(storeName, records) {
  if (!Array.isArray(records) || records.length === 0) return []
  const db = await openDb()
  const ts = Date.now()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    for (const row of records) {
      if (row?.id == null) continue
      store.put({ ...row, cachedAt: ts })
    }
    tx.oncomplete = () => resolve(records)
    tx.onerror = () => reject(tx.error)
  })
}

/** Save a list snapshot under a fixed key (default `list`). */
export async function saveListSnapshot(storeName, items, listKey = 'list') {
  return putStore(storeName, { id: listKey, items: items ?? [], cachedAt: Date.now() })
}

/** @param {string} storeName @param {string} id */
export async function getFromStore(storeName, id) {
  return getStore(storeName, id)
}

/** @param {string} storeName */
export async function getAllFromStore(storeName) {
  return getAllStore(storeName)
}

/** Load list snapshot items; falls back to all records excluding meta rows. */
export async function getListSnapshot(storeName, listKey = 'list') {
  const row = await getStore(storeName, listKey)
  if (row?.items && Array.isArray(row.items)) return row.items
  const all = await getAllStore(storeName)
  return all.filter((r) => r.id !== listKey && r.id !== 'current')
}

/** @param {string} storeName */
export async function clearStore(storeName) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).clear()
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
  })
}

export async function saveQuizProgress(data) {
  const quizId = String(data?.quizId ?? data?.quiz_id ?? '')
  if (!quizId) return null
  return putStore('quiz_progress', { id: quizId, ...data, updatedAt: Date.now() })
}

export async function getQuizProgress(quizId) {
  return getStore('quiz_progress', String(quizId))
}

export async function saveAnswer(answerData) {
  const quizId = String(answerData?.quizId ?? answerData?.quiz_id ?? '')
  const questionId = String(answerData?.questionId ?? answerData?.question_id ?? '')
  if (!quizId || !questionId) return null
  return putStore('quiz_answers', { id: `${quizId}:${questionId}`, ...answerData })
}

export async function getQuizAnswers(quizId) {
  const all = await getAllStore('quiz_answers')
  return all.filter((r) => String(r.quizId ?? r.quiz_id) === String(quizId))
}

export async function addToSyncQueue(item) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readwrite')
    const req = tx.objectStore('sync_queue').add({ ...item, createdAt: Date.now(), synced: false })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getPendingSyncItems() {
  const all = await getAllStore('sync_queue')
  return all.filter((r) => !r.synced)
}

export async function markAsSynced(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readwrite')
    const store = tx.objectStore('sync_queue')
    const req = store.get(Number(id))
    req.onsuccess = () => {
      const row = req.result
      if (!row) {
        resolve(false)
        return
      }
      store.put({ ...row, synced: true, syncedAt: Date.now() })
    }
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
  })
}

export async function cacheQuizData(quiz) {
  const id = String(quiz?.id ?? '')
  if (!id) return null
  return putStore('cached_quizzes', { id, quiz, cachedAt: Date.now() })
}

export async function getCachedQuiz(quizId) {
  const row = await getStore('cached_quizzes', String(quizId))
  return row?.quiz ?? null
}

export async function cacheStudentProfile(profile) {
  return putStore('student_profile', { id: 'current', profile, cachedAt: Date.now() })
}

export async function getCachedStudentProfile() {
  const row = await getStore('student_profile', 'current')
  return row?.profile ?? null
}

export async function cacheAnnouncements(list) {
  return saveListSnapshot('announcements', list)
}

export async function getCachedAnnouncements() {
  return getListSnapshot('announcements')
}

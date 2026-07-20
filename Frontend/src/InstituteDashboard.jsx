import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import BackButton from './components/BackButton.jsx'
import StudentsInSection from './StudentsInSection.jsx'
import StudentsPage from './modules/students/StudentsModule.jsx'
import FacultiesPage from './modules/faculty/FacultyModule.jsx'
import SubjectsPage from './modules/subjects/SubjectModule.jsx'
import UpdatesPage from './modules/updates/UpdatesModule.jsx'
import InstituteCurriculum, {
  CURRICULUM_STORAGE_KEY,
} from './modules/curriculum/InstituteCurriculum.jsx'
import { mapCurriculumGuideList } from './modules/curriculum/curriculumGuideMapping.js'
import { useNotify } from './components/notifications.jsx'
import { authClient } from './lib/auth-client.js'
import { getLmsStateEndpointUrl, apiUrl } from './lib/lmsStateStorage.js'
import { PROFILE_PHOTO_MAX_BYTES } from './lib/uploadLimits.js'
import { saveListSnapshot, getListSnapshot, getListSnapshotWithMeta } from './lib/indexedDB.js'
import { isOnline } from './lib/offlineSync.js'
import { warmAdminOfflineCache } from './lib/adminPortalOffline.js'
import OfflineBanner from './components/OfflineBanner.jsx'
import SystemOfflineBanner from './components/SystemOfflineBanner.jsx'
import AdminAuditBanner from './components/AdminAuditBanner.jsx'
import OfflineCacheIndicator from './components/OfflineCacheIndicator.jsx'
import SchoolYearBadge from './components/SchoolYearBadge.jsx'
import { resolveSubjectImageFromMap } from './lib/subjectImages.js'
import MonitoringRecords from './pages/MonitoringRecords.jsx'
import IncidentResponsePage from './pages/admin/IncidentResponsePage.jsx'
import BackupPage from './pages/BackupPage.jsx'
import ArchiveVault from './pages/ArchiveVault.jsx'
import AdminTurnoverPage from './pages/admin/AdminTurnoverPage.jsx'
import RegistrarAccountsPage from './pages/admin/RegistrarAccountsPage.jsx'
import AdminTermsPage from './pages/admin/AdminTermsPage.jsx'
import AuditStatisticsSection from './components/AuditStatisticsSection.jsx'
import AdminLatestAnnouncementsExpanded from './components/admin/AdminLatestAnnouncementsExpanded.jsx'
import AuthenticatedImage from './components/AuthenticatedImage.jsx'
import Header from './components/Header.jsx'
import PortalSidebarShell from './components/PortalSidebarShell.jsx'
import { useSidebarCollapsed, SIDEBAR_COLLAPSED_KEYS } from './hooks/useSidebarCollapsed.js'
import { dispatchAuditLogsRefresh, BACKUP_RESTORED_EVENT } from './lib/auditLogRefresh.js'
import { uploadsPathToApiUrl } from './lib/fileUrls.js'
import { facultyPhotoAuthImageUrl, facultyPhotoDisplaySrc } from './lib/facultyPhoto.js'
import { dedupeById } from './lib/dedupeById.js'
import { stripSecretsFromList } from './lib/stripLocalStorageSecrets.js'
import { NAV_ID_TO_PATH, navIdFromPath, pathForNavId } from './lib/adminNavRoutes.js'
import { homePathForRole, isNavAllowedForRole, normalizeRole } from './lib/roleAccess.js'

const SIDEBAR_GOLD = '#1e4fa3'
const SIDEBAR_GOLD_DARK = '#15397a'
const ACTION_BLUE = '#1e4fa3'
const ADMIN_AVATAR_STORAGE_KEY = 'lenlearn.adminAvatarDataUrl'
import { normalizeInstituteAdminDisplayName } from './lib/instituteAdminDisplay.js'
/** UI-only local preference (not roster data). */

const GRADE_LEVELS = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']

/** Map `GET /api/v1/sections` row into dashboard section shape. */
function mapPgSectionRow(row, existing = null) {
  const pgId = row?.id != null ? Number(row.id) : NaN
  const grade = String(row?.grade_level ?? row?.grade ?? '').trim()
  const name = String(row?.section_name ?? row?.name ?? '').trim()
  const postgresSectionId = Number.isFinite(pgId) && pgId > 0 ? pgId : undefined
  const id =
    String(existing?.id || '').trim() ||
    (postgresSectionId != null ? String(postgresSectionId) : crypto.randomUUID())
  return {
    id,
    postgresSectionId,
    grade: grade || String(existing?.grade || '').trim(),
    name: name || String(existing?.name || '').trim(),
    students: Number.isFinite(Number(existing?.students)) ? Number(existing.students) : 0,
  }
}

/** Hydrate dashboard sections from PostgreSQL API rows; preserve local ids and student counts. */
function mergePostgresSectionIdsIntoSections(currentSections, apiRows) {
  const current = Array.isArray(currentSections) ? currentSections : []
  const api = Array.isArray(apiRows) ? apiRows : []
  if (api.length === 0) return current

  const byPgId = new Map()
  const byNameGrade = new Map()
  for (const s of current) {
    const pg = Number(s?.postgresSectionId)
    if (Number.isFinite(pg) && pg > 0) byPgId.set(pg, s)
    const nameKey = `${String(s?.name || '').trim().toLowerCase()}|${String(s?.grade || '').trim()}`
    if (nameKey !== '|') byNameGrade.set(nameKey, s)
  }

  const merged = []
  const consumedLocalIds = new Set()

  for (const row of api) {
    const pgId = row?.id != null ? Number(row.id) : NaN
    const nameKey = `${String(row?.section_name || '').trim().toLowerCase()}|${String(row?.grade_level || '').trim()}`
    const existing =
      (Number.isFinite(pgId) && pgId > 0 ? byPgId.get(pgId) : null) || byNameGrade.get(nameKey) || null
    if (existing?.id) consumedLocalIds.add(existing.id)
    merged.push(mapPgSectionRow(row, existing))
  }

  for (const s of current) {
    if (consumedLocalIds.has(s.id)) continue
    const pg = Number(s?.postgresSectionId)
    const syncedInApi = Number.isFinite(pg) && pg > 0 && api.some((r) => Number(r?.id) === pg)
    if (!syncedInApi) merged.push(s)
  }

  return merged
}

/** Map a `GET /api/v1/students` row (snake_case + joined `section_name`) into the dashboard student shape. */
function mapPgStudentRow(row, sectionsList) {
  const pgSid = row.section_id != null ? Number(row.section_id) : NaN
  const sec =
    Number.isFinite(pgSid) && pgSid > 0 && Array.isArray(sectionsList)
      ? sectionsList.find((s) => Number(s.postgresSectionId) === pgSid)
      : null
  const firstName = String(row.first_name || '').trim()
  const middleName = String(row.middle_name || '').trim()
  const lastName = String(row.last_name || '').trim()
  const name =
    [firstName, middleName, lastName].filter(Boolean).join(' ').trim() || String(row.enrollment_no || '').trim()
  const dob = row.dob != null ? String(row.dob).slice(0, 10) : ''
  const contact = String(row.contact_no ?? row.contact_number ?? '').trim()
  const photo = String(row.photo_url ?? row.student_photo_url ?? '').trim()
  return {
    id: String(row.id),
    postgresStudentId: Number(row.id),
    firstName,
    middleName,
    lastName,
    name,
    enrollmentNo: String(row.enrollment_no || '').trim(),
    email: String(row.email || '').trim().toLowerCase(),
    studentContactNumber: contact,
    phone: contact,
    studentAddress: String(row.address || '').trim(),
    dateOfBirth: dob,
    parentContactNumber: String(row.parent_contact || '').trim(),
    parentEmail: String(row.parent_email || '').trim().toLowerCase(),
    grade: String(row.grade_level || '').trim(),
    semester: String(row.semester || '').trim(),
    sectionId: sec?.id || '',
    sectionName: String(row.section_name || sec?.name || '').trim(),
    rollNo: String(row.roll_no || '').trim(),
    loginId: String(row.login_id || '').trim(),
    password: '',
    appPassword: '',
    photoDataUrl: photo,
    photo_url: photo,
    authUserId: String(row.auth_user_id ?? row.authUserId ?? '').trim(),
  }
}

const GRADE_ORDER_FACULTY = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']

function facultySectionGrade(s) {
  return String(s?.grade_level ?? s?.grade ?? '').trim()
}

function deriveFacultyDirectoryGrade(advisorySections) {
  const grades = (advisorySections || []).map((s) => facultySectionGrade(s)).filter(Boolean)
  const unique = [...new Set(grades)]
  if (!unique.length) return ''
  unique.sort((a, b) => {
    const ia = GRADE_ORDER_FACULTY.indexOf(a)
    const ib = GRADE_ORDER_FACULTY.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
  return unique[0]
}

/** Map `GET /api/v1/faculty` row into dashboard faculty shape. */
function mapPgFacultyRow(row, sectionsList) {
  const pgSections = Array.isArray(row.advisorySections) ? row.advisorySections : []
  const advisorySections = pgSections.map((s) => {
    const pgId = Number(s.postgresSectionId ?? s.id)
    const dash =
      Number.isFinite(pgId) && pgId > 0 && Array.isArray(sectionsList)
        ? sectionsList.find((x) => Number(x.postgresSectionId) === pgId)
        : null
    const gradeLabel = facultySectionGrade(s)
    return {
      id: dash?.id || String(s.id),
      postgresSectionId: Number.isFinite(pgId) ? pgId : undefined,
      name: String(s.name || s.section_name || '').trim(),
      grade_level: gradeLabel,
      grade: gradeLabel,
    }
  })
  const gradeLevels = [
    ...new Set([
      String(row.grade_level || row.gradeLevel || row.grade || '').trim(),
      ...advisorySections.map((s) => facultySectionGrade(s)).filter(Boolean),
    ]),
  ].filter(Boolean)
  const firstName = String(row.firstName ?? row.first_name ?? '').trim()
  const middleName = String(row.middleName ?? row.middle_name ?? '').trim()
  const lastName = String(row.lastName ?? row.last_name ?? '').trim()
  const name =
    String(row.name || '').trim() ||
    [firstName, middleName, lastName].filter(Boolean).join(' ').trim()
  const facultyCodeId = String(
    row.facultyUsername ?? row.faculty_code_id ?? row.facultyCode ?? '',
  ).trim()
  const rawId = String(row.id ?? row.postgresFacultyId ?? '').trim()
  const numericPgId = /^\d+$/.test(rawId) ? Number(rawId) : undefined
  return {
    id: rawId,
    postgresFacultyId: numericPgId,
    photo_url: String(row.photo_url ?? row.photo_data_url ?? row.photoDataUrl ?? '').trim(),
    photoDataUrl: String(row.photo_url ?? row.photo_data_url ?? row.photoDataUrl ?? '').trim(),
    firstName,
    middleName,
    lastName,
    name,
    email: String(row.email || '').trim().toLowerCase(),
    contactNumber: String(row.contactNumber ?? row.contact_number ?? '').trim(),
    qualification: String(row.qualification || '').trim(),
    semester: String(row.semester ?? '').trim(),
    address: String(row.address ?? '').trim(),
    facultyUsername: facultyCodeId,
    facultyCode: facultyCodeId,
    grade_level: gradeLevels[0] || String(row.grade_level || row.grade || '').trim(),
    grade: gradeLevels[0] || String(row.grade_level || row.grade || '').trim(),
    gradeLevels,
    advisorySections,
    advisorySectionIds: advisorySections.map((s) => s.id),
    appPassword: '',
    password: '',
    authUserId: String(row.authUserId ?? row.auth_user_id ?? '').trim(),
  }
}

/** Map `GET /api/v1/subjects` row into dashboard subject shape. */
function mapPgSubjectRow(row, facultiesList) {
  const pgId = row.id != null ? Number(row.id) : NaN
  const facultyId = String(row.assignedFacultyId ?? row.faculty_id ?? '').trim()
  const fac = Array.isArray(facultiesList)
    ? facultiesList.find((f) => String(f.id) === facultyId)
    : null
  const gradeLabel = String(row.grade ?? row.grade_level ?? '').trim()
  const gradeNum = gradeLabel.replace(/[^0-9]/g, '')
  const q = String(row.semester ?? '').trim()
  const semCode = gradeNum && q ? `${gradeNum.padStart(2, '0')}_${q}` : ''
  const syllabusDataUrl = String(row.syllabusDataUrl ?? row.syllabus_pdf ?? '').trim()
  return {
    id: Number.isFinite(pgId) && pgId > 0 ? String(pgId) : String(row.id || ''),
    postgresSubjectId: Number.isFinite(pgId) && pgId > 0 ? pgId : undefined,
    subjectCode: String(row.subjectCode ?? row.subject_code ?? '').trim(),
    subjectName: String(row.subjectName ?? row.subject_name ?? '').trim(),
    grade: gradeLabel,
    semester: Number(row.semester) || row.semester,
    semCode,
    assignedFacultyId: facultyId,
    assignedFacultyName: String(row.assignedFacultyName ?? row.faculty_name ?? fac?.name ?? '').trim(),
    facultyCode: fac?.facultyUsername || fac?.facultyCode || '',
    facultyEmail: fac?.email || '',
    syllabusFileName: syllabusDataUrl ? 'syllabus.pdf' : '',
    syllabusFileType: syllabusDataUrl ? 'application/pdf' : '',
    syllabusDataUrl,
    curriculumGuideId: String(row.curriculumGuideId ?? row.curriculum_guide_id ?? '').trim(),
    curriculumGuideTitle: String(row.curriculumGuideTitle ?? row.curriculum_guide_title ?? '').trim(),
    curriculumGuideGrade: String(row.curriculumGuideGrade ?? row.curriculum_guide_grade ?? '').trim(),
    schedule: row.schedule || (Array.isArray(row.schedules) ? row.schedules[0] : null) || null,
    schedules: Array.isArray(row.schedules) ? row.schedules : row.schedule ? [row.schedule] : [],
    schedule_label: String(row.schedule_label ?? row.scheduleLabel ?? '').trim(),
    subjectPhoto: String(row.subjectPhoto ?? row.subject_photo ?? row.cover_image_url ?? '').trim(),
    subject_photo: String(row.subjectPhoto ?? row.subject_photo ?? row.cover_image_url ?? '').trim(),
  }
}

function buildSubjectApiBody(payload) {
  const grade = String(payload.grade || '').trim()
  const scheduleDays = Array.isArray(payload.scheduleDays)
    ? payload.scheduleDays
    : payload.scheduleDayOfWeek != null && payload.scheduleDayOfWeek !== ''
      ? [payload.scheduleDayOfWeek]
      : Array.isArray(payload.schedule?.days)
        ? payload.schedule.days
        : payload.schedule?.day_of_week != null
          ? [payload.schedule.day_of_week]
          : []
  const scheduleStart = String(payload.scheduleStartTime ?? payload.schedule?.start_time ?? '').trim()
  const scheduleEnd = String(payload.scheduleEndTime ?? payload.schedule?.end_time ?? '').trim()
  const scheduleRoom = String(payload.scheduleRoom ?? payload.schedule?.room ?? '').trim()
  return {
    subjectCode: String(payload.subjectCode || '').trim(),
    subjectName: String(payload.subjectName || '').trim(),
    grade,
    grade_level: grade,
    semester: payload.semester,
    assignedFacultyId: String(payload.assignedFacultyId || '').trim(),
    faculty_id: String(payload.assignedFacultyId || '').trim(),
    curriculumGuideId: String(payload.curriculumGuideId || '').trim(),
    curriculum_guide_id: String(payload.curriculumGuideId || '').trim(),
    scheduleDays,
    scheduleStartTime: scheduleStart,
    scheduleEndTime: scheduleEnd,
    scheduleRoom,
  }
}

function subjectApiErrorMessage(data, fallback) {
  if (data?.error === 'SCHEDULE_CONFLICT') {
    const msg = String(data?.message || '').trim()
    if (msg) return msg
    const parts = []
    for (const c of data?.faculty_conflicts || []) {
      parts.push(
        `Faculty conflict: ${c.subject_code || c.subject_name || 'subject'} on ${c.day_label || c.day_of_week} ${c.time || ''}`.trim(),
      )
    }
    for (const c of data?.student_conflicts || []) {
      parts.push(
        `Student timetable conflict: ${c.subject_code || c.subject_name || 'subject'} on ${c.day_label || c.day_of_week} ${c.time || ''}`.trim(),
      )
    }
    if (parts.length) return parts.join(' ')
  }
  return String(data?.message || data?.error || fallback)
}

function formatAnnouncementPosted(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

/** Map `GET /api/v1/announcements` row into dashboard update shape. */
function mapPgAnnouncementRow(row) {
  const pgId = row.id != null ? Number(row.id) : NaN
  const created = row.created_at ?? row.createdAt ?? row.postedAt
  const postedAt =
    created != null
      ? typeof created === 'string'
        ? created
        : new Date(created).toISOString()
      : ''
  const imageDataUrl = String(row.imageDataUrl ?? row.announcement_image ?? '').trim()
  const uploadedBy =
    String(row.uploadedBy ?? row.uploaded_by ?? '').trim() || 'Institute'
  return {
    id: Number.isFinite(pgId) && pgId > 0 ? String(pgId) : String(row.id || ''),
    postgresAnnouncementId: Number.isFinite(pgId) && pgId > 0 ? pgId : undefined,
    title: String(row.title ?? '').trim(),
    updateType: String(row.updateType ?? row.type ?? '').trim(),
    description: String(row.description ?? row.message ?? '').trim(),
    imageDataUrl,
    imageName: String(row.imageName ?? row.image_name ?? '').trim(),
    imagePath: String(row.imagePath ?? row.image_path ?? '').trim(),
    postedAt,
    postedAtLabel: formatAnnouncementPosted(postedAt),
    uploadedBy,
  }
}

function buildAnnouncementApiBody(payload) {
  const image = String(payload.imageDataUrl ?? '').trim()
  const title = String(payload.title || '').trim()
  const type = String(payload.updateType || payload.type || '').trim()
  const message = String(payload.description || payload.message || '').trim()
  const imageName = String(payload.imageName ?? payload.image_name ?? '').trim()
  return {
    title,
    type,
    updateType: type,
    message,
    description: message,
    announcement_image: image || null,
    imageDataUrl: image || null,
    image_name: imageName || null,
    imageName: imageName || null,
  }
}

function announcementApiErrorMessage(data, fallback) {
  return String(data?.error || data?.message || fallback)
}

async function resolveFacultySectionIds(payload, sectionsList) {
  const fromPayload = Array.isArray(payload?.sectionIds)
    ? payload.sectionIds
        .map((id) => Number(id))
        .filter((n) => Number.isFinite(n) && n > 0)
    : []
  if (fromPayload.length) return [...new Set(fromPayload)]
  return resolvePostgresSectionIdsForFaculty(payload?.advisorySections, sectionsList)
}

async function resolvePostgresSectionIdsForFaculty(advisorySections, sectionsList) {
  const out = []
  for (const adv of advisorySections || []) {
    const pgFromAdv = Number(adv?.postgresSectionId)
    if (Number.isFinite(pgFromAdv) && pgFromAdv > 0) {
      out.push(pgFromAdv)
      continue
    }
    const dashId = String(adv?.id || '').trim()
    const sec = sectionsList.find((s) => s.id === dashId)
    let pid = sec?.postgresSectionId
    if (pid == null && dashId && /^\d+$/.test(dashId)) pid = Number(dashId)
    if (pid == null && sec) pid = await fetchPostgresSectionIdForSection(sec)
    if (Number.isFinite(Number(pid)) && Number(pid) > 0) out.push(Number(pid))
  }
  return [...new Set(out)]
}

const MAX_FACULTY_PHOTO_CHARS = 1_500_000

function buildFacultyApiBody(payload, sectionIds, authUserId, { forUpdate = false, persistAuthUserId = false } = {}) {
  const advisorySections = Array.isArray(payload.advisorySections) ? payload.advisorySections : []
  const rawPhoto = String(payload.photo_url ?? payload.photoDataUrl ?? '').trim()
  const photo_url =
    rawPhoto && rawPhoto.length <= MAX_FACULTY_PHOTO_CHARS ? rawPhoto : null
  const directoryGrade = String(
    payload.grade_level ?? payload.gradeLevel ?? payload.grade ?? '',
  ).trim()
  const firstName = payload.firstName
  const middleName = payload.middleName || null
  const lastName = payload.lastName
  const email = payload.email
  const contactNumber = payload.contactNumber
  const qualification = payload.qualification
  const facultyCodeId = payload.facultyUsername || payload.facultyCode
  return {
    photo_url,
    photoDataUrl: photo_url,
    grade_level: directoryGrade || null,
    gradeLevel: directoryGrade || null,
    firstName,
    first_name: firstName,
    middleName,
    middle_name: middleName,
    lastName,
    last_name: lastName,
    email,
    contactNumber,
    contact_number: contactNumber,
    qualification,
    semester: payload.semester ?? null,
    address: payload.address ?? null,
    facultyCodeId,
    faculty_code_id: facultyCodeId,
    facultyUsername: facultyCodeId,
    facultyCode: facultyCodeId,
    password: payload.password,
    ...(payload.appPassword
      ? { appPasswordGmail: payload.appPassword, app_password_gmail: payload.appPassword }
      : {}),
    sectionIds,
    section_ids: sectionIds,
    advisorySections,
    ...(payload.photoChanged ? { photoChanged: true } : {}),
    ...(forUpdate
      ? persistAuthUserId && authUserId
        ? { authUserId: authUserId, auth_user_id: authUserId }
        : {}
      : {
          authUserId: authUserId || undefined,
          auth_user_id: authUserId || undefined,
        }),
  }
}

/** JSON body or multipart FormData when a new photo file is included. */
function buildFacultySaveRequest(
  payload,
  sectionIds,
  authUserId,
  { forUpdate = false, photoFile = null, persistAuthUserId = false } = {},
) {
  const jsonBody = buildFacultyApiBody(payload, sectionIds, authUserId, { forUpdate, persistAuthUserId })
  if (forUpdate && !(photoFile instanceof File)) {
    delete jsonBody.photo_url
    delete jsonBody.photoDataUrl
  }
  if (!(photoFile instanceof File)) {
    return { useFormData: false, body: jsonBody }
  }
  const fd = new FormData()
  fd.append('photo', photoFile)
  for (const [key, val] of Object.entries(jsonBody)) {
    if (key === 'photo_url' || key === 'photoDataUrl') continue
    if (val === undefined || val === null) continue
    if (key === 'sectionIds' || key === 'section_ids' || key === 'advisorySections') {
      fd.append(key, JSON.stringify(val))
      continue
    }
    if (typeof val === 'object') {
      fd.append(key, JSON.stringify(val))
    } else {
      fd.append(key, String(val))
    }
  }
  return { useFormData: true, body: fd }
}

async function fetchPostgresSectionIdForSection(section) {
  const existing = section?.postgresSectionId
  if (existing != null && Number.isFinite(Number(existing)) && Number(existing) > 0) {
    return Number(existing)
  }
  try {
    const res = await fetch(apiUrl('/api/v1/sections'), { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return null
    const rows = Array.isArray(data.sections) ? data.sections : []
    const name = String(section?.name || '').trim().toLowerCase()
    const grade = String(section?.grade || '').trim()
    const m = rows.find(
      (r) =>
        String(r.section_name || '').trim().toLowerCase() === name && String(r.grade_level || '').trim() === grade,
    )
    return m?.id != null && Number.isFinite(Number(m.id)) ? Number(m.id) : null
  } catch {
    return null
  }
}

/** Admin/auth `fetch` calls must not hang forever if `dev:auth` is down or the wrong port is proxied. */
const AUTH_ADMIN_FETCH_MS = 25_000
const STATE_API_FETCH_MS = Number(import.meta.env.VITE_STATE_API_FETCH_MS || 30_000)

async function fetchStateApi(input, init = {}) {
  const ms = Number.isFinite(STATE_API_FETCH_MS) && STATE_API_FETCH_MS > 0 ? STATE_API_FETCH_MS : 30_000
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(input, { ...init, signal: ctrl.signal })
  } catch (e) {
    if (e?.name === 'AbortError') {
      return new Response(
        JSON.stringify({
          message: `Institute API did not respond within ${Math.round(ms / 1000)}s. Check your connection and try again.`,
        }),
        { status: 408, headers: { 'Content-Type': 'application/json' } },
      )
    }
    throw e
  } finally {
    clearTimeout(t)
  }
}

async function fetchAuthAdmin(input, init = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), AUTH_ADMIN_FETCH_MS)
  try {
    return await fetch(input, { ...init, signal: ctrl.signal })
  } catch (e) {
    if (e?.name === 'AbortError') {
      return new Response(
        JSON.stringify({
          message:
            'Auth server did not respond in time. Run `npm run dev` or `npm run dev:auth`, and free port 3001 if it is already in use.',
        }),
        { status: 408, headers: { 'Content-Type': 'application/json' } },
      )
    }
    throw e
  } finally {
    clearTimeout(t)
  }
}

function LayoutGridIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function BookOpenIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}

function LayersIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="m12.83 2.18 8 3.12a1 1 0 0 1 0 1.84l-8 3.12a2 2 0 0 1-1.66 0l-8-3.12a1 1 0 0 1 0-1.84l8-3.12a2 2 0 0 1 1.66 0z" />
      <path d="M2 12.05 12 16l10-3.95" />
      <path d="M2 17.05 12 21l10-3.95" />
    </svg>
  )
}

function UsersIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function UserSingleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function UserTieIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
      <path d="M12 11v3M10 14h4" strokeLinecap="round" />
    </svg>
  )
}

function FileTextIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  )
}

function BellIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function SitemapIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="3" width="6" height="6" rx="1" />
      <rect x="9" y="15" width="6" height="6" rx="1" />
      <path d="M6 9v3M18 9v3M12 12v3" />
    </svg>
  )
}

function GradCapIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
    </svg>
  )
}

function ActivityIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 19V5" />
      <path d="M20 19V5" />
      <path d="M4 12h4l2-5 4 10 2-5h4" />
    </svg>
  )
}

function ShieldAlertIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" />
      <path d="M12 8v5" strokeLinecap="round" />
      <path d="M12 16.5h.01" strokeLinecap="round" />
    </svg>
  )
}

function ArchiveIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  )
}

function DatabaseExportIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
      <path d="M12 8v8M8 16l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGridIcon, to: NAV_ID_TO_PATH.dashboard },
  { id: 'curriculum', label: 'Curriculum', icon: BookOpenIcon, to: NAV_ID_TO_PATH.curriculum },
  { id: 'section', label: 'Section', icon: LayersIcon, to: NAV_ID_TO_PATH.section },
  { id: 'students', label: 'Students', icon: UsersIcon, to: NAV_ID_TO_PATH.students },
  { id: 'faculties', label: 'Faculties', icon: UserTieIcon, to: NAV_ID_TO_PATH.faculties },
  { id: 'subjects', label: 'Subjects', icon: FileTextIcon, to: NAV_ID_TO_PATH.subjects },
  { id: 'updates', label: 'Announcements', icon: BellIcon, to: NAV_ID_TO_PATH.updates },
  { id: 'monitoring', label: 'Audit Logs', icon: ActivityIcon, to: NAV_ID_TO_PATH.monitoring },
  { id: 'incidents', label: 'Incident Response', icon: ShieldAlertIcon, to: NAV_ID_TO_PATH.incidents },
  { id: 'turnover', label: 'Admin Transfer', icon: UserTieIcon, to: NAV_ID_TO_PATH.turnover },
  { id: 'registrars', label: 'Registrar Accounts', icon: UserTieIcon, to: NAV_ID_TO_PATH.registrars },
  { id: 'backup', label: 'Data Backup', icon: DatabaseExportIcon, to: NAV_ID_TO_PATH.backup },
  { id: 'archive', label: 'Archive Vault', icon: ArchiveIcon, to: NAV_ID_TO_PATH.archive },
]

// Faculty stats are computed from saved faculty data.

function Avatar({ seed, size = 40 }) {
  const hue = seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <div
      className="shrink-0 rounded-full ring-2 ring-white shadow-sm"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue},55%,45%), hsl(${(hue + 40) % 360},50%,35%))`,
      }}
      aria-hidden
    />
  )
}

function normalizeAdminDisplayName(name, email) {
  return normalizeInstituteAdminDisplayName(name, email)
}

function DashboardFacultyThumb({ faculty }) {
  const src = facultyPhotoDisplaySrc(faculty?.photo_url || faculty?.photoDataUrl || '')
  const fallback = <Avatar seed={String(faculty?.email || faculty?.name || 'f')} size={44} />
  if (!src) return fallback
  return (
    <AuthenticatedImage
      src={src}
      alt={faculty?.name || ''}
      className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm"
      fallback={fallback}
    />
  )
}

export default function InstituteDashboard({ onLogout, schoolName = 'Glendale School, Inc.' }) {
  const toast = useNotify()
  const { data: adminSession } = authClient.useSession()
  const portalRole = normalizeRole(adminSession?.user?.role)
  const isRegistrar = portalRole === 'registrar'
  const isAdmin = portalRole === 'admin'
  const visibleNav = useMemo(
    () => NAV.filter((item) => isNavAllowedForRole(item.id, portalRole)),
    [portalRole],
  )
  const portalLabel = isRegistrar ? 'Registrar' : 'School Admin'
  const adminDisplayName = useMemo(() => {
    const u = adminSession?.user
    return normalizeAdminDisplayName(u?.name, u?.email)
  }, [adminSession])
  const location = useLocation()
  const navigate = useNavigate()
  const onTermsPage = location.pathname.replace(/\/+$/, '') === '/admin/terms'
  const { collapsed: sidebarCollapsed, toggleCollapsed: toggleSidebarCollapsed } = useSidebarCollapsed(
    SIDEBAR_COLLAPSED_KEYS.admin,
  )
  const fileInputRef = useRef(null)
  const curriculumRef = useRef(null)
  const [adminAvatarDataUrl, setAdminAvatarDataUrl] = useState('')
  const profileAvatarSrc = isRegistrar
    ? String(adminSession?.user?.image || '').trim()
    : adminAvatarDataUrl
  const profileAvatarSeed = isRegistrar
    ? String(adminSession?.user?.email || adminDisplayName || 'registrar')
    : 'admin'
  const [activeNav, setActiveNav] = useState(
    () => navIdFromPath(typeof window !== 'undefined' ? window.location.pathname : '') || 'dashboard',
  )
  const [sectionPage, setSectionPage] = useState('manage')
  const [activeSection, setActiveSection] = useState(null)
  const [students, setStudents] = useState([])
  const [studentNavContext, setStudentNavContext] = useState({ grade: '', sectionId: '' })
  const [sections, setSections] = useState([])
  const sectionsRef = useRef([])
  const [faculties, setFaculties] = useState([])
  const [subjects, setSubjects] = useState([])
  const [updates, setUpdates] = useState([])
  const [sectionEditTarget, setSectionEditTarget] = useState(null)
  const [sectionEditName, setSectionEditName] = useState('')
  const [sectionDeleteTarget, setSectionDeleteTarget] = useState(null)
  const [sectionForm, setSectionForm] = useState({ grade: '', name: '' })
  const [sectionError, setSectionError] = useState('')
  const [activeSectionGrade, setActiveSectionGrade] = useState(GRADE_LEVELS[0])
  const [curriculums, setCurriculums] = useState([])
  /** Per-list offline cache status: { subjects|sections|students|faculties|curriculum: { fromCache, cachedAt } } */
  const [cacheMeta, setCacheMeta] = useState({})

  const [persistenceMode, setPersistenceMode] = useState('loading')
  const [stateBootstrapDone, setStateBootstrapDone] = useState(false)
  const postgresStudentsBootstrapped = useRef(false)
  const postgresSectionsBootstrapped = useRef(false)
  const postgresCurriculumBootstrapped = useRef(false)
  const postgresFacultyBootstrapped = useRef(false)
  const postgresSubjectsBootstrapped = useRef(false)
  const postgresAnnouncementsBootstrapped = useRef(false)
  const facultiesRef = useRef([])

  useEffect(() => {
    sectionsRef.current = sections
  }, [sections])

  useEffect(() => {
    facultiesRef.current = faculties
  }, [faculties])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(getLmsStateEndpointUrl(), { credentials: 'include' })
        if (!res.ok) throw new Error(`state ${res.status}`)
        const payload = await res.json()
        if (cancelled) return
        if (payload?.state) {
          const s = payload.state
          setAdminAvatarDataUrl(String(s.adminAvatarDataUrl || ''))
          setCurriculums([])
          setSections([])
          setStudents(Array.isArray(s.students) ? s.students : [])
          // Faculty roster is loaded from PostgreSQL `faculty` via GET /api/v1/faculty (not app_state blob).
          setFaculties([])
          setSubjects([])
          setUpdates([])
        }
        setPersistenceMode('server')
      } catch {
        try {
          const saved = localStorage.getItem(ADMIN_AVATAR_STORAGE_KEY) || ''
          if (saved) setAdminAvatarDataUrl(saved)
        } catch {}
        setCurriculums([])
        setSections([])
        setStudents([])
        setFaculties([])
        setSubjects([])
        setUpdates([])
        setPersistenceMode('server')
      } finally {
        if (!cancelled) setStateBootstrapDone(true)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const persistAdminAvatar = useCallback(
    async (dataUrl) => {
      if (persistenceMode !== 'server') return

      try {
        const res = await fetch(getLmsStateEndpointUrl(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ state: { adminAvatarDataUrl: dataUrl } }),
        })
        if (!res.ok) {
          let msg = String(res.status)
          try {
            const errBody = await res.json()
            if (errBody?.message) msg = `${res.status}: ${errBody.message}`
            else if (errBody?.error) msg = `${res.status}: ${errBody.error}`
          } catch {
            /* ignore */
          }
          toast.error(`Could not save admin profile photo (${msg}).`, {
            title: 'Save failed',
            durationMs: 12000,
          })
        }
      } catch {
        toast.error('Could not reach the server to save admin profile photo.', {
          title: 'Save failed',
          durationMs: 12000,
        })
      }
    },
    [persistenceMode, toast],
  )

  useEffect(() => {
    try {
      localStorage.setItem(ADMIN_AVATAR_STORAGE_KEY, adminAvatarDataUrl || '')
    } catch {}
  }, [adminAvatarDataUrl])

  const sectionsForGrade = useMemo(
    () => sections.filter((section) => section.grade === activeSectionGrade),
    [sections, activeSectionGrade],
  )

  const stats = useMemo(() => {
    return [
      { label: 'TOTAL STUDENTS', value: students.length, Icon: UsersIcon },
      { label: 'TOTAL FACULTY', value: faculties.length, Icon: UserSingleIcon },
      { label: 'TOTAL GRADE LEVEL', value: GRADE_LEVELS.length, Icon: SitemapIcon },
      { label: 'TOTAL SECTIONS', value: sections.length, Icon: GradCapIcon },
    ]
  }, [students.length, faculties.length, sections.length])

  const recentFaculties = useMemo(() => dedupeById(faculties).slice(0, 4), [faculties])
  const recentAnnouncements = useMemo(() => updates.slice(0, 5), [updates])

  function openFacultiesAllPage() {
    navigateToNav('faculties')
  }

  function openSubjectsAllPage() {
    navigateToNav('subjects')
  }

  function openUpdatesAllPage() {
    navigateToNav('updates')
  }

  const applyNavSideEffects = useCallback((id) => {
    if (id === 'curriculum') curriculumRef.current?.openManagePage()
    if (id === 'section') {
      setSectionPage('manage')
      setActiveSection(null)
    }
    if (id === 'students') {
      setStudentNavContext({ grade: '', sectionId: '' })
    }
  }, [])

  const navigateToNav = useCallback(
    (id, { replace = false, updateUrl = true } = {}) => {
      const next = String(id || 'dashboard')
      setActiveNav(next)
      applyNavSideEffects(next)
      if (updateUrl) {
        const path = pathForNavId(next)
        if (location.pathname !== path) {
          navigate(path, { replace })
        }
      }
    },
    [applyNavSideEffects, location.pathname, navigate],
  )

  useEffect(() => {
    const id = navIdFromPath(location.pathname)
    if (!id || isNavAllowedForRole(id, portalRole)) return
    const fallback = isRegistrar ? homePathForRole('registrar') : homePathForRole('admin')
    navigate(fallback, { replace: true })
  }, [location.pathname, navigate, portalRole, isRegistrar])

  useEffect(() => {
    const id = navIdFromPath(location.pathname)
    if (!id || id === activeNav) return
    if (!isNavAllowedForRole(id, portalRole)) return
    setActiveNav(id)
    applyNavSideEffects(id)
  }, [location.pathname, activeNav, applyNavSideEffects, portalRole])

  function isAdminCreateUserDuplicateError(status, json) {
    if (status !== 400) return false
    const code = String(json?.code || json?.error?.code || '')
    if (code.includes('USER_ALREADY_EXISTS')) return true
    const msg = String(json?.message || json?.error?.message || '')
    return /user already exists/i.test(msg) && /email/i.test(msg)
  }

  /** Resolves Better Auth user id for an email (PostgreSQL lookup first; then admin list-users fallbacks). */
  async function findAuthUserIdByEmail(email) {
    const e = String(email || '').trim().toLowerCase()
    if (!e) return ''
    try {
      const postRes = await fetchAuthAdmin(apiUrl('/api/lms/admin/auth-user-id-by-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: e }),
      })
      const postJson = await postRes.json().catch(() => ({}))
      if (postRes.ok && postJson?.userId) return String(postJson.userId)
    } catch {
      /* fall through */
    }

    const tryList = async (params) => {
      const res = await fetchAuthAdmin(apiUrl(`/api/auth/admin/list-users?${params}`), { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return ''
      const users = Array.isArray(json?.users) ? json.users : []
      const u = users.find((row) => String(row?.email || '').trim().toLowerCase() === e)
      return u?.id ? String(u.id) : ''
    }

    let id = await tryList(
      new URLSearchParams({
        filterField: 'email',
        filterOperator: 'eq',
        filterValue: e,
        limit: '20',
      }),
    )
    if (id) return id

    return tryList(
      new URLSearchParams({
        searchField: 'email',
        searchOperator: 'contains',
        searchValue: e,
        limit: '50',
      }),
    )
  }

  /** Resolves Better Auth user id for a login id / faculty code (username). */
  async function findAuthUserIdByUsername(loginId) {
    const u = String(loginId || '').trim().toLowerCase()
    if (!u) return ''
    try {
      const postRes = await fetchAuthAdmin(apiUrl('/api/lms/admin/auth-user-id-by-username'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: u }),
      })
      const postJson = await postRes.json().catch(() => ({}))
      if (postRes.ok && postJson?.userId) return String(postJson.userId)
    } catch {
      /* fall through */
    }

    const tryList = async (params) => {
      const res = await fetchAuthAdmin(apiUrl(`/api/auth/admin/list-users?${params}`), { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return ''
      const users = Array.isArray(json?.users) ? json.users : []
      const row = users.find((r) => String(r?.username || '').trim().toLowerCase() === u)
      return row?.id ? String(row.id) : ''
    }

    let id = await tryList(
      new URLSearchParams({
        filterField: 'username',
        filterOperator: 'eq',
        filterValue: u,
        limit: '20',
      }),
    )
    if (id) return id

    return tryList(
      new URLSearchParams({
        searchField: 'username',
        searchOperator: 'contains',
        searchValue: u,
        limit: '50',
      }),
    )
  }

  async function resolvePortalAuthUserId({ existingAuthUserId, loginId, email }) {
    const username = String(loginId || '').trim().toLowerCase()
    let authUserId = String(existingAuthUserId || '').trim()
    const byUsername = username ? await findAuthUserIdByUsername(username) : ''
    if (byUsername) {
      if (!authUserId) authUserId = byUsername
      else if (authUserId !== byUsername) authUserId = byUsername
    }
    if (!authUserId) {
      const byEmail = await findAuthUserIdByEmail(email)
      if (byEmail) authUserId = byEmail
    }
    return authUserId
  }

  async function sendPasswordResetEmail(email) {
    const trimmed = String(email || '').trim().toLowerCase()
    if (!trimmed) return { error: 'No email on record for this account.' }
    try {
      const res = await fetchAuthAdmin(apiUrl('/api/v1/admin/send-password-reset'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = String(json?.message || json?.error || 'Could not send reset email.').trim()
        return { error: message }
      }
      return { ok: true, maskedEmail: json?.maskedEmail || trimmed }
    } catch (e) {
      return { error: e?.message || 'Could not send reset email.' }
    }
  }

  async function ensureFacultyAuthUser({
    email,
    name,
    facultyUsername,
    password,
    existingAuthUserId,
    previousFacultyUsername = '',
    facultyQualification = '',
    facultyContactNumber = '',
    photoDataUrl = '',
    setCredentialPassword = true,
  }) {
    const username = String(facultyUsername || '').trim().toLowerCase()
    if (!username) return { error: 'Faculty Code ID is required.' }
    const pw = String(password || '').trim()
    const prevUsername = String(previousFacultyUsername || facultyUsername || '').trim().toLowerCase()
    const usernameChanged = username !== prevUsername

    const fq = String(facultyQualification || '').trim()
    const fc = String(facultyContactNumber || '').trim()
    const rawImg = facultyPhotoAuthImageUrl(String(photoDataUrl ?? '').trim())
    const image = rawImg

    const authUserId = await resolvePortalAuthUserId({
      existingAuthUserId,
      loginId: username,
      email,
    })

    if (!authUserId) {
      if (!pw) return { error: 'Faculty password is required to create a new login.' }
      const res = await fetchAuthAdmin(apiUrl('/api/auth/admin/create-user'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          password: pw,
          name,
          role: 'teacher',
          data: {
            username,
            displayUsername: username,
            twoFactorEnabled: 1,
            emailVerified: 1,
            facultyQualification: fq,
            facultyContactNumber: fc,
            ...(image ? { image } : {}),
          },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (isAdminCreateUserDuplicateError(res.status, json)) {
          const existingId =
            (await findAuthUserIdByUsername(username)) || (await findAuthUserIdByEmail(email))
          if (existingId) {
            return ensureFacultyAuthUser({
              email,
              name,
              facultyUsername,
              password,
              existingAuthUserId: existingId,
              previousFacultyUsername,
              facultyQualification,
              facultyContactNumber,
              photoDataUrl,
            })
          }
        }
        return { error: json?.message || json?.error?.message || 'Could not create faculty auth user.' }
      }
      return { ok: true, authUserId: json?.user?.id || '' }
    }

    const updateData = {
      name,
      twoFactorEnabled: 1,
      facultyQualification: fq,
      facultyContactNumber: fc,
      ...(image ? { image } : {}),
    }
    if (usernameChanged) {
      updateData.username = username
      updateData.displayUsername = username
    }

    const upRes = await fetchAuthAdmin(apiUrl('/api/auth/admin/update-user'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        userId: authUserId,
        data: updateData,
      }),
    })
    const upJson = await upRes.json().catch(() => ({}))
    if (!upRes.ok) return { error: upJson?.message || upJson?.error?.message || 'Could not update faculty auth user.' }

    if (setCredentialPassword && pw) {
      const pwRes = await fetchAuthAdmin(apiUrl('/api/auth/admin/set-user-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: authUserId, newPassword: pw }),
      })
      const pwJson = await pwRes.json().catch(() => ({}))
      if (!pwRes.ok) return { error: pwJson?.message || pwJson?.error?.message || 'Could not set faculty password.' }
    }

    return { ok: true, authUserId }
  }

  async function ensureStudentAuthUser({
    email,
    name,
    loginId,
    password,
    existingAuthUserId,
    previousLoginId = '',
    setCredentialPassword = true,
  }) {
    const username = String(loginId || '').trim().toLowerCase()
    if (!username) return { error: 'Student Login ID is required.' }
    const pw = String(password || '').trim()
    const prevUsername = String(previousLoginId || loginId || '').trim().toLowerCase()
    const usernameChanged = username !== prevUsername

    const authUserId = await resolvePortalAuthUserId({
      existingAuthUserId,
      loginId: username,
      email,
    })

    if (!authUserId) {
      if (!pw) return { error: 'Student password is required to create a new login.' }
      const res = await fetchAuthAdmin(apiUrl('/api/auth/admin/create-user'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          password: pw,
          name,
          role: 'student',
          data: {
            username,
            displayUsername: username,
            twoFactorEnabled: 1,
            emailVerified: 1,
          },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (isAdminCreateUserDuplicateError(res.status, json)) {
          const existingId =
            (await findAuthUserIdByUsername(username)) || (await findAuthUserIdByEmail(email))
          if (existingId) {
            return ensureStudentAuthUser({
              email,
              name,
              loginId,
              password,
              existingAuthUserId: existingId,
              previousLoginId,
            })
          }
        }
        return { error: json?.message || json?.error?.message || 'Could not create student auth user.' }
      }
      return { ok: true, authUserId: json?.user?.id || '' }
    }

    const updateData = {
      name: String(name || '').trim() || email,
      email: String(email || '').trim().toLowerCase(),
      twoFactorEnabled: 1,
    }
    if (usernameChanged) {
      updateData.username = username
      updateData.displayUsername = username
    }

    const upRes = await fetchAuthAdmin(apiUrl('/api/auth/admin/update-user'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        userId: authUserId,
        data: updateData,
      }),
    })
    const upJson = await upRes.json().catch(() => ({}))
    if (!upRes.ok) return { error: upJson?.message || upJson?.error?.message || 'Could not update student auth user.' }

    if (setCredentialPassword && pw) {
      const pwRes = await fetchAuthAdmin(apiUrl('/api/auth/admin/set-user-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: authUserId, newPassword: pw }),
      })
      const pwJson = await pwRes.json().catch(() => ({}))
      if (!pwRes.ok) return { error: pwJson?.message || pwJson?.error?.message || 'Could not set student password.' }
    }

    return { ok: true, authUserId }
  }

  async function addFaculty(payload) {
    const email = String(payload.email || '').trim().toLowerCase()
    const facultyCodeId = String(payload.facultyUsername || payload.facultyCode || '').trim()
    const password = String(payload.password || '').trim()
    if (!email || !facultyCodeId || !password) return { error: 'Please complete all required fields.' }

    const normalized = facultyCodeId.toLowerCase()
    const dupId = faculties.some((f) => {
      const u = String(f.facultyUsername || f.username || '').trim().toLowerCase()
      const c = String(f.facultyCode || '').trim().toLowerCase()
      return (u && u === normalized) || (c && c === normalized)
    })
    if (dupId) return { error: 'Faculty Code ID already exists.' }

    const dupEmail = faculties.some((f) => String(f.email || '').trim().toLowerCase() === email)
    if (dupEmail) return { error: 'Email already exists.' }

    const photoFile = payload.photoFile instanceof File ? payload.photoFile : null

    const authSync = await ensureFacultyAuthUser({
      email,
      name: String(payload.name || '').trim() || 'Faculty',
      facultyUsername: facultyCodeId,
      password,
      existingAuthUserId: '',
      facultyQualification: payload.qualification,
      facultyContactNumber: payload.contactNumber,
      photoDataUrl: '',
    })
    if (authSync?.error) {
      toast.error(authSync.error, { title: 'Faculty login error' })
      return { error: authSync.error }
    }

    if (persistenceMode === 'server') {
      const sectionIds = await resolveFacultySectionIds(payload, sections)
      if (!sectionIds.length) {
        return { error: 'Could not resolve advisory sections. Refresh sections and try again.' }
      }
      try {
        const saveReq = buildFacultySaveRequest(
          { ...payload, email, password },
          sectionIds,
          authSync.authUserId,
          { photoFile },
        )
        const res = await fetchStateApi(apiUrl('/api/v1/faculty'), {
          method: 'POST',
          credentials: 'include',
          ...(saveReq.useFormData
            ? { body: saveReq.body }
            : {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(saveReq.body),
              }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg = String(
            data?.error ||
              data?.message ||
              (data?.success === false ? data?.error : '') ||
              `Save failed (${res.status}).`,
          )
          toast.error(msg, { title: 'Faculty not saved' })
          return { error: msg }
        }
        if (data?.faculty) {
          upsertFacultyInState(data.faculty, sectionsRef.current)
        }
        if (photoFile && data?.faculty) {
          const savedPath = String(data.faculty.photo_url ?? data.faculty.photoDataUrl ?? '').trim()
          if (savedPath) {
            const imgSync = await ensureFacultyAuthUser({
              email,
              name: String(payload.name || '').trim() || 'Faculty',
              facultyUsername: facultyCodeId,
              password,
              existingAuthUserId: authSync.authUserId,
              previousFacultyUsername: facultyCodeId,
              facultyQualification: payload.qualification,
              facultyContactNumber: payload.contactNumber,
              photoDataUrl: savedPath,
              setCredentialPassword: false,
            })
            if (imgSync?.error) {
              toast.error(imgSync.error, { title: 'Faculty photo sync' })
            }
          }
        }
        const refreshed = await refreshFacultiesFromPostgres()
        if (!refreshed.ok && !data?.faculty) {
          return {
            error: refreshed.error || 'Faculty saved but the list could not be refreshed. Reload the page.',
          }
        }
        return { ok: true, id: data?.id, faculty: data?.faculty }
      } catch (err) {
        const msg = String(err?.message || err || 'Network error saving faculty.')
        toast.error(msg, { title: 'Faculty not saved' })
        return { error: msg }
      }
    }

    const next = [
      {
        id: crypto.randomUUID(),
        ...payload,
        email,
        facultyCode: facultyCodeId,
        facultyUsername: facultyCodeId,
        password,
        authUserId: authSync.authUserId,
      },
      ...faculties,
    ]
    setFaculties(dedupeById(next))
    toast.created('Faculty added to the dashboard.', { durationMs: 4500 })
    return { ok: true }
  }

  async function updateFaculty(facultyId, patch) {
    const id = String(facultyId || '').trim()
    const current = faculties.find((f) => f.id === id)
    if (!current) return { error: 'Faculty not found.' }

    const email = String(patch.email || current.email || '').trim().toLowerCase()
    const facultyCodeId = String(
      patch.facultyUsername || patch.facultyCode || current.facultyUsername || current.username || current.facultyCode || '',
    ).trim()
    const normalizeAppPw = (v) => String(v || '').replace(/\s/g, '').trim()
    const trimmedPatchPw = typeof patch.password === 'string' ? String(patch.password).trim() : ''
    const currentPw = String(current.password || '').trim()
    const passwordInPatch = trimmedPatchPw !== '' && trimmedPatchPw !== currentPw
    const password = passwordInPatch ? trimmedPatchPw : currentPw

    const trimmedPatchApp =
      typeof patch.appPassword === 'string' ? normalizeAppPw(patch.appPassword) : ''
    const currentAppNorm = normalizeAppPw(current.appPassword)
    const appPasswordInPatch = trimmedPatchApp !== '' && trimmedPatchApp !== currentAppNorm
    const appPassword = appPasswordInPatch ? trimmedPatchApp : String(current.appPassword || '').trim()

    const dupEmail = faculties.some((f) => f.id !== id && String(f.email || '').trim().toLowerCase() === email)
    if (dupEmail) return { error: 'Email already exists.' }

    const normalized = facultyCodeId.toLowerCase()
    const dupId = faculties.some((f) => {
      if (f.id === id) return false
      const u = String(f.facultyUsername || f.username || '').trim().toLowerCase()
      const c = String(f.facultyCode || '').trim().toLowerCase()
      return (u && u === normalized) || (c && c === normalized)
    })
    if (dupId) return { error: 'Faculty Code ID already exists.' }

    const qualification = String(patch.qualification ?? current.qualification ?? '').trim()
    const contactForAuth = String(patch.contactNumber ?? current.contactNumber ?? '').trim()

    const photoFile = patch.photoFile instanceof File ? patch.photoFile : null
    const patchPhoto = String(patch.photo_url ?? patch.photoDataUrl ?? '').trim()
    const currentPhoto = String(current.photo_url ?? current.photoDataUrl ?? '').trim()
    const photoChanged = Boolean(photoFile) || (patchPhoto !== '' && patchPhoto !== currentPhoto)
    const previousFacultyUsername = String(
      current.facultyUsername || current.facultyCode || current.username || '',
    ).trim()
    const existingAuthUserId = String(current.authUserId || '').trim()

    if (persistenceMode === 'server') {
      const facultyKey = String(current.id || current.postgresFacultyId || '').trim()
      if (!facultyKey) {
        return { error: 'Faculty account is not linked. Re-add or refresh the list.' }
      }
      const sectionIds = await resolveFacultySectionIds(
        { ...current, ...patch, advisorySections: patch.advisorySections ?? current.advisorySections },
        sections,
      )
      if (!sectionIds.length) {
        return { error: 'Could not resolve advisory sections.' }
      }
      try {
        const saveReq = buildFacultySaveRequest(
          {
            ...current,
            ...patch,
            email,
            facultyUsername: facultyCodeId,
            facultyCode: facultyCodeId,
            qualification,
            contactNumber: contactForAuth,
            password: passwordInPatch ? password : undefined,
            appPassword: appPasswordInPatch ? appPassword : undefined,
            photoChanged,
          },
          sectionIds,
          current.authUserId,
          { forUpdate: true, photoFile },
        )
        const res = await fetchStateApi(apiUrl(`/api/v1/faculty/${encodeURIComponent(facultyKey)}`), {
          method: 'PUT',
          credentials: 'include',
          ...(saveReq.useFormData
            ? { body: saveReq.body }
            : {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(saveReq.body),
              }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg = String(
            data?.error ||
              data?.message ||
              (data?.success === false ? data?.error : '') ||
              `Update failed (${res.status}).`,
          )
          toast.error(msg, { title: 'Faculty not updated' })
          return { error: msg }
        }

        const savedPhoto = String(data?.faculty?.photo_url ?? data?.faculty?.photoDataUrl ?? '').trim()
        const authSync = await ensureFacultyAuthUser({
          email,
          name: String(patch.name || current.name || '').trim() || 'Faculty',
          facultyUsername: facultyCodeId,
          password,
          existingAuthUserId,
          previousFacultyUsername,
          facultyQualification: qualification,
          facultyContactNumber: contactForAuth,
          photoDataUrl: photoChanged ? savedPhoto || patchPhoto : '',
          setCredentialPassword: passwordInPatch,
        })
        if (authSync?.error) {
          toast.error(authSync.error, { title: 'Faculty login error' })
          return { error: authSync.error }
        }

        const resolvedAuthUserId = String(authSync.authUserId || existingAuthUserId).trim()
        const needsAuthUserIdPersist = !existingAuthUserId && Boolean(resolvedAuthUserId)
        if (needsAuthUserIdPersist) {
          const linkReq = buildFacultySaveRequest(
            {
              ...current,
              ...patch,
              email,
              facultyUsername: facultyCodeId,
              facultyCode: facultyCodeId,
              qualification,
              contactNumber: contactForAuth,
            },
            sectionIds,
            resolvedAuthUserId,
            { forUpdate: true, persistAuthUserId: true },
          )
          const linkRes = await fetchStateApi(apiUrl(`/api/v1/faculty/${encodeURIComponent(facultyKey)}`), {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(linkReq.body),
          })
          const linkData = await linkRes.json().catch(() => ({}))
          if (!linkRes.ok) {
            const msg = String(
              linkData?.error ||
                linkData?.message ||
                (linkData?.success === false ? linkData?.error : '') ||
                `Could not link faculty login (${linkRes.status}).`,
            )
            toast.error(msg, { title: 'Faculty login link' })
            return { error: msg }
          }
          if (linkData?.faculty) upsertFacultyInState(linkData.faculty, sectionsRef.current)
        }

        if (data?.faculty) upsertFacultyInState(data.faculty, sectionsRef.current)
        if (resolvedAuthUserId) {
          setFaculties((prev) =>
            prev.map((f) => (f.id === id ? { ...f, authUserId: resolvedAuthUserId } : f)),
          )
        }
        if (photoChanged && savedPhoto) {
          const imgResync = await ensureFacultyAuthUser({
            email,
            name: String(patch.name || current.name || '').trim() || 'Faculty',
            facultyUsername: facultyCodeId,
            password,
            existingAuthUserId: resolvedAuthUserId,
            previousFacultyUsername,
            facultyQualification: qualification,
            facultyContactNumber: contactForAuth,
            photoDataUrl: savedPhoto,
            setCredentialPassword: false,
          })
          if (imgResync?.error) {
            toast.error(imgResync.error, { title: 'Faculty photo sync' })
          }
        }
        const refreshed = await refreshFacultiesFromPostgres()
        if (!refreshed.ok && !data?.faculty) {
          return {
            error: refreshed.error || 'Faculty updated but the list could not be refreshed. Reload the page.',
          }
        }
        dispatchAuditLogsRefresh({ type: 'faculty', id: facultyKey })
        return { ok: true, faculty: data?.faculty }
      } catch (err) {
        const msg = String(err?.message || err || 'Network error updating faculty.')
        toast.error(msg, { title: 'Faculty not updated' })
        return { error: msg }
      }
    }

    const authSyncLocal = await ensureFacultyAuthUser({
      email,
      name: String(patch.name || current.name || '').trim() || 'Faculty',
      facultyUsername: facultyCodeId,
      password,
      existingAuthUserId,
      previousFacultyUsername,
      facultyQualification: qualification,
      facultyContactNumber: contactForAuth,
      photoDataUrl: photoChanged ? facultyPhotoAuthImageUrl(patchPhoto || currentPhoto) : '',
      setCredentialPassword: passwordInPatch,
    })
    if (authSyncLocal?.error) {
      toast.error(authSyncLocal.error, { title: 'Faculty login error' })
      return { error: authSyncLocal.error }
    }

    const resolvedAuthUserIdLocal = String(authSyncLocal.authUserId || existingAuthUserId).trim()

    setFaculties((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              ...patch,
              email,
              facultyCode: facultyCodeId,
              facultyUsername: facultyCodeId,
              password: password || f.password,
              appPassword,
              authUserId: resolvedAuthUserIdLocal || f.authUserId,
            }
          : f,
      ),
    )
    toast.updated('Faculty updated in the dashboard.', { durationMs: 4500 })
    return { ok: true }
  }

  async function archiveFaculty(facultyId, reason) {
    const id = String(facultyId || '').trim()
    const archiveReason = String(reason || '').trim()
    const current = faculties.find((f) => f.id === id)
    if (!current) return { error: 'Faculty not found.' }

    if (persistenceMode === 'server') {
      const facultyKey = String(current.id || current.postgresFacultyId || '').trim()
      if (facultyKey) {
        try {
          const res = await fetch(apiUrl(`/api/v1/faculties/${encodeURIComponent(facultyKey)}/archive`), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: archiveReason }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            const msg = String(data?.message || data?.error || `Archive failed (${res.status}).`)
            return { error: msg }
          }
          setFaculties((prev) => prev.filter((f) => f.id !== id))
        } catch (err) {
          return { error: String(err?.message || err || 'Network error archiving faculty.') }
        }
      }
      await refreshFacultiesFromPostgres()
    } else {
      setFaculties((prev) => prev.filter((f) => f.id !== id))
    }
    return { ok: true }
  }

  const refreshSubjectsFromPostgres = useCallback(async () => {
    try {
      if (!isOnline()) throw new Error('offline')
      const res = await fetchStateApi(apiUrl('/api/v1/subjects'), { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = subjectApiErrorMessage(data, `Subjects list failed (${res.status}).`)
        console.warn('[subjects] GET /api/v1/subjects failed:', msg)
        return { ok: false, error: msg }
      }
      const list = Array.isArray(data.subjects) ? data.subjects : []
      await saveListSnapshot('admin_subjects', list)
      setSubjects(list.map((row) => mapPgSubjectRow(row, facultiesRef.current)))
      setCacheMeta((prev) => ({ ...prev, subjects: { fromCache: false, cachedAt: null } }))
      return { ok: true, count: list.length }
    } catch (e) {
      try {
        const { items: list, cachedAt } = await getListSnapshotWithMeta('admin_subjects')
        if (list.length) {
          setSubjects(list.map((row) => mapPgSubjectRow(row, facultiesRef.current)))
          setCacheMeta((prev) => ({ ...prev, subjects: { fromCache: true, cachedAt } }))
          return { ok: true, count: list.length, fromCache: true }
        }
      } catch {
        void 0
      }
      const msg = String(e?.message || e || 'Could not load subjects. Please try again.')
      console.warn('[subjects] refreshSubjectsFromPostgres:', msg)
      return { ok: false, error: msg }
    }
  }, [])

  async function addSubject(payload) {
    const subjectCode = String(payload.subjectCode || '').trim()
    const subjectName = String(payload.subjectName || '').trim()
    const grade = String(payload.grade || '').trim()
    const semester = Number(payload.semester || 0)
    if (!subjectCode || !subjectName || !grade || !(semester >= 1)) return { error: 'Please complete all required fields.' }

    const dupCode = subjects.some((s) => String(s.subjectCode || '').trim().toLowerCase() === subjectCode.toLowerCase())
    if (dupCode) return { error: 'Subject code already exists.' }

    if (persistenceMode === 'server') {
      try {
        const res = await fetchStateApi(apiUrl('/api/v1/subjects'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildSubjectApiBody(payload)),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          return { error: subjectApiErrorMessage(data, 'Could not create subject.') }
        }
        await refreshSubjectsFromPostgres()
        const facultyAssigned = String(payload.assignedFacultyId || '').trim()
        toast.created('You have created Subject.')
        if (!facultyAssigned) {
          toast.info('Assign a faculty member to this subject so it appears on the Teacher portal.', {
            title: 'Teacher visibility',
            durationMs: 9000,
          })
        }
        return { ok: true }
      } catch (e) {
        return { error: String(e?.message || e) }
      }
    }

    const next = [
      {
        id: crypto.randomUUID(),
        ...payload,
        subjectCode,
        subjectName,
        grade,
        semester,
        subjectPhoto: resolveSubjectImageFromMap(subjectName),
        subject_photo: resolveSubjectImageFromMap(subjectName),
      },
      ...subjects,
    ]
    setSubjects(next)
    toast.created('You have created Subject.')
    return { ok: true }
  }

  async function updateSubject(subjectId, patch) {
    const id = String(subjectId || '').trim()
    const current = subjects.find((s) => s.id === id)
    if (!current) return { error: 'Subject not found.' }

    const subjectCode = String(patch.subjectCode || current.subjectCode || '').trim()
    const subjectName = String(patch.subjectName || current.subjectName || '').trim()
    const grade = String(patch.grade || current.grade || '').trim()
    const semester = Number(patch.semester || current.semester || 0)
    if (!subjectCode || !subjectName || !grade || !(semester >= 1)) return { error: 'Please complete all required fields.' }

    const merged = {
      ...current,
      ...patch,
      subjectCode,
      subjectName,
      grade,
      semester,
    }

    const pgId = Number(current.postgresSubjectId ?? current.id)
    if (persistenceMode === 'server' && Number.isFinite(pgId) && pgId > 0) {
      try {
        const res = await fetchStateApi(apiUrl(`/api/v1/subjects/${encodeURIComponent(String(pgId))}`), {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildSubjectApiBody(merged)),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          return { error: subjectApiErrorMessage(data, 'Could not update subject.') }
        }
        await refreshSubjectsFromPostgres()
        toast.updated('You have updated Subject.')
        const facultyAssigned = String(merged.assignedFacultyId || merged.faculty_id || '').trim()
        if (!facultyAssigned) {
          toast.info('Assign a faculty member to this subject so it appears on the Teacher portal.', {
            title: 'Teacher visibility',
            durationMs: 9000,
          })
        }
        return { ok: true }
      } catch (e) {
        return { error: String(e?.message || e) }
      }
    }

    const dupCode = subjects.some((s) => s.id !== id && String(s.subjectCode || '').trim().toLowerCase() === subjectCode.toLowerCase())
    if (dupCode) return { error: 'Subject code already exists.' }

    setSubjects((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              ...merged,
            }
          : s,
      ),
    )
    toast.updated('You have updated Subject.')
    return { ok: true }
  }

  async function deleteSubject(subjectId) {
    const id = String(subjectId || '').trim()
    const current = subjects.find((s) => s.id === id)
    if (!current) return { error: 'Subject not found.' }

    const pgId = Number(current.postgresSubjectId ?? current.id)
    if (persistenceMode === 'server' && Number.isFinite(pgId) && pgId > 0) {
      try {
        const res = await fetchStateApi(apiUrl(`/api/v1/subjects/${encodeURIComponent(String(pgId))}`), {
          method: 'DELETE',
          credentials: 'include',
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          return { error: subjectApiErrorMessage(data, 'Could not delete subject.') }
        }
        await refreshSubjectsFromPostgres()
        toast.deleted('You have deleted Subject.')
        return { ok: true }
      } catch (e) {
        return { error: String(e?.message || e) }
      }
    }

    setSubjects((prev) => prev.filter((s) => s.id !== id))
    toast.deleted('You have deleted Subject.')
    return { ok: true }
  }

  const refreshAnnouncementsFromPostgres = useCallback(async () => {
    try {
      const res = await fetchStateApi(apiUrl('/api/v1/announcements'), { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = announcementApiErrorMessage(data, `Announcements list failed (${res.status}).`)
        console.warn('[announcements] GET /api/v1/announcements failed:', msg)
        return { ok: false, error: msg }
      }
      const list = Array.isArray(data.announcements) ? data.announcements : []
      setUpdates(list.map((row) => mapPgAnnouncementRow(row)))
      return { ok: true, count: list.length }
    } catch (e) {
      const msg = String(e?.message || e || 'Could not load announcements. Please try again.')
      console.warn('[announcements] refreshAnnouncementsFromPostgres:', msg)
      return { ok: false, error: msg }
    }
  }, [])

  async function addUpdate(payload) {
    const title = String(payload.title || '').trim()
    const updateType = String(payload.updateType || '').trim()
    const description = String(payload.description || '').trim()
    if (!title || !updateType || !description) return { error: 'Please complete all required fields.' }

    if (persistenceMode === 'server') {
      try {
        const res = await fetchStateApi(apiUrl('/api/v1/announcements'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildAnnouncementApiBody(payload)),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          return { error: announcementApiErrorMessage(data, 'Could not create announcement.') }
        }
        await refreshAnnouncementsFromPostgres()
        toast.created('You have created Announcement.')
        return { ok: true }
      } catch (e) {
        return { error: String(e?.message || e) }
      }
    }

    setUpdates((prev) => [
      {
        id: crypto.randomUUID(),
        title,
        updateType,
        description,
        imageDataUrl: String(payload.imageDataUrl || ''),
        postedAt: new Date().toISOString(),
        postedAtLabel: formatAnnouncementPosted(new Date().toISOString()),
        uploadedBy: 'Institute',
      },
      ...prev,
    ])
    toast.created('You have created Announcement.')
    return { ok: true }
  }

  async function updateUpdate(updateId, patch) {
    const id = String(updateId || '').trim()
    const current = updates.find((u) => u.id === id)
    if (!current) return { error: 'Update not found.' }

    const title = String(patch.title ?? current.title ?? '').trim()
    const updateType = String(patch.updateType ?? current.updateType ?? '').trim()
    const description = String(patch.description ?? current.description ?? '').trim()
    if (!title || !updateType || !description) return { error: 'Please complete all required fields.' }

    const merged = {
      ...current,
      ...patch,
      title,
      updateType,
      description,
      imageDataUrl:
        patch.imageDataUrl !== undefined ? String(patch.imageDataUrl || '') : current.imageDataUrl,
    }

    const pgId = Number(current.postgresAnnouncementId ?? current.id)
    if (persistenceMode === 'server' && Number.isFinite(pgId) && pgId > 0) {
      try {
        const res = await fetchStateApi(apiUrl(`/api/v1/announcements/${encodeURIComponent(String(pgId))}`), {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildAnnouncementApiBody(merged)),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          return { error: announcementApiErrorMessage(data, 'Could not update announcement.') }
        }
        await refreshAnnouncementsFromPostgres()
        toast.updated('You have updated Announcement.')
        return { ok: true }
      } catch (e) {
        return { error: String(e?.message || e) }
      }
    }

    setUpdates((prev) =>
      prev.map((u) =>
        u.id === id
          ? {
              ...u,
              ...merged,
            }
          : u,
      ),
    )
    toast.updated('You have updated Announcement.')
    return { ok: true }
  }

  async function deleteUpdate(updateId) {
    const id = String(updateId || '').trim()
    const current = updates.find((u) => u.id === id)
    if (!current) return { error: 'Update not found.' }

    const pgId = Number(current.postgresAnnouncementId ?? current.id)
    if (persistenceMode === 'server' && Number.isFinite(pgId) && pgId > 0) {
      try {
        const res = await fetchStateApi(apiUrl(`/api/v1/announcements/${encodeURIComponent(String(pgId))}`), {
          method: 'DELETE',
          credentials: 'include',
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          return { error: announcementApiErrorMessage(data, 'Could not delete announcement.') }
        }
        setUpdates((prev) => prev.filter((item) => String(item.id) !== id))
        await refreshAnnouncementsFromPostgres()
        toast.deleted('You have deleted Announcement.')
        return { ok: true }
      } catch (e) {
        return { error: String(e?.message || e) }
      }
    }

    setUpdates((prev) => prev.filter((item) => item.id !== id))
    toast.deleted('You have deleted Announcement.')
    return { ok: true }
  }

  function handleChooseAvatar() {
    fileInputRef.current?.click()
  }

  function handleAvatarFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      window.alert('Please select a PNG, JPG, or JPEG image.')
      return
    }
    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      window.alert('Photo too large. Maximum size is 2MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!result) return
      if (isRegistrar) {
        void (async () => {
          try {
            const res = await fetch(apiUrl('/api/v1/registrar/profile-photo'), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ profileImageDataUrl: result }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
              throw new Error(data?.message || 'Could not update profile photo.')
            }
            await authClient.getSession()
            toast.success('Profile photo updated.')
          } catch (err) {
            toast.error(err?.message || 'Could not update profile photo.')
          }
        })()
        return
      }
      setAdminAvatarDataUrl(result)
      try {
        localStorage.setItem(ADMIN_AVATAR_STORAGE_KEY, result)
      } catch {}
      void persistAdminAvatar(result)
    }
    reader.readAsDataURL(file)
  }

  function openSectionManagePage() {
    navigateToNav('section')
  }

  function openSectionStudentsPage(section) {
    if (location.pathname !== pathForNavId('section')) {
      navigate(pathForNavId('section'))
    }
    setActiveNav('section')
    setActiveSection(section)
    setSectionPage('students')
  }

  function openStudentsAllPage() {
    navigateToNav('students')
  }

  function openSectionAddPage() {
    navigateToNav('section')
    setSectionPage('add')
    setSectionError('')
  }

  function submitSection(e) {
    e.preventDefault()
    void submitSectionAsync()
  }

  async function submitSectionAsync() {
    setSectionError('')
    const grade = sectionForm.grade
    const name = sectionForm.name.trim()
    if (!grade || !name) {
      setSectionError('Please select grade level and enter section name/number.')
      return
    }
    const duplicate = sections.some(
      (s) => s.grade === grade && s.name.toLowerCase() === name.toLowerCase(),
    )
    if (duplicate) {
      setSectionError('Section already exists for this grade.')
      return
    }

    let postgresSectionId = null
    if (persistenceMode === 'server') {
      try {
        const res = await fetch(apiUrl('/api/v1/sections'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section_name: name, grade_level: grade }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(String(data?.message || data?.error || 'Could not save. Please try again.'), {
            title: 'Sections table',
            durationMs: 10000,
          })
          return
        }
        postgresSectionId = data?.id != null ? Number(data.id) : null
      } catch (err) {
        toast.error(String(err?.message || err || 'Could not save. Check your connection and try again.'), {
          title: 'Sections table',
          durationMs: 10000,
        })
        return
      }
    }

    const item = {
      id: crypto.randomUUID(),
      grade,
      name,
      students: 0,
      ...(postgresSectionId != null && Number.isFinite(postgresSectionId) ? { postgresSectionId } : {}),
    }
    setSections((prev) => [...prev, item])
    setActiveSectionGrade(grade)
    setSectionForm({ grade: '', name: '' })
    setSectionPage('manage')
    if (persistenceMode === 'server') {
      await refreshSectionsFromPostgres()
    }
    toast.created('You have created Section.', { title: 'Section created', durationMs: 4500 })
  }

  function editSection(item) {
    setSectionEditTarget(item)
    setSectionEditName(item?.name || '')
  }

  function deleteSection(item) {
    setSectionDeleteTarget(item)
  }

  async function saveSectionEdit() {
    if (!sectionEditTarget) return
    const name = sectionEditName.trim()
    if (!name) return

    const duplicate = sections.some(
      (s) =>
        s.id !== sectionEditTarget.id &&
        s.grade === sectionEditTarget.grade &&
        s.name.toLowerCase() === name.toLowerCase(),
    )
    if (duplicate) {
      window.alert('Section already exists for this grade.')
      return
    }

    if (persistenceMode === 'server') {
      const sid = Number(sectionEditTarget.postgresSectionId)
      if (Number.isFinite(sid) && sid > 0) {
        try {
          const res = await fetch(apiUrl(`/api/v1/sections/${sid}`), {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              section_name: name,
              grade_level: sectionEditTarget.grade,
            }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            toast.error(String(data?.message || data?.error || `Update failed (${res.status}).`), {
              title: 'Could not update section',
              durationMs: 10000,
            })
            return
          }
        } catch (e) {
          toast.error(String(e?.message || e || 'Network error updating section.'), {
            title: 'Could not update section',
            durationMs: 10000,
          })
          return
        }
      }
    }

    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionEditTarget.id ? { ...section, name } : section,
      ),
    )
    setSectionEditTarget(null)
    setSectionEditName('')
    if (persistenceMode === 'server') {
      await refreshSectionsFromPostgres()
    }
    toast.updated('You have updated Section.')
  }

  async function confirmSectionDelete() {
    if (!sectionDeleteTarget) return
    const item = sectionDeleteTarget

    if (persistenceMode === 'server' && item.postgresSectionId != null) {
      const sid = Number(item.postgresSectionId)
      if (Number.isFinite(sid) && sid > 0) {
        try {
          const res = await fetch(apiUrl(`/api/v1/sections/${sid}`), {
            method: 'DELETE',
            credentials: 'include',
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            toast.error(String(data?.message || data?.error || `Delete failed (${res.status}).`), {
              title: 'Could not delete section',
              durationMs: 10000,
            })
            return
          }
        } catch (e) {
          toast.error(String(e?.message || e || 'Network error deleting section.'), {
            title: 'Could not delete section',
            durationMs: 10000,
          })
          return
        }
      }
    }

    setSections((prev) => prev.filter((section) => section.id !== item.id))
    if (activeSection?.id === item.id) {
      setActiveSection(null)
      setSectionPage('manage')
    }
    setStudents((prev) => prev.filter((s) => s.sectionId !== item.id))
    setSectionDeleteTarget(null)
    if (persistenceMode === 'server') {
      await refreshSectionsFromPostgres()
    }
    toast.deleted('You have deleted Section.')
  }

  function nextRollNoForSection(sectionId) {
    const used = students
      .filter((s) => s.sectionId === sectionId)
      .map((s) => Number(s.rollNo))
      .filter((n) => Number.isFinite(n) && n > 0)
    const max = used.length ? Math.max(...used) : 0
    return String(max + 1)
  }

  function recomputeSectionStudentCounts(nextStudents) {
    setSections((prev) =>
      prev.map((sec) => ({
        ...sec,
        students: nextStudents.filter((s) => s.sectionId === sec.id).length,
      })),
    )
  }

  const refreshCurriculumFromPostgres = useCallback(async () => {
    try {
      if (!isOnline()) throw new Error('offline')
      const res = await fetchStateApi(apiUrl('/api/admin/curriculum-guides'), { credentials: 'include' })
      const data = await res.json().catch(() => ([]))
      if (!res.ok) {
        const msg = String(data?.message || data?.error || `Curriculum list failed (${res.status}).`)
        console.warn('[curriculum] GET /api/admin/curriculum-guides failed:', msg)
        return { ok: false, error: msg }
      }
      const list = Array.isArray(data) ? data : []
      const mapped = mapCurriculumGuideList(list, uploadsPathToApiUrl)
      await saveListSnapshot('admin_curriculum', list)
      setCurriculums(mapped)
      setCacheMeta((prev) => ({ ...prev, curriculum: { fromCache: false, cachedAt: null } }))
      return { ok: true, count: mapped.length }
    } catch (e) {
      try {
        const { items: list, cachedAt } = await getListSnapshotWithMeta('admin_curriculum')
        if (list.length) {
          const mapped = mapCurriculumGuideList(list, uploadsPathToApiUrl)
          setCurriculums(mapped)
          setCacheMeta((prev) => ({ ...prev, curriculum: { fromCache: true, cachedAt } }))
          return { ok: true, count: mapped.length, fromCache: true }
        }
      } catch {
        void 0
      }
      const msg = String(e?.message || e || 'Could not load curriculum. Please try again.')
      console.warn('[curriculum] refreshCurriculumFromPostgres:', msg)
      return { ok: false, error: msg }
    }
  }, [])

  const refreshSectionsFromPostgres = useCallback(async () => {
    try {
      if (!isOnline()) throw new Error('offline')
      const res = await fetchStateApi(apiUrl('/api/v1/sections'), { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = String(data?.message || data?.error || `Sections list failed (${res.status}).`)
        console.warn('[sections] GET /api/v1/sections failed:', msg)
        return { ok: false, error: msg }
      }
      const apiSec = Array.isArray(data.sections) ? data.sections : []
      await saveListSnapshot('admin_sections', apiSec)
      const merged = mergePostgresSectionIdsIntoSections(sectionsRef.current, apiSec)
      setSections(merged)
      setCacheMeta((prev) => ({ ...prev, section: { fromCache: false, cachedAt: null } }))
      return { ok: true, count: merged.length }
    } catch (e) {
      try {
        const { items: apiSec, cachedAt } = await getListSnapshotWithMeta('admin_sections')
        if (apiSec.length) {
          const merged = mergePostgresSectionIdsIntoSections(sectionsRef.current, apiSec)
          setSections(merged)
          setCacheMeta((prev) => ({ ...prev, section: { fromCache: true, cachedAt } }))
          return { ok: true, count: merged.length, fromCache: true }
        }
      } catch {
        void 0
      }
      const msg = String(e?.message || e || 'Could not load sections. Please try again.')
      console.warn('[sections] refreshSectionsFromPostgres:', msg)
      return { ok: false, error: msg }
    }
  }, [])

  async function refreshStudentsFromPostgres() {
    try {
      if (!isOnline()) throw new Error('offline')
      const [secRes, stuRes] = await Promise.all([
        fetch(apiUrl('/api/v1/sections'), { credentials: 'include' }),
        fetch(apiUrl('/api/v1/students'), { credentials: 'include' }),
      ])
      const secData = await secRes.json().catch(() => ({}))
      const stuData = await stuRes.json().catch(() => ({}))
      const apiSec = Array.isArray(secData.sections) ? secData.sections : []
      const merged = mergePostgresSectionIdsIntoSections(sectionsRef.current, apiSec)
      setSections(merged)
      await saveListSnapshot('admin_sections', apiSec)
      if (!stuRes.ok) return
      const list = Array.isArray(stuData.students) ? stuData.students : []
      await saveListSnapshot('admin_students', list)
      const mapped = list.map((row) => mapPgStudentRow(row, merged))
      setStudents(mapped)
      recomputeSectionStudentCounts(mapped)
      setCacheMeta((prev) => ({ ...prev, students: { fromCache: false, cachedAt: null } }))
    } catch {
      try {
        const apiSec = await getListSnapshot('admin_sections')
        const { items: list, cachedAt } = await getListSnapshotWithMeta('admin_students')
        const merged = mergePostgresSectionIdsIntoSections(sectionsRef.current, apiSec)
        if (apiSec.length) setSections(merged)
        if (list.length) {
          const mapped = list.map((row) => mapPgStudentRow(row, merged))
          setStudents(mapped)
          recomputeSectionStudentCounts(mapped)
          setCacheMeta((prev) => ({ ...prev, students: { fromCache: true, cachedAt } }))
        }
      } catch {
        /* ignore */
      }
    }
  }

  useEffect(() => {
    if (persistenceMode !== 'server' || !stateBootstrapDone) return
    void warmAdminOfflineCache()
  }, [persistenceMode, stateBootstrapDone])

  useEffect(() => {
    if (persistenceMode !== 'server' || !stateBootstrapDone) return
    if (postgresCurriculumBootstrapped.current) return
    postgresCurriculumBootstrapped.current = true
    void refreshCurriculumFromPostgres()
  }, [persistenceMode, stateBootstrapDone, refreshCurriculumFromPostgres])

  useEffect(() => {
    if (persistenceMode !== 'server' || !stateBootstrapDone) return
    if (postgresSectionsBootstrapped.current) return
    postgresSectionsBootstrapped.current = true
    void refreshSectionsFromPostgres()
  }, [persistenceMode, stateBootstrapDone, refreshSectionsFromPostgres])

  useEffect(() => {
    if (persistenceMode !== 'server' || !stateBootstrapDone) return
    if (postgresStudentsBootstrapped.current) return
    postgresStudentsBootstrapped.current = true
    void refreshStudentsFromPostgres()
  }, [persistenceMode, stateBootstrapDone])

  function upsertFacultyInState(apiRow, sectionsList) {
    if (!apiRow) return
    const mapped = mapPgFacultyRow(apiRow, sectionsList)
    const pgId = Number(mapped.postgresFacultyId)
    setFaculties((prev) => {
      const rest = prev.filter(
        (f) =>
          String(f.id) !== String(mapped.id) &&
          !(Number.isFinite(pgId) && pgId > 0 && Number(f.postgresFacultyId) === pgId),
      )
      return dedupeById([mapped, ...rest])
    })
  }

  const refreshFacultiesFromPostgres = useCallback(async () => {
    try {
      if (!isOnline()) throw new Error('offline')
      const [secRes, facRes] = await Promise.all([
        fetchStateApi(apiUrl('/api/v1/sections'), { credentials: 'include' }),
        fetchStateApi(apiUrl('/api/v1/faculty'), { credentials: 'include' }),
      ])
      const secData = await secRes.json().catch(() => ({}))
      const facData = await facRes.json().catch(() => ({}))
      const apiSec = Array.isArray(secData.sections) ? secData.sections : []
      const merged = mergePostgresSectionIdsIntoSections(sectionsRef.current, apiSec)
      setSections(merged)
      await saveListSnapshot('admin_sections', apiSec)
      if (!facRes.ok) {
        const msg = String(facData?.message || facData?.error || `Faculty list failed (${facRes.status}).`)
        console.warn('[faculty] GET /api/v1/faculty failed:', msg)
        return { ok: false, error: msg }
      }
      const list = Array.isArray(facData.faculty) ? facData.faculty : []
      await saveListSnapshot('admin_faculties', list)
      setFaculties(dedupeById(list.map((row) => mapPgFacultyRow(row, merged))))
      setCacheMeta((prev) => ({ ...prev, faculties: { fromCache: false, cachedAt: null } }))
      return { ok: true, count: list.length }
    } catch (e) {
      try {
        const apiSec = await getListSnapshot('admin_sections')
        const { items: list, cachedAt } = await getListSnapshotWithMeta('admin_faculties')
        const merged = mergePostgresSectionIdsIntoSections(sectionsRef.current, apiSec)
        if (apiSec.length) setSections(merged)
        if (list.length) {
          setFaculties(dedupeById(list.map((row) => mapPgFacultyRow(row, merged))))
          setCacheMeta((prev) => ({ ...prev, faculties: { fromCache: true, cachedAt } }))
          return { ok: true, count: list.length, fromCache: true }
        }
      } catch {
        void 0
      }
      const msg = String(e?.message || e || 'Could not load faculty. Please try again.')
      console.warn('[faculty] refreshFacultiesFromPostgres:', msg)
      return { ok: false, error: msg }
    }
  }, [])

  useEffect(() => {
    if (persistenceMode !== 'server' || !stateBootstrapDone) return
    if (postgresFacultyBootstrapped.current) return
    postgresFacultyBootstrapped.current = true
    void refreshFacultiesFromPostgres()
  }, [persistenceMode, stateBootstrapDone, refreshFacultiesFromPostgres])

  const refreshInstituteStateFromServer = useCallback(async () => {
    try {
      const res = await fetch(getLmsStateEndpointUrl(), { credentials: 'include' })
      if (!res.ok) return
      const payload = await res.json()
      if (!payload?.state) return
      setAdminAvatarDataUrl(String(payload.state.adminAvatarDataUrl || ''))
      void refreshCurriculumFromPostgres()
      void refreshSectionsFromPostgres()
    } catch (e) {
      console.warn('[state] refresh after backup restore:', e?.message || e)
    }
  }, [refreshCurriculumFromPostgres, refreshSectionsFromPostgres])

  useEffect(() => {
    if (persistenceMode !== 'server' || !stateBootstrapDone) return
    const onBackupRestored = () => {
      void refreshCurriculumFromPostgres()
      void refreshSectionsFromPostgres()
      void refreshFacultiesFromPostgres()
      void refreshSubjectsFromPostgres()
      void refreshStudentsFromPostgres()
      void refreshAnnouncementsFromPostgres()
      void refreshInstituteStateFromServer()
    }
    window.addEventListener(BACKUP_RESTORED_EVENT, onBackupRestored)
    return () => window.removeEventListener(BACKUP_RESTORED_EVENT, onBackupRestored)
  }, [
    persistenceMode,
    stateBootstrapDone,
    refreshCurriculumFromPostgres,
    refreshSectionsFromPostgres,
    refreshFacultiesFromPostgres,
    refreshSubjectsFromPostgres,
    refreshStudentsFromPostgres,
    refreshAnnouncementsFromPostgres,
    refreshInstituteStateFromServer,
  ])

  useEffect(() => {
    if (persistenceMode !== 'server' || !stateBootstrapDone) return
    if (postgresSubjectsBootstrapped.current) return
    if (!postgresFacultyBootstrapped.current) return
    postgresSubjectsBootstrapped.current = true
    void refreshSubjectsFromPostgres()
  }, [persistenceMode, stateBootstrapDone, faculties, refreshSubjectsFromPostgres])

  useEffect(() => {
    if (persistenceMode !== 'server' || !stateBootstrapDone) return
    if (postgresAnnouncementsBootstrapped.current) return
    postgresAnnouncementsBootstrapped.current = true
    void refreshAnnouncementsFromPostgres()
  }, [persistenceMode, stateBootstrapDone, refreshAnnouncementsFromPostgres])

  async function addStudent(payload) {
    const firstName = String(payload.firstName || '').trim()
    const middleName = String(payload.middleName || '').trim()
    const lastName = String(payload.lastName || '').trim()
    const studentContactNumber = String(payload.studentContactNumber || payload.phone || '').trim()
    const studentAddress = String(payload.studentAddress || '').trim()
    const dateOfBirth = String(payload.dateOfBirth || '').trim()
    const parentContactNumber = String(payload.parentContactNumber || '').trim()
    const parentEmail = String(payload.parentEmail || '').trim().toLowerCase()
    const enrollmentNo = String(payload.enrollmentNo || '').trim()
    const email = String(payload.email || '').trim().toLowerCase()
    const semester = String(payload.semester || '1').trim()
    const rollNo = String(payload.rollNo || '').trim()
    const photoDataUrl = String(payload.photoDataUrl || '').trim()
    const password = String(payload.password || '').trim()
    const loginId = String(payload.loginId || '').trim()
    const sectionId = String(payload.sectionId || '').trim()
    const section = sections.find((s) => s.id === sectionId)
    if (!section) return { error: 'Selected section does not exist.' }

    if (
      !firstName ||
      !lastName ||
      !email ||
      !studentContactNumber ||
      !studentAddress ||
      !dateOfBirth ||
      !parentContactNumber ||
      !parentEmail ||
      !enrollmentNo ||
      !semester ||
      !loginId ||
      !password
    ) {
      return { error: 'Please complete all required fields.' }
    }

    const dupEnrollment = students.some((s) => String(s.enrollmentNo).trim() === enrollmentNo)
    if (dupEnrollment) return { error: 'Enrollment number already exists.' }

    const dupEmail = students.some((s) => String(s.email || '').trim().toLowerCase() === email)
    if (dupEmail) return { error: 'Email already exists.' }

    const dupLogin = students.some((s) => String(s.loginId || '').trim().toLowerCase() === loginId.toLowerCase())
    if (dupLogin) return { error: 'This Login ID is already in use by another student.' }

    const name = `${firstName}${middleName ? ` ${middleName}` : ''} ${lastName}`.trim()
    const nextRoll = rollNo || nextRollNoForSection(section.id)

    const dupRoll = students.some((s) => s.sectionId === section.id && String(s.rollNo) === String(nextRoll))
    if (dupRoll) return { error: 'Roll number already exists in this section.' }

    const authSync = await ensureStudentAuthUser({
      email,
      name,
      loginId,
      password,
      existingAuthUserId: '',
    })
    if (authSync?.error) return { error: authSync.error }

    if (persistenceMode === 'server') {
      const pgSid = await fetchPostgresSectionIdForSection(section)
      if (!pgSid) {
        return {
          error:
            'Could not find this section. Create the section from the dashboard and try again.',
        }
      }
      try {
        const res = await fetch(apiUrl('/api/v1/students'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName,
            middleName,
            lastName,
            email,
            contactNumber: studentContactNumber,
            address: studentAddress,
            dob: dateOfBirth,
            dateOfBirth,
            parentContact: parentContactNumber,
            parentEmail,
            enrollmentNo,
            rollNo: nextRoll,
            gradeLevel: section.grade,
            semester: semester,
            sectionId: pgSid,
            loginId,
            password,
            photoDataUrl,
            authUserId: String(authSync.authUserId || '').trim(),
            auth_user_id: String(authSync.authUserId || '').trim(),
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          return { error: String(data?.message || data?.error || 'Could not save. Please try again.') }
        }
        await refreshStudentsFromPostgres()
        const aid = String(authSync.authUserId || '').trim()
        if (aid) {
          setStudents((prev) =>
            prev.map((s) =>
              String(s.email || '').trim().toLowerCase() === email ? { ...s, authUserId: aid } : s,
            ),
          )
        }
        return { ok: true, enrollmentNo, registeredPostgres: true }
      } catch (e) {
        return { error: String(e?.message || e || 'Could not save. Check your connection and try again.') }
      }
    }

    const newStudent = {
      id: crypto.randomUUID(),
      firstName,
      middleName,
      lastName,
      name,
      enrollmentNo,
      email,
      studentContactNumber,
      phone: studentContactNumber,
      studentAddress,
      dateOfBirth,
      parentContactNumber,
      parentEmail,
      grade: section.grade,
      semester,
      sectionId: section.id,
      sectionName: section.name,
      rollNo: nextRoll,
      loginId,
      password,
      photoDataUrl,
    }

    const studentWithAuth = { ...newStudent, authUserId: authSync.authUserId || '' }
    const next = [studentWithAuth, ...students]
    setStudents(next)
    recomputeSectionStudentCounts(next)
    return { ok: true }
  }

  async function updateStudent(studentId, patch) {
    const id = String(studentId || '').trim()
    const current = students.find((s) => s.id === id)
    if (!current) return { error: 'Student not found.' }

    const firstName = String(patch.firstName || '').trim()
    const middleName = String(patch.middleName || '').trim()
    const lastName = String(patch.lastName || '').trim()
    const studentContactNumber = String(patch.studentContactNumber || patch.phone || '').trim()
    const studentAddress = String(patch.studentAddress || '').trim()
    const dateOfBirth = String(patch.dateOfBirth || '').trim()
    const parentContactNumber = String(patch.parentContactNumber || '').trim()
    const parentEmail = String(patch.parentEmail || '').trim().toLowerCase()
    const enrollmentNo = String(patch.enrollmentNo || current.enrollmentNo || '').trim()
    const email = String(patch.email || current.email || '').trim().toLowerCase()
    const semester = String(patch.semester || current.semester || '1').trim()
    const rollNo = String(patch.rollNo || current.rollNo || '').trim()
    const photoDataUrl = typeof patch.photoDataUrl === 'string' ? patch.photoDataUrl : current.photoDataUrl || ''
    const normalizeAppPw = (v) => String(v || '').replace(/\s/g, '').trim()
    const trimmedPatchPw = typeof patch.password === 'string' ? String(patch.password).trim() : ''
    const currentPw = String(current.password || '').trim()
    const passwordInPatch = trimmedPatchPw !== '' && trimmedPatchPw !== currentPw
    const password = passwordInPatch ? trimmedPatchPw : currentPw
    const loginId = String(patch.loginId || current.loginId || '').trim()
    const trimmedPatchApp =
      typeof patch.appPassword === 'string' ? normalizeAppPw(patch.appPassword) : ''
    const currentAppNorm = normalizeAppPw(current.appPassword)
    const appPasswordInPatch = trimmedPatchApp !== '' && trimmedPatchApp !== currentAppNorm
    const appPassword = appPasswordInPatch ? trimmedPatchApp : String(current.appPassword || '').trim()
    const sectionId = String(patch.sectionId || '').trim()
    const section = sections.find((s) => s.id === sectionId)
    if (!section) return { error: 'Selected section does not exist.' }

    if (
      !firstName ||
      !lastName ||
      !email ||
      !studentContactNumber ||
      !studentAddress ||
      !dateOfBirth ||
      !parentContactNumber ||
      !parentEmail ||
      !enrollmentNo ||
      !semester ||
      !rollNo ||
      !loginId
    ) {
      return { error: 'Please complete all required fields.' }
    }

    const dupEnrollment = students.some((s) => s.id !== id && String(s.enrollmentNo).trim() === enrollmentNo)
    if (dupEnrollment) return { error: 'Enrollment number already exists.' }

    const dupEmail = students.some((s) => s.id !== id && String(s.email || '').trim().toLowerCase() === email)
    if (dupEmail) return { error: 'Email already exists.' }

    const dupLogin = students.some(
      (s) => s.id !== id && String(s.loginId || '').trim().toLowerCase() === loginId.toLowerCase(),
    )
    if (dupLogin) return { error: 'This Login ID is already in use by another student.' }

    const dupRoll = students.some(
      (s) => s.id !== id && s.sectionId === section.id && String(s.rollNo) === String(rollNo),
    )
    if (dupRoll) return { error: 'Roll number already exists in this section.' }

    const name = `${firstName}${middleName ? ` ${middleName}` : ''} ${lastName}`.trim()

    const existingAuthUserId = String(current.authUserId || '').trim()
    const previousLoginId = String(current.loginId || '').trim()
    const authSync = await ensureStudentAuthUser({
      email,
      name,
      loginId,
      password,
      existingAuthUserId,
      previousLoginId,
      setCredentialPassword: passwordInPatch,
    })
    if (authSync?.error) return { error: authSync.error }

    const resolvedAuthUserId = String(authSync.authUserId || existingAuthUserId).trim()
    const needsAuthUserIdPersist = !existingAuthUserId && Boolean(resolvedAuthUserId)

    if (persistenceMode === 'server') {
      const rawPid = current.postgresStudentId ?? (Number.isFinite(Number(id)) ? Number(id) : NaN)
      const pgStudentId = Number.isFinite(rawPid) && rawPid > 0 ? rawPid : NaN
      if (Number.isFinite(pgStudentId)) {
        const pgSid = await fetchPostgresSectionIdForSection(section)
        if (!pgSid) {
          return { error: 'Could not find this section.' }
        }
        const putBody = {
          firstName,
          middleName,
          lastName,
          email,
          contactNumber: studentContactNumber,
          address: studentAddress,
          dob: dateOfBirth,
          dateOfBirth,
          parentContact: parentContactNumber,
          parentEmail,
          enrollmentNo,
          rollNo,
          gradeLevel: section.grade,
          semester: semester,
          sectionId: pgSid,
          loginId,
          photoDataUrl,
        }
        if (passwordInPatch) putBody.password = trimmedPatchPw
        if (appPasswordInPatch) putBody.appPasswordGmail = appPassword
        if (needsAuthUserIdPersist) {
          putBody.authUserId = resolvedAuthUserId
          putBody.auth_user_id = resolvedAuthUserId
        }
        try {
          const res = await fetch(apiUrl(`/api/v1/students/${encodeURIComponent(String(pgStudentId))}`), {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(putBody),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            return { error: String(data?.message || data?.error || `Update failed (${res.status}).`) }
          }
          await refreshStudentsFromPostgres()
          if (resolvedAuthUserId) {
            setStudents((prev) =>
              prev.map((s) =>
                String(s.enrollmentNo || '').trim() === enrollmentNo
                  ? { ...s, authUserId: resolvedAuthUserId }
                  : s,
              ),
            )
          }
          dispatchAuditLogsRefresh({ type: 'student', id: pgStudentId })
          return { ok: true, updatedPostgres: true }
        } catch (e) {
          return { error: String(e?.message || e || 'Network error updating student.') }
        }
      }
    }

    const nextStudents = students.map((s) =>
      s.id === id
        ? {
            ...s,
            firstName,
            middleName,
            lastName,
            name,
            enrollmentNo,
            email,
            studentContactNumber,
            phone: studentContactNumber,
            studentAddress,
            dateOfBirth,
            parentContactNumber,
            parentEmail,
            grade: section.grade,
            semester,
            sectionId: section.id,
            sectionName: section.name,
            rollNo,
            loginId,
            password,
            appPassword,
            photoDataUrl,
            authUserId: resolvedAuthUserId,
          }
        : s,
    )
    setStudents(nextStudents)
    recomputeSectionStudentCounts(nextStudents)
    return { ok: true }
  }

  async function archiveStudent(studentId, reason) {
    const id = String(studentId || '').trim()
    const archiveReason = String(reason || '').trim()
    const target = students.find((s) => s.id === id)
    const rawPg = target?.postgresStudentId ?? (Number.isFinite(Number(id)) ? Number(id) : NaN)
    const pgId = Number.isFinite(rawPg) && rawPg > 0 ? rawPg : null

    if (persistenceMode === 'server' && pgId != null) {
      try {
        const res = await fetch(apiUrl(`/api/v1/students/${encodeURIComponent(String(pgId))}/archive`), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: archiveReason }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok && res.status !== 404) {
          return { error: String(data?.message || data?.error || `Archive failed (${res.status}).`) }
        }
        const nextStudents = students.filter((s) => s.id !== id)
        setStudents(nextStudents)
        recomputeSectionStudentCounts(nextStudents)
        return { ok: true }
      } catch (e) {
        return { error: String(e?.message || e || 'Network error archiving student.') }
      }
    }

    const nextStudents = students.filter((s) => s.id !== id)
    setStudents(nextStudents)
    recomputeSectionStudentCounts(nextStudents)
    return { ok: true }
  }

  function sectionContent() {
    if (sectionPage === 'add') {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Add</p>
              <h2 className="text-3xl font-bold text-neutral-900">Sections</h2>
            </div>
            <BackButton onClick={openSectionManagePage} />
          </div>
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
            <h3 className="text-lg font-semibold text-neutral-900">Add New Section</h3>
            <form onSubmit={submitSection} className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-neutral-700">
                Grade Level *
                <select
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={sectionForm.grade}
                  onChange={(e) =>
                    setSectionForm((prev) => ({ ...prev, grade: e.target.value }))
                  }
                >
                  <option value="">Select Grade Level</option>
                  {GRADE_LEVELS.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-neutral-700">
                Section Name/Number *
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  placeholder="e.g., 7-Emerald"
                  value={sectionForm.name}
                  onChange={(e) =>
                    setSectionForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </label>
              <div className="md:col-span-2">
                {sectionError ? <p className="mb-2 text-sm text-red-600">{sectionError}</p> : null}
                <button
                  type="submit"
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Add Section
                </button>
              </div>
            </form>
          </section>
        </div>
      )
    }

    if (sectionPage === 'students') {
      return (
        <StudentsInSection
          section={activeSection}
          students={students}
          sections={sections}
          gradeOptions={GRADE_LEVELS}
          onUpdateStudent={updateStudent}
          onArchiveStudent={archiveStudent}
          onBack={() => {
            setActiveSection(null)
            openSectionManagePage()
          }}
        />
      )
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <BackButton onClick={() => navigateToNav('dashboard')} />
            <h2 className="text-3xl font-bold text-neutral-900">Section Management</h2>
          </div>
          <button
            type="button"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            onClick={openSectionAddPage}
          >
            + Add Section
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-neutral-300 pb-2">
          {GRADE_LEVELS.map((grade) => (
            <button
              key={grade}
              type="button"
              onClick={() => setActiveSectionGrade(grade)}
              className={`rounded px-3 py-1.5 text-sm font-semibold ${
                activeSectionGrade === grade
                  ? 'bg-neutral-200 text-neutral-900'
                  : 'text-neutral-500 hover:bg-neutral-100'
              }`}
            >
              {grade}
            </button>
          ))}
        </div>

        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
          <h3 className="text-lg font-semibold text-neutral-900">
            Sections for {activeSectionGrade}
          </h3>
          <p className="text-sm text-neutral-500">Manage sections and view enrolled students</p>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sectionsForGrade.length === 0 ? (
              <div className="rounded-lg border border-dashed p-5 text-sm text-neutral-500">
                No sections yet for {activeSectionGrade}.
              </div>
            ) : (
              sectionsForGrade.map((item) => (
                <article key={item.id} className="rounded-xl border bg-neutral-50 p-4 shadow-sm">
                  <div className="mb-3 flex justify-center text-blue-600">
                    <UsersIcon className="h-12 w-12" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-neutral-900">{item.name}</p>
                    <p className="text-sm text-neutral-600">{item.grade}</p>
                    <p className="mt-1 text-xs font-semibold text-blue-700">
                      {item.students} Students
                    </p>
                  </div>
                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      className="w-full rounded border border-blue-700 bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white"
                      onClick={() => openSectionStudentsPage(item)}
                    >
                      View Students
                    </button>
                    <button
                      type="button"
                      className="w-full rounded border px-3 py-1.5 text-sm font-semibold text-neutral-700"
                      onClick={() => editSection(item)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="w-full rounded border px-3 py-1.5 text-sm font-semibold text-red-600"
                      onClick={() => deleteSection(item)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div
      className="flex h-svh min-h-0 overflow-hidden font-[Inter,system-ui,sans-serif]"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <PortalSidebarShell
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebarCollapsed}
        sidebarGold={SIDEBAR_GOLD}
        sidebarGoldDark={SIDEBAR_GOLD_DARK}
        header={<Header collapsed={sidebarCollapsed} portalLabel={portalLabel} />}
        footer={
          <div className="shrink-0 border-t border-white/15 px-2 py-4 text-center text-white/85">
            {!sidebarCollapsed ? (
              <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Legal center</p>
            ) : null}
            <button
              type="button"
              onClick={() => navigate('/admin/terms')}
              title="Terms & Conditions"
              aria-label="Terms & Conditions"
              className={`flex w-full items-center rounded-lg text-sm font-medium text-white/90 transition hover:bg-white/10 ${
                sidebarCollapsed ? 'mt-0.5 justify-center px-2 py-2.5' : 'mt-2 justify-center gap-3 px-3 py-2.5'
              }`}
            >
              <i
                className="ti ti-file-description"
                style={{ fontSize: '18px', minWidth: '20px' }}
                aria-hidden="true"
              />
              {!sidebarCollapsed ? <span>Terms &amp; Conditions</span> : null}
            </button>
            <button
              type="button"
              onClick={onLogout}
              title="Logout"
              aria-label="Logout"
              className={`mt-0.5 flex w-full items-center rounded-lg text-sm font-medium text-white/90 transition hover:bg-white/10 ${
                sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'justify-center gap-3 px-3 py-2.5'
              }`}
            >
              <i className="ti ti-logout" style={{ fontSize: '18px', minWidth: '20px' }} aria-hidden="true" />
              {!sidebarCollapsed ? <span>Logout</span> : null}
            </button>
            {!sidebarCollapsed ? (
              <p className="mt-3 px-1 text-xs leading-relaxed text-white/60">
                © {new Date().getFullYear()} LENLEARN LMS. ALL RIGHTS RESERVED.
              </p>
            ) : null}
          </div>
        }
      >
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
          {visibleNav.map(({ id, label, icon: Icon, to }) => (
            <NavLink
              key={id}
              to={to}
              end
              title={label}
              aria-label={label}
              className={({ isActive }) =>
                `flex items-center rounded-lg text-sm font-medium transition ${
                  sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
                } ${
                  isActive
                    ? 'bg-white/20 text-white shadow-inner'
                    : 'text-white/90 hover:bg-white/10'
                }`
              }
              aria-current={activeNav === id ? 'page' : undefined}
            >
              <Icon className="h-5 w-5 shrink-0 opacity-95" />
              {!sidebarCollapsed ? label : null}
            </NavLink>
          ))}
        </nav>
      </PortalSidebarShell>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-neutral-100">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-neutral-200/80 bg-neutral-50/80 px-4 py-4 backdrop-blur-sm md:px-8 md:py-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 md:text-3xl">
              {activeNav === 'curriculum'
                  ? 'Curriculum'
                  : activeNav === 'section'
                    ? 'Section'
                    : activeNav === 'students'
                      ? 'Students'
                      : activeNav === 'faculties'
                        ? 'Faculties'
                            : activeNav === 'subjects'
                              ? 'Subjects'
                              : activeNav === 'updates'
                              ? 'Announcements'
                              : activeNav === 'monitoring'
                                ? 'Audit Logs'
                                : activeNav === 'incidents'
                                  ? 'Incident Response'
                                : activeNav === 'turnover'
                                  ? 'Admin Transfer'
                                : activeNav === 'backup'
                                  ? 'Data Backup'
                                  : activeNav === 'archive'
                                    ? 'Archive Vault'
                                    : activeNav === 'registrars'
                                      ? 'Registrar Accounts'
                  : 'Dashboard'}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SchoolYearBadge editable={isAdmin} />
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg px-5 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ backgroundColor: ACTION_BLUE }}
            >
              Logout
            </button>
          </div>
        </header>

        <OfflineBanner />
        <SystemOfflineBanner />
        <AdminAuditBanner persistenceMode={persistenceMode} />
        <OfflineCacheIndicator
          fromCache={cacheMeta[activeNav]?.fromCache}
          cachedAt={cacheMeta[activeNav]?.cachedAt}
          className="px-4 pt-2 md:px-8"
        />

        <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:space-y-8 md:p-8">
          <>
          <div className={activeNav === 'curriculum' ? '' : 'hidden'}>
            <InstituteCurriculum
              ref={curriculumRef}
              curriculums={curriculums}
              setCurriculums={setCurriculums}
              subjects={subjects}
              persistenceMode={persistenceMode}
              setActiveNav={navigateToNav}
              onCurriculumRefresh={refreshCurriculumFromPostgres}
            />
          </div>

          {onTermsPage ? (
            <AdminTermsPage />
          ) : activeNav === 'section' ? (
            sectionContent()
          ) : activeNav === 'monitoring' ? (
            <MonitoringRecords />
          ) : activeNav === 'incidents' ? (
            <IncidentResponsePage />
          ) : activeNav === 'turnover' ? (
            <AdminTurnoverPage />
          ) : activeNav === 'registrars' ? (
            <RegistrarAccountsPage />
          ) : activeNav === 'backup' ? (
            <BackupPage />
          ) : activeNav === 'archive' ? (
            <ArchiveVault portalRole={portalRole} />
          ) : activeNav === 'students' ? (
            <StudentsPage
              sections={sections}
              students={students}
              onAddStudent={addStudent}
              onUpdateStudent={updateStudent}
          onArchiveStudent={archiveStudent}
          onSendPasswordResetEmail={sendPasswordResetEmail}
              onBack={() => navigateToNav('dashboard')}
              initialGrade={studentNavContext.grade}
              initialSectionId={studentNavContext.sectionId}
            />
          ) : activeNav === 'faculties' ? (
            <FacultiesPage
              sections={sections}
              gradeOptions={GRADE_LEVELS}
              faculties={faculties}
              onAddFaculty={addFaculty}
              onUpdateFaculty={updateFaculty}
              onArchiveFaculty={archiveFaculty}
              onSendPasswordResetEmail={sendPasswordResetEmail}
              onBack={() => navigateToNav('dashboard')}
            />
          ) : activeNav === 'subjects' ? (
            <SubjectsPage
              gradeOptions={GRADE_LEVELS}
              facultyOptions={faculties}
              curriculumGuideOptions={curriculums.filter((c) => c.isPublished !== false)}
              subjects={subjects}
              onAddSubject={addSubject}
              onUpdateSubject={updateSubject}
              onDeleteSubject={deleteSubject}
              onBack={() => navigateToNav('dashboard')}
            />
          ) : activeNav === 'updates' ? (
            <UpdatesPage
              updates={updates}
              uploadedByLabel="Institute"
              onAddUpdate={addUpdate}
              onUpdateUpdate={updateUpdate}
              onDeleteUpdate={deleteUpdate}
              onBack={() => navigateToNav('dashboard')}
            />
          ) : activeNav === 'dashboard' ? (
            <>
            <section className="mb-6 rounded-xl border border-neutral-100 bg-white p-5 shadow-md md:p-6">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
                {profileAvatarSrc ? (
                  <img
                    src={profileAvatarSrc}
                    alt="Profile"
                    className="h-[72px] w-[72px] rounded-full object-cover ring-2 ring-white shadow-sm"
                  />
                ) : (
                  <Avatar seed={profileAvatarSeed} size={72} />
                )}
                <div className="min-w-0 text-left">
                  <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">{adminDisplayName}</h2>
                  <p className="mt-1 text-sm text-neutral-600">
                    {isRegistrar ? 'Registrar' : 'Admin'}
                    {' '}
                    |{' '}
                    <button
                      type="button"
                      onClick={handleChooseAvatar}
                      className="font-medium text-[#3182ce] underline-offset-2 hover:underline"
                    >
                      Change Image
                    </button>
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={handleAvatarFileChange}
                    className="hidden"
                  />
                </div>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
              <div className="lg:col-span-2">
              <section className="rounded-xl border border-neutral-100 bg-white shadow-md">
                <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 md:px-6">
                  <h3 className="text-lg font-bold text-neutral-900">New Faculties</h3>
                  <button
                    type="button"
                    className="text-sm font-semibold text-[#3182ce] hover:underline"
                    onClick={() => navigateToNav('faculties')}
                  >
                    View all
                  </button>
                </div>
                <ul className="divide-y divide-neutral-100">
                  {recentFaculties.length === 0 ? (
                    <li className="px-5 py-6 text-sm font-medium text-neutral-500 md:px-6">No faculty added yet.</li>
                  ) : (
                    recentFaculties.map((f) => (
                      <li
                        key={f.id}
                        className="flex flex-wrap items-center gap-3 px-5 py-4 md:flex-nowrap md:gap-4 md:px-6"
                      >
                        <DashboardFacultyThumb faculty={f} />
                        <div className="min-w-0 flex-1 text-left">
                          <p className="font-semibold text-neutral-900">{f.name}</p>
                          <p className="text-sm text-neutral-500">
                            {(f.advisorySections || []).map((s) => s.name).join(', ') || f.grade}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="ml-auto rounded-lg border border-[#3182ce]/30 bg-[#3182ce]/5 px-4 py-1.5 text-sm font-semibold text-[#3182ce] transition hover:bg-[#3182ce]/10"
                          onClick={() => navigateToNav('faculties')}
                        >
                          View
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </section>
              </div>

              <div className="flex flex-col gap-4">
                {stats.map(({ label, value, Icon: StatIcon }) => (
                  <div
                    key={label}
                    className="flex items-center gap-4 rounded-xl border border-neutral-100 bg-white px-4 py-4 shadow-md md:px-5"
                  >
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600"
                      aria-hidden
                    >
                      <StatIcon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{label}</p>
                      <p className="text-2xl font-bold tabular-nums text-neutral-900">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {!isRegistrar ? (
              <>
                <AdminLatestAnnouncementsExpanded
                  announcements={recentAnnouncements}
                  onViewAll={() => navigateToNav('updates')}
                />

                <AuditStatisticsSection variant="dashboard" enabled />
              </>
            ) : null}
            </>
          ) : null}
          </>
        </main>
      </div>

      {sectionEditTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-neutral-900">Edit Section</h3>
            <p className="mt-2 text-sm text-neutral-700">
              Update section name/number for <span className="font-semibold">{sectionEditTarget.grade}</span>.
            </p>
            <label className="mt-4 block text-sm font-medium text-neutral-700">
              Section Name/Number
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                value={sectionEditName}
                onChange={(e) => setSectionEditName(e.target.value)}
                placeholder="e.g., 7-Emerald"
                autoFocus
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
                onClick={() => {
                  setSectionEditTarget(null)
                  setSectionEditName('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                onClick={saveSectionEdit}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sectionDeleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-neutral-900">Delete Section</h3>
            <p className="mt-2 text-sm text-neutral-700">
              Are you sure to delete <span className="font-semibold">{sectionDeleteTarget.name}</span> (
              {sectionDeleteTarget.grade})? This will also remove students assigned to this section.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
                onClick={() => setSectionDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => void confirmSectionDelete()}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

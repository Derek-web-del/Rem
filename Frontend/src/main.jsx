import { lazy, StrictMode, Suspense, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import '@tabler/icons-webfont/dist/tabler-icons.min.css'
import './index.css'
import App from './App.jsx'
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'))
import { NotificationsProvider } from './components/notifications.jsx'
import AdminDashboardRoute from './routes/AdminDashboardRoute.jsx'
import TeacherProtectedRoute from './routes/TeacherProtectedRoute.jsx'
import StudentProtectedRoute from './routes/StudentProtectedRoute.jsx'
import TeacherLayout from './layouts/TeacherLayout.jsx'
import StudentLayout from './layouts/StudentLayout.jsx'
import TermsGuard from './routes/TermsGuard.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import {
  SCHOOL_DOCUMENT_TITLE,
  SCHOOL_SIGN_IN_TITLE,
  setDocumentTitle,
} from './lib/documentTitle.js'

const TeacherDashboard = lazy(() => import('./pages/teachers/TeacherDashboard.jsx'))
const TeacherCurriculumPage = lazy(() => import('./pages/teachers/TeacherCurriculumPage.jsx'))
const TeacherSectionsPage = lazy(() => import('./pages/teachers/TeacherSectionsPage.jsx'))
const TeacherStudentDetails = lazy(() => import('./pages/teachers/StudentDetails.jsx'))
const TeacherSubjectsPage = lazy(() => import('./pages/teachers/TeacherSubjectsPage.jsx'))
const TeacherSubjectDetail = lazy(() => import('./pages/teachers/TeacherSubjectDetail.jsx'))
const TeacherSubjectGradebookPage = lazy(
  () => import('./pages/teachers/subject-detail/gradebook/TeacherSubjectGradebookPage.jsx'),
)
const TeacherGradeCriteriaPage = lazy(() => import('./pages/teachers/TeacherGradeCriteriaPage.jsx'))
const TeacherLessonFormPage = lazy(() => import('./pages/teachers/TeacherLessonFormPage.jsx'))
const TeacherAddMaterial = lazy(() => import('./pages/teachers/TeacherAddMaterial.jsx'))
const TeacherEditMaterial = lazy(() => import('./pages/teachers/TeacherEditMaterial.jsx'))
const TeacherTermsPage = lazy(() => import('./pages/teachers/TeacherTermsPage.jsx'))
const TeacherAnnouncementsPage = lazy(() => import('./pages/teachers/TeacherAnnouncementsPage.jsx'))
const TeacherAnnouncementView = lazy(() => import('./pages/teachers/TeacherAnnouncementView.jsx'))
const TeacherAnnouncementForm = lazy(() => import('./pages/teachers/TeacherAnnouncementForm.jsx'))
const TeacherAssignmentsPage = lazy(() => import('./pages/teachers/TeacherAssignmentsPage.jsx'))
const TeacherAssignmentForm = lazy(() => import('./pages/teachers/TeacherAssignmentForm.jsx'))
const TeacherAssignmentView = lazy(() => import('./pages/teachers/TeacherAssignmentView.jsx'))
const TeacherActivitiesPage = lazy(() => import('./pages/teachers/TeacherActivitiesPage.jsx'))
const TeacherActivityForm = lazy(() => import('./pages/teachers/TeacherActivityForm.jsx'))
const TeacherActivityView = lazy(() => import('./pages/teachers/TeacherActivityView.jsx'))
const TeacherStudyMaterialsPage = lazy(() => import('./pages/teachers/TeacherStudyMaterialsPage.jsx'))
const TeacherFacultyStudyMaterialForm = lazy(() => import('./pages/teachers/TeacherFacultyStudyMaterialForm.jsx'))
const TeacherQuizzesPage = lazy(() => import('./pages/teachers/TeacherQuizzesPage.jsx'))
const TeacherQuizForm = lazy(() => import('./pages/teachers/TeacherQuizForm.jsx'))
const TeacherQuizView = lazy(() => import('./pages/teachers/TeacherQuizView.jsx'))
const TeacherOriginalityCheckerPage = lazy(() => import('./pages/teachers/TeacherOriginalityCheckerPage.jsx'))
const TeacherOriginalityReportView = lazy(() => import('./pages/teachers/TeacherOriginalityReportView.jsx'))
const GradesOverview = lazy(() => import('./pages/teachers/GradesOverview.jsx'))
const StudentQuizzesPage = lazy(() => import('./pages/students/StudentQuizzesPage.jsx'))
const StudentQuizViewPage = lazy(() => import('./pages/students/StudentQuizViewPage.jsx'))
const StudentQuizTakePage = lazy(() => import('./pages/students/StudentQuizTakePage.jsx'))
const StudentQuizResultsPage = lazy(() => import('./pages/students/StudentQuizResultsPage.jsx'))
const StudentDashboard = lazy(() => import('./pages/students/StudentDashboard.jsx'))
const StudentSubjectsPage = lazy(() => import('./pages/students/StudentSubjectsPage.jsx'))
const StudentSubjectProfile = lazy(() => import('./pages/students/StudentSubjectProfile.jsx'))
const StudentAssignmentsPage = lazy(() => import('./pages/students/StudentAssignmentsPage.jsx'))
const StudentAssignmentView = lazy(() => import('./pages/students/StudentAssignmentView.jsx'))
const StudentActivitiesPage = lazy(() => import('./pages/students/StudentActivitiesPage.jsx'))
const StudentActivityView = lazy(() => import('./pages/students/StudentActivityView.jsx'))
const StudentAnnouncementsPage = lazy(() => import('./pages/students/StudentAnnouncementsPage.jsx'))
const StudentAnnouncementView = lazy(() => import('./pages/students/StudentAnnouncementView.jsx'))
const StudentStudyMaterialsPage = lazy(() => import('./pages/students/StudentStudyMaterialsPage.jsx'))
const StudentTermsPage = lazy(() => import('./pages/students/StudentTermsPage.jsx'))
const StudentDetailsPage = lazy(() => import('./pages/StudentDetails.jsx'))

function TeacherRouteFallback() {
  return (
    <div className="flex h-svh items-center justify-center bg-neutral-100 text-sm font-medium text-neutral-600">
      Loading…
    </div>
  )
}

function LegacyStudyQueriesEditRedirect() {
  const { id } = useParams()
  return <Navigate to={`/teacher/study-materials/${id}/edit`} replace />
}

/** Tab title for routes outside the login flow (login sets its own title). */
function AppDocumentTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    if (pathname.startsWith('/login')) return
    if (pathname === '/reset-password') {
      setDocumentTitle(SCHOOL_SIGN_IN_TITLE)
      return
    }
    setDocumentTitle(SCHOOL_DOCUMENT_TITLE)
  }, [pathname])

  return null
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <AppDocumentTitle />
      <NotificationsProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/student" element={<Navigate to="/student/dashboard" replace />} />
          <Route path="/login/*" element={<App />} />
          <Route
            path="/reset-password"
            element={
              <Suspense fallback={<TeacherRouteFallback />}>
                <ResetPassword />
              </Suspense>
            }
          />
          <Route path="/admin/*" element={<AdminDashboardRoute />} />
          <Route element={<StudentProtectedRoute />}>
            <Route element={<StudentLayout />}>
              <Route
                path="/student/terms"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <StudentTermsPage />
                  </Suspense>
                }
              />
              <Route element={<TermsGuard termsPath="/student/terms" portal="student" />}>
              <Route
                path="/student/dashboard"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <StudentDashboard />
                  </Suspense>
                }
              />
              <Route
                path="/student/subjects"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <StudentSubjectsPage />
                  </Suspense>
                }
              />
              <Route
                path="/student/subjects/:subjectId"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <StudentSubjectProfile />
                  </Suspense>
                }
              />
              <Route
                path="/student/assignments/:id"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <StudentAssignmentView />
                  </Suspense>
                }
              />
              <Route
                path="/student/assignments"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <StudentAssignmentsPage />
                  </Suspense>
                }
              />
              <Route
                path="/student/activities/:id"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <StudentActivityView />
                  </Suspense>
                }
              />
              <Route
                path="/student/activities"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <StudentActivitiesPage />
                  </Suspense>
                }
              />
              <Route
                path="/student/announcements/:id"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <StudentAnnouncementView />
                  </Suspense>
                }
              />
              <Route
                path="/student/announcements"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <StudentAnnouncementsPage />
                  </Suspense>
                }
              />
              <Route
                path="/student/study-materials"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <StudentStudyMaterialsPage />
                  </Suspense>
                }
              />
              <Route
                path="/student/quizzes/:id/view"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <StudentQuizViewPage />
                  </Suspense>
                }
              />
              <Route
                path="/student/quizzes/:id/take"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <StudentQuizTakePage />
                  </Suspense>
                }
              />
              <Route
                path="/student/quizzes/:id/results"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <StudentQuizResultsPage />
                  </Suspense>
                }
              />
              <Route
                path="/student/quizzes/:id"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <StudentQuizViewPage />
                  </Suspense>
                }
              />
              <Route
                path="/student/quizzes"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <StudentQuizzesPage />
                  </Suspense>
                }
              />
              </Route>
            </Route>
          </Route>
          <Route element={<TeacherProtectedRoute />}>
            <Route element={<TeacherLayout />}>
              <Route
                path="/teacher/terms"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherTermsPage />
                  </Suspense>
                }
              />
              <Route element={<TermsGuard termsPath="/teacher/terms" portal="faculty" />}>
              <Route
                path="/teacher/dashboard"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherDashboard />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/curriculum"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherCurriculumPage />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/sections/:sectionId/students/:studentId"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherStudentDetails />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/sections/:sectionId/students"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherSectionsPage />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/sections"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherSectionsPage />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/subjects/:subjectId/materials/add"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherAddMaterial />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/subjects/:subjectId/materials/:materialId/edit"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherEditMaterial />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/subjects/:subjectId/gradebook"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherSubjectGradebookPage />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/subjects/:subjectId/grade-criteria"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherGradeCriteriaPage />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/subjects/:subjectId/lessons/new"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherLessonFormPage mode="add" />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/subjects/:subjectId/lessons/:lessonId/edit"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherLessonFormPage mode="edit" />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/subjects/:subjectId"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherSubjectDetail />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/subjects"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherSubjectsPage />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/assignments/new"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherAssignmentForm mode="add" />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/assignments/:id/edit"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherAssignmentForm mode="edit" />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/assignments/:id"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherAssignmentView />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/assignments"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherAssignmentsPage />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/activities/new"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherActivityForm mode="add" />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/activities/:id/edit"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherActivityForm mode="edit" />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/activities/:id"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherActivityView />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/activities"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherActivitiesPage />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/announcements/new"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherAnnouncementForm mode="add" />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/announcements/:id/edit"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherAnnouncementForm mode="edit" />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/announcements/:id"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherAnnouncementView />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/announcements"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherAnnouncementsPage />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/quizzes/new"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherQuizForm mode="add" />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/quizzes/:id/edit"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherQuizForm mode="edit" />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/quizzes/:id"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherQuizView />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/quizzes"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherQuizzesPage />
                  </Suspense>
                }
              />
              <Route path="/teacher/quiz-maker" element={<Navigate to="/teacher/quizzes" replace />} />
              <Route
                path="/teacher/grades"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <GradesOverview />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/originality-checker/reports/:id"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherOriginalityReportView />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/originality-checker"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherOriginalityCheckerPage />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/study-materials/new"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherFacultyStudyMaterialForm mode="add" />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/study-materials/:id/edit"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherFacultyStudyMaterialForm mode="edit" />
                  </Suspense>
                }
              />
              <Route
                path="/teacher/study-materials"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherStudyMaterialsPage />
                  </Suspense>
                }
              />
              <Route path="/teacher/study-queries/new" element={<Navigate to="/teacher/study-materials/new" replace />} />
              <Route path="/teacher/study-queries/:id/edit" element={<LegacyStudyQueriesEditRedirect />} />
              <Route path="/teacher/study-queries" element={<Navigate to="/teacher/study-materials" replace />} />
              </Route>
            </Route>
          </Route>
          <Route
            path="/institute/student-details"
            element={
              <Suspense fallback={<TeacherRouteFallback />}>
                <StudentDetailsPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </NotificationsProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

if ('serviceWorker' in navigator && (import.meta.env.PROD || import.meta.env.VITE_ENABLE_SW === 'true')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('[sw] registered:', reg.scope))
      .catch((err) => console.warn('[sw] registration failed:', err))
  })
}

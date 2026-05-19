import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import '@tabler/icons-webfont/dist/tabler-icons.min.css'
import './index.css'
import App from './App.jsx'
import { NotificationsProvider } from './components/notifications.jsx'
import AdminDashboardRoute from './routes/AdminDashboardRoute.jsx'
import TeacherProtectedRoute from './routes/TeacherProtectedRoute.jsx'
import StudentProtectedRoute from './routes/StudentProtectedRoute.jsx'
import TeacherLayout from './layouts/TeacherLayout.jsx'

const TeacherDashboard = lazy(() => import('./pages/teachers/TeacherDashboard.jsx'))
const TeacherCurriculumPage = lazy(() => import('./pages/teachers/TeacherCurriculumPage.jsx'))
const TeacherSectionsPage = lazy(() => import('./pages/teachers/TeacherSectionsPage.jsx'))
const TeacherStudentDetails = lazy(() => import('./pages/teachers/StudentDetails.jsx'))
const TeacherSubjectsPage = lazy(() => import('./pages/teachers/TeacherSubjectsPage.jsx'))
const TeacherSubjectProfile = lazy(() => import('./pages/teachers/TeacherSubjectProfile.jsx'))
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
const StudentQuizzesPage = lazy(() => import('./pages/students/StudentQuizzesPage.jsx'))
const StudentQuizPage = lazy(() => import('./pages/students/StudentQuizPage.jsx'))
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <NotificationsProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login/*" element={<App />} />
          <Route path="/admin/*" element={<AdminDashboardRoute />} />
          <Route element={<StudentProtectedRoute />}>
            <Route
              path="/student/quizzes/:id"
              element={
                <Suspense fallback={<TeacherRouteFallback />}>
                  <StudentQuizPage />
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
          <Route element={<TeacherProtectedRoute />}>
            <Route element={<TeacherLayout />}>
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
                path="/teacher/terms"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherTermsPage />
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
                path="/teacher/subjects/:subjectId"
                element={
                  <Suspense fallback={<TeacherRouteFallback />}>
                    <TeacherSubjectProfile />
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
  </StrictMode>,
)

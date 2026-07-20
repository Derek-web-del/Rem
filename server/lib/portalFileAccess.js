/** Institute staff who manage roster records and need protected upload access. */
export function isInstituteStaffRole(role) {
  const r = String(role || '').trim().toLowerCase()
  return r === 'admin' || r === 'registrar'
}

export function canAccessFacultyPhotoFiles(role) {
  const r = String(role || '').trim().toLowerCase()
  return isInstituteStaffRole(r) || r === 'teacher' || r === 'faculty' || r === 'student'
}

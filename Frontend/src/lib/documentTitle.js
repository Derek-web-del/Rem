export const SCHOOL_DOCUMENT_TITLE =
  import.meta.env.VITE_SCHOOL_PAGE_TITLE?.trim() || 'Glendale High School'

export const SCHOOL_SIGN_IN_TITLE = `${SCHOOL_DOCUMENT_TITLE} — Sign in`

export function setDocumentTitle(title) {
  if (typeof document !== 'undefined' && title) {
    document.title = title
  }
}

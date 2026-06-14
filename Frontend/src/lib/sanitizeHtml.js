import DOMPurify from 'dompurify'

/** Lesson / report HTML allowlist — browser-only (uses window). */
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  'ol',
  'ul',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'span',
  'div',
  'table',
  'tr',
  'td',
  'th',
  'mark',
]

const ALLOWED_ATTR = ['class', 'style', 'href', 'target', 'rel']

/**
 * Sanitize rich HTML before dangerouslySetInnerHTML or contentEditable innerHTML.
 * @param {unknown} dirty
 * @returns {string}
 */
export function sanitizeHtml(dirty) {
  if (dirty == null || dirty === '') return ''
  return DOMPurify.sanitize(String(dirty), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  })
}

/**
 * Escape plain text before inserting into HTML (e.g. plagiarism highlight wrappers).
 * @param {unknown} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

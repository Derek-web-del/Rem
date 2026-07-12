import { fileTypeFromBuffer } from 'file-type'

/**
 * Verify buffer magic bytes match allowed MIME types (after extension/MIME header checks).
 * @param {Buffer} buffer
 * @param {string[]} allowedMimes e.g. ['application/pdf']
 * @returns {string} empty if ok, else error message
 */
export async function verifyUploadMagicBytes(buffer, allowedMimes) {
  if (!buffer?.length) return 'File is required.'
  const allowed = new Set((allowedMimes || []).map((m) => String(m).toLowerCase()))
  if (!allowed.size) return ''

  try {
    const detected = await fileTypeFromBuffer(buffer)
    if (!detected?.mime) {
      return 'Could not verify file type from content.'
    }
    if (!allowed.has(String(detected.mime).toLowerCase())) {
      return 'File content does not match the allowed type.'
    }
    return ''
  } catch {
    return 'Could not verify file type from content.'
  }
}

export const PDF_MIMES = ['application/pdf']

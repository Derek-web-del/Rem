import {

  SUBJECT_IMAGE_PLACEHOLDER,

  SUBJECT_IMAGE_MAP,

  PREDEFINED_SUBJECT_NAMES,

  normalizeSubjectImageKey,

  resolveSubjectImageFromMap,

  subjectImages,

} from '../../../shared/subjectImages.js'



export {

  SUBJECT_IMAGE_PLACEHOLDER,

  SUBJECT_IMAGE_MAP,

  PREDEFINED_SUBJECT_NAMES,

  normalizeSubjectImageKey,

  resolveSubjectImageFromMap,

  subjectImages,

}



/**

 * Resolve display URL for a subject cover image.

 * @param {string|object} subjectOrName — subject row or subject name

 * @param {{ apiUrlFn?: (path: string) => string }} [options]

 */

export function subjectImageDisplaySrc(subjectOrName, { apiUrlFn } = {}) {

  const resolve = typeof apiUrlFn === 'function' ? apiUrlFn : (p) => p



  let name = ''

  let stored = ''



  if (subjectOrName && typeof subjectOrName === 'object') {

    name = String(subjectOrName.subjectName ?? subjectOrName.subject_name ?? '').trim()

    stored = String(

      subjectOrName.subjectPhoto ??

        subjectOrName.subject_photo ??

        subjectOrName.cover_image_url ??

        '',

    ).trim()

  } else {

    name = String(subjectOrName ?? '').trim()

  }



  const path = stored || resolveSubjectImageFromMap(name)

  if (!path) return resolve(SUBJECT_IMAGE_PLACEHOLDER)

  if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {

    return path

  }

  if (path.startsWith('/uploads/')) return resolve(path)

  return path

}



import fs from 'node:fs'
import path from 'node:path'

const root = path.join(import.meta.dirname, '..')
const lines = fs.readFileSync(path.join(root, 'server/api/state.js'), 'utf8').split(/\r?\n/)

const head = lines.slice(0, 45).join('\n').replace(
  "from './logs.js'",
  "from '../logs.js'",
)

const createFnStart = lines.slice(1415, 1608).join('\n') // 1416-1608
const createFnTail = `  registerStateRoutes(router, { pool })
  registerCurriculumRoutes(router, { pool, auth })
  registerSubjectsRoutes(router, { pool, auth })
  registerAnnouncementsRoutes(router, { pool, auth })
  registerFacultyRoutes(router, { pool, auth })
  registerStudentsRoutes(router, { pool, auth })
  registerArchiveRoutes(router, { pool, auth })

  return {
    router,
    close: async () => {
      /* Shared pool: closed by closePgPool() from server/index.js */
    },
  }
}
`

const imports = `import { registerStateRoutes } from './stateRoutes.js'
import { registerCurriculumRoutes } from './curriculumRouter.js'
import { registerSubjectsRoutes } from './subjectsRouter.js'
import { registerAnnouncementsRoutes } from './announcementsRouter.js'
import { registerFacultyRoutes } from './facultyRouter.js'
import { registerStudentsRoutes } from './studentsRouter.js'
import { registerArchiveRoutes } from './archiveRouter.js'
import {
  ensureSchema,
  ensureRecordIntegrityColumns,
  getFacultiesColumnSet,
  facultiesColumnSetCache,
  backfillMirrorTables,
  logStatePostgresError,
} from './shared.js'
`

const indexContent = `${head}
${imports}

${createFnStart}
${createFnTail}
`

fs.writeFileSync(path.join(root, 'server/api/state/index.js'), indexContent)
console.log('index.js written')

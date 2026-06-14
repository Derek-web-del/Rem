/**

 * Link students.auth_user_id to Better Auth "user" rows by matching email.

 *

 *   node scripts/repairStudentAuthLinks.js

 *

 * Requires DATABASE_URL in the environment.

 */

import '../server/env-bootstrap.js'

import { getPgPool } from '../server/pgPool.js'

import { repairStudentAuthLinks } from '../server/lib/repairStudentAuthLinks.js'



async function main() {

  const pool = getPgPool()

  if (!pool) {

    console.error('DATABASE_URL is not configured.')

    process.exit(1)

  }



  const stats = await repairStudentAuthLinks(pool)

  console.log('Student auth link repair complete:', stats)

}



main().catch((e) => {

  console.error(e)

  process.exit(1)

})



import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isNavAllowedForRole,
  homePathForRole,
  portalMatchesUserRole,
  REGISTRAR_ONLY_NAV_IDS,
  ADMIN_ONLY_NAV_IDS,
} from '../Frontend/src/lib/roleAccess.js'
import { requireAdminSession, requireRegistrarSession } from '../server/api/state/shared.js'

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
  return res
}

describe('registrar role access helpers', () => {
  it('homePathForRole sends registrar to students', () => {
    assert.equal(homePathForRole('registrar'), '/admin/students')
  })

  it('portalMatchesUserRole pairs REGISTRAR portal with registrar role', () => {
    assert.equal(portalMatchesUserRole('REGISTRAR', 'registrar'), true)
    assert.equal(portalMatchesUserRole('REGISTRAR', 'admin'), false)
    assert.equal(portalMatchesUserRole('INSTITUTE', 'registrar'), false)
  })

  it('isNavAllowedForRole splits admin vs registrar nav', () => {
    for (const id of REGISTRAR_ONLY_NAV_IDS) {
      assert.equal(isNavAllowedForRole(id, 'registrar'), true, `registrar should access ${id}`)
      assert.equal(isNavAllowedForRole(id, 'admin'), false, `admin should not access ${id}`)
    }
    for (const id of ADMIN_ONLY_NAV_IDS) {
      assert.equal(isNavAllowedForRole(id, 'admin'), true, `admin should access ${id}`)
      assert.equal(isNavAllowedForRole(id, 'registrar'), false, `registrar should not access ${id}`)
    }
    assert.equal(isNavAllowedForRole('dashboard', 'admin'), true)
    assert.equal(isNavAllowedForRole('dashboard', 'registrar'), true)
  })
})

describe('requireAdminSession vs requireRegistrarSession', () => {
  it('requireAdminSession rejects registrar role', async () => {
    const req = { headers: {} }
    const res = mockRes()
    const auth = {
      api: {
        getSession: async () => ({ user: { id: 'u1', role: 'registrar' } }),
      },
    }
    const session = await requireAdminSession(req, res, auth)
    assert.equal(session, null)
    assert.equal(res.statusCode, 403)
  })

  it('requireRegistrarSession rejects admin role', async () => {
    const req = { headers: {} }
    const res = mockRes()
    const auth = {
      api: {
        getSession: async () => ({ user: { id: 'u1', role: 'admin' } }),
      },
    }
    const session = await requireRegistrarSession(req, res, auth)
    assert.equal(session, null)
    assert.equal(res.statusCode, 403)
  })

  it('requireRegistrarSession accepts registrar role when terms exempt', async () => {
    const req = { headers: {}, path: '/api/v1/students', method: 'GET' }
    const res = mockRes()
    const auth = {
      api: {
        getSession: async () => ({ user: { id: 'u1', role: 'registrar' } }),
      },
    }
    const session = await requireRegistrarSession(req, res, auth)
    assert.ok(session?.user?.id === 'u1')
    assert.equal(res.statusCode, 200)
  })
})

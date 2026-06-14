import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveGoogleRedirectUri,
  getGoogleOAuthScopes,
  getGoogleClientIdSuffix,
  tokenHasDriveFileScope,
  getMissingDriveScopes,
  isInsufficientScopeError,
} from '../server/lib/googleDriveUpload.js'

const envSnapshot = { ...process.env }

describe('googleDrive config', () => {
  beforeEach(() => {
    process.env = { ...envSnapshot }
  })

  afterEach(() => {
    process.env = { ...envSnapshot }
  })

  it('resolveGoogleRedirectUri uses explicit GOOGLE_REDIRECT_URI when set', () => {
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:5173/api/auth/google/callback'
    process.env.BETTER_AUTH_URL = 'http://localhost:9999'
    assert.equal(resolveGoogleRedirectUri(), 'http://localhost:5173/api/auth/google/callback')
  })

  it('resolveGoogleRedirectUri derives from BETTER_AUTH_URL when env unset', () => {
    delete process.env.GOOGLE_REDIRECT_URI
    process.env.BETTER_AUTH_URL = 'http://localhost:5173'
    assert.equal(resolveGoogleRedirectUri(), 'http://localhost:5173/api/auth/google/callback')
  })

  it('resolveGoogleRedirectUri strips trailing slash from BETTER_AUTH_URL', () => {
    delete process.env.GOOGLE_REDIRECT_URI
    process.env.BETTER_AUTH_URL = 'http://localhost:5173/'
    assert.equal(resolveGoogleRedirectUri(), 'http://localhost:5173/api/auth/google/callback')
  })

  it('getGoogleOAuthScopes includes drive.file and userinfo.email', () => {
    const scopes = getGoogleOAuthScopes()
    assert.ok(scopes.includes('https://www.googleapis.com/auth/drive.file'))
    assert.ok(scopes.includes('https://www.googleapis.com/auth/userinfo.email'))
  })

  it('getGoogleClientIdSuffix returns last 8 chars of client id', () => {
    process.env.GOOGLE_CLIENT_ID = '1083706561271-abc.apps.googleusercontent.com'
    const suffix = getGoogleClientIdSuffix()
    assert.equal(suffix, process.env.GOOGLE_CLIENT_ID.slice(-8))
    assert.equal(suffix.length, 8)
  })
})

describe('googleDrive scope helpers', () => {
  it('tokenHasDriveFileScope accepts drive.file and full drive', () => {
    assert.equal(
      tokenHasDriveFileScope('https://www.googleapis.com/auth/drive.file openid'),
      true,
    )
    assert.equal(tokenHasDriveFileScope('https://www.googleapis.com/auth/drive'), true)
    assert.equal(tokenHasDriveFileScope('https://www.googleapis.com/auth/userinfo.email'), false)
    assert.equal(tokenHasDriveFileScope(null), false)
  })

  it('getMissingDriveScopes lists drive.file when absent', () => {
    assert.deepEqual(getMissingDriveScopes('openid email'), [
      'https://www.googleapis.com/auth/drive.file',
    ])
    assert.deepEqual(getMissingDriveScopes('https://www.googleapis.com/auth/drive.file'), [])
  })

  it('isInsufficientScopeError detects Google scope errors', () => {
    assert.equal(
      isInsufficientScopeError(new Error('Request had insufficient authentication scopes.')),
      true,
    )
    assert.equal(isInsufficientScopeError(new Error('Network timeout')), false)
  })
})

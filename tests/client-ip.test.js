import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveClientIp, resolveRateLimitKey, clientIpDebug } from '../server/lib/clientIp.js'

test('resolveClientIp prefers cf-connecting-ip (Cloudflare)', () => {
  const req = {
    ip: '10.0.0.1',
    headers: {
      'cf-connecting-ip': '203.0.113.50',
      'x-forwarded-for': '198.51.100.2, 10.0.0.1',
    },
    socket: { remoteAddress: '127.0.0.1' },
  }
  assert.equal(resolveClientIp(req), '203.0.113.50')
})

test('resolveClientIp falls back to x-forwarded-for first hop', () => {
  const req = {
    ip: '10.0.0.1',
    headers: { 'x-forwarded-for': '198.51.100.9, 10.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
  }
  assert.equal(resolveClientIp(req), '198.51.100.9')
})

test('resolveClientIp uses req.ip when no proxy headers', () => {
  const req = { ip: '192.0.2.1', headers: {}, socket: { remoteAddress: '127.0.0.1' } }
  assert.equal(resolveClientIp(req), '192.0.2.1')
})

test('resolveRateLimitKey uses session cookie when logged in', () => {
  const req = {
    ip: '203.0.113.1',
    headers: {
      cookie: 'better-auth.session_token=abc123sessiontoken; other=1',
      'cf-connecting-ip': '203.0.113.1',
    },
    socket: {},
  }
  assert.equal(resolveRateLimitKey(req), 'sess:abc123sessiontoken')
})

test('resolveRateLimitKey falls back to IP when no session', () => {
  const req = {
    ip: '10.0.0.1',
    headers: { 'cf-connecting-ip': '203.0.113.50' },
    socket: {},
  }
  assert.equal(resolveRateLimitKey(req), 'ip:203.0.113.50')
})

test('clientIpDebug returns all fields', () => {
  const req = {
    ip: '10.0.0.1',
    headers: { 'cf-connecting-ip': '203.0.113.50' },
    socket: {},
  }
  const d = clientIpDebug(req)
  assert.equal(d.resolved, '203.0.113.50')
  assert.equal(d.req_ip, '10.0.0.1')
  assert.equal(d.cf_connecting_ip, '203.0.113.50')
})

import { describe, expect, it } from 'vitest'
import { safeRedirect, withRedirect } from '@/auth/redirect'

// AUTH-01 is the load-bearing parity requirement; these guard the redirect math.
describe('safeRedirect', () => {
  it('decodes and honours a root-relative path', () => {
    expect(safeRedirect('%2Felection%2Fabc%2Fvote')).toBe('/election/abc/vote')
  })

  it('passes through an already-decoded root-relative path', () => {
    expect(safeRedirect('/dashboard')).toBe('/dashboard')
  })

  it('falls back to /dashboard for null / empty input', () => {
    expect(safeRedirect(null)).toBe('/dashboard')
    expect(safeRedirect(undefined)).toBe('/dashboard')
    expect(safeRedirect('')).toBe('/dashboard')
  })

  it('rejects absolute off-origin URLs', () => {
    expect(safeRedirect('https://evil.com')).toBe('/dashboard')
    expect(safeRedirect(encodeURIComponent('https://evil.com'))).toBe('/dashboard')
  })

  it('rejects protocol-relative URLs (open-redirect hardening over Flutter)', () => {
    expect(safeRedirect('//evil.com')).toBe('/dashboard')
    expect(safeRedirect(encodeURIComponent('//evil.com'))).toBe('/dashboard')
    expect(safeRedirect('/\\evil.com')).toBe('/dashboard')
  })

  it('falls back when the param is malformed percent-encoding', () => {
    expect(safeRedirect('%')).toBe('/dashboard')
  })

  it('refuses auth routes as a destination (prevents redirect loops)', () => {
    expect(safeRedirect('/login')).toBe('/dashboard')
    expect(safeRedirect('/signup')).toBe('/dashboard')
    expect(safeRedirect('/forgot-password')).toBe('/dashboard')
    // Nested redirect param targeting /login should also be refused.
    expect(safeRedirect(encodeURIComponent('/login?redirect=%2Fdashboard'))).toBe('/dashboard')
  })
})

describe('withRedirect', () => {
  it('appends an encoded redirect param when present', () => {
    expect(withRedirect('/signup', '/election/abc/vote')).toBe(
      '/signup?redirect=%2Felection%2Fabc%2Fvote',
    )
  })

  it('returns the bare path when there is no redirect', () => {
    expect(withRedirect('/signup', null)).toBe('/signup')
    expect(withRedirect('/login', undefined)).toBe('/login')
  })
})

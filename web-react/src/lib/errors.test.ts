import { describe, expect, it } from 'vitest'

import { friendlyError, isUniqueViolation } from '@/lib/errors'

describe('isUniqueViolation', () => {
  it('detects the Postgres unique-violation code (CRT-02)', () => {
    expect(isUniqueViolation({ code: '23505', message: 'duplicate key' })).toBe(
      true,
    )
  })

  it('ignores other error codes and non-errors', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false)
    expect(isUniqueViolation(new Error('boom'))).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation('23505')).toBe(false)
  })
})

describe('friendlyError — DET-05 (never leak raw Supabase text)', () => {
  it('returns the caller fallback for an arbitrary error', () => {
    const raw = new Error(
      'new row violates row-level security policy for table "elections"',
    )
    expect(friendlyError(raw, 'Error opening election. Please try again.')).toBe(
      'Error opening election. Please try again.',
    )
  })

  it('returns a network message for fetch failures', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toBe(
      'Network error. Check your connection and try again.',
    )
    expect(friendlyError({ message: 'NetworkError when attempting fetch' })).toBe(
      'Network error. Check your connection and try again.',
    )
  })

  it('uses a generic default when no fallback is given', () => {
    expect(friendlyError({ code: 'PGRST301' })).toBe(
      'Something went wrong. Please try again.',
    )
  })
})

import { describe, expect, it } from 'vitest'
import { friendlyAuthError } from '@/auth/errors'

describe('friendlyAuthError', () => {
  it.each([
    ['over_email_send_rate_limit', 'Too many requests. Please wait a minute and try again.'],
    ['otp_expired', 'That code is invalid or expired. Request a new one.'],
    ['invalid_otp', 'That code is invalid or expired. Request a new one.'],
    ['token_not_found', 'That code is invalid or expired. Request a new one.'],
    ['same_password', 'New password must be different from the old one.'],
    ['weak_password', 'Password is too weak. Use at least 6 characters.'],
  ])('maps the %s code to a friendly message', (code, expected) => {
    expect(friendlyAuthError({ code, message: 'raw' })).toBe(expected)
  })

  it('falls back to the raw message for an unmapped code', () => {
    expect(friendlyAuthError({ code: 'unexpected', message: 'Something broke' })).toBe(
      'Something broke',
    )
  })

  it('uses the message when there is no code', () => {
    expect(friendlyAuthError({ message: 'Invalid login credentials' })).toBe(
      'Invalid login credentials',
    )
  })

  it('handles plain Errors and non-objects', () => {
    expect(friendlyAuthError(new Error('boom'))).toBe('boom')
    expect(friendlyAuthError('nope')).toBe('nope')
  })
})

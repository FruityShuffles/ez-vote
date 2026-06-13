// Error helpers for the data layer. The guiding rule (parity item DET-05, from
// #72/#73): a raw Supabase/Postgres error string — table names, RLS policy
// names, constraint names, query fragments — must never reach the UI. Surfaces
// pass a context-specific `fallback`; we never interpolate the original message.

/**
 * True when the error is a Postgres unique-violation (`SQLSTATE 23505`). Used to
 * turn a duplicate-candidate insert into a friendly message without string-
 * matching the index name (parity item CRT-02).
 */
export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: unknown }).code === '23505'
  )
}

/**
 * A safe, user-facing message for a failed operation. Distinguishes a network
 * failure (worth telling the user to check their connection) from everything
 * else, which gets the caller's `fallback`. Never returns the raw error text.
 */
export function friendlyError(
  e: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  // supabase-js surfaces offline / DNS failures as a TypeError "Failed to fetch".
  if (
    e instanceof TypeError ||
    (typeof e === 'object' &&
      e !== null &&
      'message' in e &&
      typeof (e as { message?: unknown }).message === 'string' &&
      /failed to fetch|network/i.test((e as { message: string }).message))
  ) {
    return 'Network error. Check your connection and try again.'
  }
  return fallback
}

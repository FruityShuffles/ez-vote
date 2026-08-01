import { describe, expect, it } from 'vitest'

const routeSources = {
  ...import.meta.glob('./routes/**/*.tsx', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
  ...import.meta.glob('./components/elections/ElectionDetail.tsx', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
} as Record<string, string>

describe('route layout ownership', () => {
  it('keeps AppShell out of route screens', () => {
    const offenders = Object.entries(routeSources)
      .filter(([, source]) =>
        /from\s+['"]@\/components\/ui\/app-shell['"]/.test(source),
      )
      .map(([path]) => path)

    expect(offenders).toEqual([])
  })
})

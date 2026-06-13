import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  applyReorder,
  autoFptpFromScores,
  buildPayload,
  deriveApprovalsFromRanking,
  deriveApprovalsFromScores,
  deriveRanking,
  rebuildTieBreaksFromOrder,
  syncTieBreaks,
} from '@shared/derive'

// The React build imports the M23 derivation module in place from
// `supabase/functions/_shared/derive.ts` (one source of truth, also used by the
// Deno edge functions). This re-runs the same cross-language golden corpus
// through Vitest so a regression is caught in the React toolchain too, not only
// under Deno — proving the ballot port (M10) derives exactly what Flutter does.
// Mirrors the dispatch in `supabase/functions/_shared/derive.test.ts`.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

interface Fixture {
  name: string
  op: string
  description?: string
  input: Json
  expected: Json
}

function run(op: string, input: Json): unknown {
  switch (op) {
    case 'deriveRanking':
      return deriveRanking(input.scores, input.tieBreaks, input.candidateIds)
    case 'deriveApprovalsFromScores':
      return deriveApprovalsFromScores(
        input.scores,
        input.candidateIds,
        input.cutoff,
      )
    case 'deriveApprovalsFromRanking':
      return deriveApprovalsFromRanking(input.ranking, input.topK)
    case 'syncTieBreaks':
      return syncTieBreaks(input.tieBreaks, input.scores, input.candidateIds)
    case 'rebuildTieBreaksFromOrder':
      return rebuildTieBreaksFromOrder(input.order, input.scores)
    case 'applyReorder':
      return applyReorder(
        input.scores,
        input.displayOrder,
        input.oldIndex,
        input.newIndex,
      )
    case 'autoFptpFromScores':
      return autoFptpFromScores(
        input.scores,
        input.candidateIds,
        input.currentChoice,
      )
    case 'buildPayload':
      return buildPayload(
        input.template,
        input.state,
        input.candidateIds,
        input.includeFptp,
      )
    default:
      throw new Error(`Unknown derivation op: ${op}`)
  }
}

// Vitest runs with the web-react root as cwd; the shared fixtures sit one level
// up alongside the edge functions.
const fixturesDir = resolve(
  process.cwd(),
  '../supabase/functions/_shared/fixtures/derivation',
)

const fixtureFiles = readdirSync(fixturesDir)
  .filter((name) => name.endsWith('.json'))
  .sort()

describe('M23 derivation corpus (cross-language golden fixtures)', () => {
  it('has a non-empty fixture corpus', () => {
    expect(fixtureFiles.length).toBeGreaterThan(0)
  })

  for (const fileName of fixtureFiles) {
    const fixture = JSON.parse(
      readFileSync(`${fixturesDir}/${fileName}`, 'utf8'),
    ) as Fixture
    it(`${fixture.op}: ${fixture.name}`, () => {
      expect(run(fixture.op, fixture.input)).toEqual(fixture.expected)
    })
  }
})

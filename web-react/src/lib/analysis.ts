import type { ElectionResult, ResultData } from '@/lib/results'
import { winnersOf } from '@/lib/results'

// Client-side port of `lib/domain/services/election_analysis_service.dart` (M16,
// parity item ANL-01). Pure derivation from the already-fetched `result_data` —
// no schema or endpoint changes (the migration's no-backend-change non-goal), and
// mechanism-identical to the frozen Flutter app, which also computes this
// client-side. Kept UI-free so it's unit-testable without React: `icon` is a
// string key, resolved to a lucide component in the AnalysisCard.
//
// User-visible strings (headlines, summaries, insight bodies) are ported
// character-for-character from the Dart source — including its curly apostrophes
// (’) and em-dashes (—) — so the rendered text matches Flutter exactly.

/** Stable key for the lucide icon an insight renders with (resolved in the UI). */
export type InsightIcon =
  | 'compare-arrows'
  | 'group-remove'
  | 'swap-vert'
  | 'pie-chart'
  | 'compare'

export interface AnalysisInsight {
  title: string
  body: string
  icon: InsightIcon
}

export interface ElectionAnalysis {
  headline: string
  summary: string
  insights: AnalysisInsight[]
}

/** Winner names for a result, matching the Dart extraction (`winners` ?? [winner]). */
function winnersForResult(data: ResultData): string[] {
  return winnersOf(data)
}

const ALGO_LABELS: Record<string, string> = {
  approval: 'Approval Voting',
  irv: 'IRV',
  star: 'STAR Voting',
  fptp: 'First Past The Post',
}

function algoLabel(algorithm: string): string {
  return ALGO_LABELS[algorithm] ?? algorithm
}

const EDUCATIONAL_MESSAGES: Record<string, string> = {
  approval:
    'Approval voting selects the candidate acceptable to the most voters, favoring broadly liked candidates over polarizing ones.',
  irv: 'Instant Runoff Voting eliminates the least popular candidate each round, finding the candidate with the strongest overall preference.',
  star: 'STAR voting combines scoring with an automatic runoff, balancing intensity of support with breadth.',
  fptp: 'First Past the Post counts first choices — the most common method but vulnerable to vote splitting.',
}

function educationalMessage(algorithm: string): string {
  return EDUCATIONAL_MESSAGES[algorithm] ?? `Results for ${algorithm}.`
}

/** True when two name sets contain exactly the same members. */
function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

/**
 * Generate cross-method comparison insights from computed results. Mirrors
 * `analyzeResults` in the Dart service: verdict (consensus) detection plus a set
 * of conditional educational insights.
 */
export function analyzeResults(results: ElectionResult[]): ElectionAnalysis {
  if (results.length === 0) {
    return {
      headline: 'No results',
      summary: 'No results have been computed yet.',
      insights: [],
    }
  }

  // Step A: winners per algorithm (only algorithms that produced a winner).
  const winnersMap: Record<string, string[]> = {}
  for (const r of results) {
    const winners = winnersForResult(r.result_data)
    if (winners.length > 0) {
      winnersMap[r.algorithm] = winners
    }
  }

  // Single-algorithm case → educational headline, no insights.
  if (results.length === 1) {
    const algo = results[0].algorithm
    return {
      headline: `${algoLabel(algo)} result`,
      summary: educationalMessage(algo),
      insights: [],
    }
  }

  // Step B: verdict, excluding FPTP from the consensus count.
  const nonFptp: Record<string, string[]> = { ...winnersMap }
  delete nonFptp.fptp
  const nonFptpEntries = Object.entries(nonFptp)
  const allWinnerSets = nonFptpEntries.map(([, w]) => new Set(w))

  let verdict: 'single' | 'allAgree' | 'mostAgree' | 'allDisagree'
  let consensusWinner: string | null = null

  if (allWinnerSets.length <= 1) {
    // 0 or 1 non-FPTP algorithm — check all including FPTP.
    const allEntries = Object.entries(winnersMap)
    if (allEntries.length <= 1) {
      verdict = 'single'
    } else {
      const allSets = allEntries.map(([, w]) => new Set(w))
      const first = allSets[0]
      if (allSets.every((s) => setsEqual(s, first))) {
        verdict = 'allAgree'
        consensusWinner = [...first][0]
      } else {
        verdict = 'mostAgree'
      }
    }
  } else {
    const first = allWinnerSets[0]
    const allSame = allWinnerSets.every((s) => setsEqual(s, first))
    if (allSame) {
      verdict = 'allAgree'
      consensusWinner = [...first][0]
    } else {
      // Check if most agree.
      const winCounts: Record<string, number> = {}
      for (const [, winners] of nonFptpEntries) {
        for (const w of winners) {
          winCounts[w] = (winCounts[w] ?? 0) + 1
        }
      }
      const maxWins = Math.max(...Object.values(winCounts))
      const leaders = Object.entries(winCounts).filter(([, v]) => v === maxWins)
      if (leaders.length === 1 && maxWins > 1) {
        verdict = 'mostAgree'
        consensusWinner = leaders[0][0]
      } else {
        verdict = 'allDisagree'
      }
    }
  }

  // Step C: headline + summary.
  let headline: string
  let summary: string
  switch (verdict) {
    case 'allAgree':
      headline = `Consensus: ${consensusWinner} wins across all methods`
      summary = `${consensusWinner} won under every voting method, suggesting a strong, broadly supported choice.`
      break
    case 'mostAgree':
      if (consensusWinner != null) {
        const agreeing = nonFptpEntries.filter(([, w]) =>
          w.includes(consensusWinner as string),
        ).length
        const disagreeing = nonFptpEntries.filter(
          ([, w]) => !w.includes(consensusWinner as string),
        )
        const disagreeDesc = disagreeing
          .map(([algo, w]) => `${algoLabel(algo)} selected ${w[0]}`)
          .join('; ')
        headline = `Most methods agree: ${consensusWinner}`
        summary =
          disagreeDesc.length > 0
            ? `${consensusWinner} won ${agreeing} of ${nonFptpEntries.length} methods. ${disagreeDesc}.`
            : `${consensusWinner} won ${agreeing} of ${nonFptpEntries.length} methods.`
      } else {
        headline = 'Methods partially agree'
        summary =
          'Some voting methods chose the same winner, but not all agree on a single candidate.'
      }
      break
    case 'allDisagree':
      headline = 'Each method chose a different winner'
      summary =
        'No single candidate won across multiple methods — the outcome depends on how preferences are counted.'
      break
    default: {
      const algo = results[0].algorithm
      headline = `${algoLabel(algo)} result`
      summary = educationalMessage(algo)
    }
  }

  // Step D: conditional insights.
  const insights: AnalysisInsight[] = []
  const resultMap: Record<string, ElectionResult> = {}
  for (const r of results) resultMap[r.algorithm] = r

  tryFptpDiverges(resultMap, winnersMap, insights)
  trySpoilerEffect(resultMap, winnersMap, insights)
  tryStarRunoffFlip(resultMap, insights)
  tryApprovalBreadth(resultMap, winnersMap, insights)
  tryIrvVsApprovalDisagree(resultMap, winnersMap, insights)

  return { headline, summary, insights }
}

// --- Insight generators ---

function tryFptpDiverges(
  resultMap: Record<string, ElectionResult>,
  winnersMap: Record<string, string[]>,
  insights: AnalysisInsight[],
): void {
  const fptpWinners = winnersMap.fptp
  if (fptpWinners == null || fptpWinners.length === 0) return

  const fptpWinner = fptpWinners[0]
  const nonFptp: Record<string, string[]> = { ...winnersMap }
  delete nonFptp.fptp
  const nonFptpValues = Object.values(nonFptp)
  if (nonFptpValues.length === 0) return

  // FPTP winner differs from ALL non-FPTP winners.
  const allDiffer = nonFptpValues.every((winners) => !winners.includes(fptpWinner))
  if (!allDiffer) return

  const fptpTallies = resultMap.fptp.result_data.tallies ?? {}
  const fptpTally = fptpTallies[fptpWinner] ?? '?'

  // Most common non-FPTP winner.
  const otherWinnerCounts: Record<string, number> = {}
  for (const winners of nonFptpValues) {
    for (const w of winners) {
      otherWinnerCounts[w] = (otherWinnerCounts[w] ?? 0) + 1
    }
  }
  const otherWinner = Object.entries(otherWinnerCounts).sort(
    (a, b) => b[1] - a[1],
  )[0][0]

  const methodNames = Object.keys(nonFptp).map(algoLabel).join(' and ')

  insights.push({
    icon: 'compare-arrows',
    title: 'Plurality chose a different winner',
    body:
      `Under simple plurality, ${fptpWinner} won with ${fptpTally} first-choice votes. ` +
      `But ${methodNames} selected ${otherWinner} instead. ` +
      'This is common when similar candidates split the vote — ' +
      'ranked and rated methods are designed to look beyond just first choices.',
  })
}

function trySpoilerEffect(
  resultMap: Record<string, ElectionResult>,
  winnersMap: Record<string, string[]>,
  insights: AnalysisInsight[],
): void {
  const irv = resultMap.irv
  const fptp = resultMap.fptp
  if (irv == null || fptp == null) return

  const fptpWinner = winnersMap.fptp?.[0]
  const irvWinner = winnersMap.irv?.[0]
  if (fptpWinner == null || irvWinner == null) return
  if (fptpWinner === irvWinner) return

  // FPTP winner was also the IRV first-round leader?
  const rounds = irv.result_data.rounds ?? []
  if (rounds.length === 0) return
  const counts = rounds[0].counts ?? {}
  const countEntries = Object.entries(counts)
  if (countEntries.length === 0) return

  const firstRoundLeader = [...countEntries].sort((a, b) => b[1] - a[1])[0]
  if (firstRoundLeader[0] !== fptpWinner) return

  insights.push({
    icon: 'group-remove',
    title: 'Potential spoiler effect',
    body:
      `${fptpWinner} led in the first round of IRV with ${firstRoundLeader[1]} votes — ` +
      'matching the plurality result. But after eliminating weaker candidates and ' +
      `redistributing their supporters’ preferences, ${irvWinner} emerged as the winner. ` +
      `A candidate who splits the vote with ${fptpWinner} may have acted as a spoiler under plurality rules.`,
  })
}

function tryStarRunoffFlip(
  resultMap: Record<string, ElectionResult>,
  insights: AnalysisInsight[],
): void {
  const star = resultMap.star
  if (star == null) return

  const data = star.result_data
  const scores = data.scores ?? {}
  const scoreEntries = Object.entries(scores)
  if (scoreEntries.length === 0) return

  const sorted = [...scoreEntries].sort((a, b) => b[1] - a[1])
  const scoreLeader = sorted[0][0]
  const scoreLeaderScore = sorted[0][1]

  const winners = winnersForResult(data)
  if (winners.length === 0) return
  const starWinner = winners[0]
  if (scoreLeader === starWinner) return

  const runoff = data.runoff ?? {}
  const prefCount = runoff[starWinner] ?? '?'
  const scoreLeaderPrefCount = runoff[scoreLeader] ?? '?'

  insights.push({
    icon: 'swap-vert',
    title: 'STAR runoff changed the outcome',
    body:
      `${scoreLeader} had the highest total score (${scoreLeaderScore} points), ` +
      `but in the automatic head-to-head runoff, ${starWinner} was preferred by ` +
      `${prefCount} voters vs ${scoreLeaderPrefCount}. ` +
      'STAR’s two-phase design prevents a candidate with intense but narrow support ' +
      'from winning over one preferred by the broader group.',
  })
}

function tryApprovalBreadth(
  resultMap: Record<string, ElectionResult>,
  winnersMap: Record<string, string[]>,
  insights: AnalysisInsight[],
): void {
  const approval = resultMap.approval
  const fptp = resultMap.fptp
  if (approval == null || fptp == null) return

  const approvalWinner = winnersMap.approval?.[0]
  const fptpWinner = winnersMap.fptp?.[0]
  if (approvalWinner == null || fptpWinner == null) return
  if (approvalWinner === fptpWinner) return

  const approvalTallies = approval.result_data.tallies ?? {}
  const fptpTallies = fptp.result_data.tallies ?? {}

  const approvalCount = approvalTallies[approvalWinner] ?? '?'
  const approvalFptpTally = fptpTallies[approvalWinner] ?? '?'
  const fptpTally = fptpTallies[fptpWinner] ?? '?'
  const fptpApprovalTally = approvalTallies[fptpWinner] ?? '?'

  insights.push({
    icon: 'pie-chart',
    title: 'Broad support vs. first-choice support',
    body:
      `${approvalWinner} was approved by ${approvalCount} voters — more than any other candidate — ` +
      `but only had ${approvalFptpTally} first-choice votes. ` +
      `${fptpWinner} had the most first-choice votes (${fptpTally}) but fewer total approvals (${fptpApprovalTally}). ` +
      'Approval voting rewards candidates who are acceptable to the widest group, ' +
      'even if they aren’t everyone’s top pick.',
  })
}

function tryIrvVsApprovalDisagree(
  resultMap: Record<string, ElectionResult>,
  winnersMap: Record<string, string[]>,
  insights: AnalysisInsight[],
): void {
  // Only fire when FPTP is absent (to avoid redundancy with insights 1/4).
  if (resultMap.fptp != null) return

  const irv = resultMap.irv
  const approval = resultMap.approval
  if (irv == null || approval == null) return

  const irvWinner = winnersMap.irv?.[0]
  const approvalWinner = winnersMap.approval?.[0]
  if (irvWinner == null || approvalWinner == null) return
  if (irvWinner === approvalWinner) return

  const approvalTallies = approval.result_data.tallies ?? {}
  const approvalCount = approvalTallies[approvalWinner] ?? '?'
  const rounds = irv.result_data.rounds ?? []
  const roundCount = rounds.length

  insights.push({
    icon: 'compare',
    title: 'Ranking and approval methods disagree',
    body:
      `Approval Voting selected ${approvalWinner} (approved by ${approvalCount} voters), ` +
      `while IRV selected ${irvWinner} after ${roundCount} rounds of elimination. ` +
      `This can happen when ${approvalWinner} is broadly acceptable but not many voters’ top choice, ` +
      `while ${irvWinner} builds a majority through transferred preferences.`,
  })
}

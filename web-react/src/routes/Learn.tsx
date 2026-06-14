import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

import { InfoPageLayout } from '@/components/InfoPageLayout'
import { Button } from '@/components/ui/button'
import { H2 } from '@/components/ui/typography'
import { cn } from '@/lib/utils'

// Learn — ported verbatim from the frozen Flutter reference
// (lib/presentation/screens/learn_screen.dart). All algorithm copy is copied
// exactly so the educational content doesn't drift across the cutover.

interface AlgoPoint {
  title: string
  explanation: string
}

interface AlgoInfo {
  name: string
  summary: string
  strengths: AlgoPoint[]
  weaknesses: AlgoPoint[]
  howItWorks: string
}

type AlgoKey = 'approval' | 'irv' | 'star'

const ALGO_DATA: Record<AlgoKey, AlgoInfo> = {
  approval: {
    name: 'Approval Voting',
    summary:
      "Approval voting lets you vote for as many candidates as you like — simply check off everyone you find acceptable. The candidate with the most approvals wins. It's one of the simplest alternative voting methods to understand and administer.",
    strengths: [
      {
        title: 'Simple to count',
        explanation:
          'There are no rankings, runoff rounds, or score calculations; each mark is worth exactly one point. This makes the count fast, easy to audit by hand, and nearly impossible to tabulate incorrectly.',
      },
      {
        title: 'Reduces vote-splitting',
        explanation:
          "In plurality voting, two popular candidates sharing similar supporters can split their votes and hand victory to a less-liked third candidate. Approval voting lets you back both favourites simultaneously, so similar candidates don't undermine each other.",
      },
      {
        title: 'Encourages honest voting',
        explanation:
          'Unlike plurality voting, there is no strategic reason to hide your true preferences. You can safely vote for your genuine favourite alongside a more mainstream candidate without worrying that doing so will backfire.',
      },
    ],
    weaknesses: [
      {
        title: "Doesn't capture preference intensity",
        explanation:
          'Approving a candidate counts the same whether you adore them or merely tolerate them. Two voters who feel very differently about a candidate are treated identically, which means the winner may not reflect how strongly people actually feel.',
      },
      {
        title: 'Bullet-voting incentive',
        explanation:
          "A strategically minded voter may decide that approving only their single top choice gives that candidate the best relative advantage. If many voters do this, the election degrades toward ordinary plurality voting, losing approval voting's main benefit.",
      },
      {
        title: "Can elect the 'least bad' option",
        explanation:
          'Because broad acceptability is rewarded over passionate support, approval voting can elect a broadly inoffensive compromise candidate that few voters feel strongly positive about, rather than the candidate who genuinely inspires the most people.',
      },
    ],
    howItWorks:
      'Each voter marks every candidate they approve of — there is no limit. After voting closes, the ballots are tallied by counting how many voters approved each candidate. The candidate with the highest approval count wins. In the event of a tie, a tiebreaker rule (such as a coin flip or a runoff) must be specified in advance.',
  },
  irv: {
    name: 'Instant Runoff Voting (IRV)',
    summary:
      'Instant Runoff Voting (IRV) — also called ranked-choice voting — asks you to rank candidates in order of preference. If no candidate wins an outright majority, the last-place candidate is eliminated and their votes are redistributed, repeating until someone has a majority.',
    strengths: [
      {
        title: 'Guarantees a majority winner',
        explanation:
          'Because the process keeps eliminating the weakest candidate and redistributing ballots until one candidate holds more than 50% of remaining votes, the winner always has demonstrated majority support at some level of the count — not just a plurality.',
      },
      {
        title: 'Eliminates the spoiler effect',
        explanation:
          'Third-party and independent candidates can enter a race without drawing votes away from ideologically similar candidates. If your top choice is eliminated early, your ballot moves to your next choice rather than being wasted, so voting your conscience never risks helping your least-preferred candidate win.',
      },
      {
        title: 'Rewards broad coalition support',
        explanation:
          "A candidate who is many voters' second or third choice, and therefore acceptable across different factions, can accumulate votes as the field narrows. This discourages extreme positions and incentivises candidates to appeal beyond their core base.",
      },
    ],
    weaknesses: [
      {
        title: 'More complex to explain',
        explanation:
          'The multi-round elimination process is harder to communicate to voters than simply counting marks. Some voters lose trust in the result because they cannot easily verify it themselves without software or a careful manual walkthrough.',
      },
      {
        title: 'Non-monotonic edge cases',
        explanation:
          'In rare scenarios, ranking a candidate higher on your ballot can paradoxically cause them to lose, while ranking them lower could have caused them to win. This is a known mathematical property of IRV that undermines the intuitive idea that expressing more support should always help a candidate.',
      },
      {
        title: 'Counting requires multiple rounds',
        explanation:
          'Unlike plurality or approval voting, the result cannot be determined from a single pass over the ballots. Precincts cannot simply report local totals; all ballots must be available centrally before the iterative elimination process can run, which slows official results.',
      },
    ],
    howItWorks:
      "Voters rank candidates from first to last choice. In the first round, every ballot's top-ranked candidate receives one vote. If any candidate has more than 50% of the vote, they win immediately. Otherwise, the candidate with the fewest first-choice votes is eliminated, and every ballot that ranked that candidate first is redistributed to those voters' next-ranked remaining candidate. This process repeats until one candidate crosses the 50% threshold.",
  },
  star: {
    name: 'STAR Voting',
    summary:
      'STAR Voting (Score Then Automatic Runoff) asks you to give each candidate a score from 0 to 5. The two highest-scoring candidates advance to an automatic runoff, and whichever of those two was preferred by more voters wins.',
    strengths: [
      {
        title: 'Captures preference intensity',
        explanation:
          "A score of 5 means you strongly support a candidate; a 1 means you find them barely acceptable. This richer signal lets the election reflect not just who voters prefer but how much they prefer them, producing an outcome that better matches the electorate's genuine feelings.",
      },
      {
        title: 'Resistant to strategic bullet-voting',
        explanation:
          'Because the scoring phase determines which two candidates advance, giving an honest score to multiple candidates rarely hurts your favourite. Strategic incentives to misrepresent your preferences are much weaker than in plurality or approval voting.',
      },
      {
        title: 'Fast and auditable tabulation',
        explanation:
          'Despite the two-stage process, counting is straightforward: sum all scores for stage one, then compare ballot-by-ballot between the two finalists for stage two. There are no elimination rounds and no need to centralise ballots before tallying stage-one totals.',
      },
    ],
    weaknesses: [
      {
        title: 'Two-stage process can feel complex',
        explanation:
          'Voters unfamiliar with STAR must understand both the scoring round and the automatic runoff. Some may be confused about why the highest-scoring candidate does not automatically win, and election administrators must explain both stages clearly to maintain public trust.',
      },
      {
        title: 'Scores may be interpreted inconsistently',
        explanation:
          'One voter\'s "3 out of 5" might represent genuine enthusiasm while another voter uses 3 to mean mild disapproval. Without a shared reference point for what each number means, aggregate scores can obscure as much as they reveal.',
      },
      {
        title: 'Runoff can override the top scorer',
        explanation:
          'It is possible for the candidate with the highest total score to lose the runoff to the second-highest scorer. While this is intentional — it ensures the winner has majority preference between the two finalists — it can feel counterintuitive and erode confidence in the result among supporters of the top-scoring candidate.',
      },
    ],
    howItWorks:
      'Each voter scores every candidate from 0 (worst) to 5 (best). Unscored candidates are treated as 0. After voting closes, all scores are summed for each candidate. The two candidates with the highest totals advance to the automatic runoff. In the runoff, every ballot is examined to see which of those two finalists the voter scored higher. The finalist preferred by more voters wins — producing a majority winner between the top two.',
  },
}

const SEGMENTS: { key: AlgoKey; label: string }[] = [
  { key: 'approval', label: 'Approval' },
  { key: 'irv', label: 'IRV' },
  { key: 'star', label: 'STAR' },
]

function PointRow({
  point,
  variant,
}: {
  point: AlgoPoint
  variant: 'strength' | 'weakness'
}) {
  const Icon = variant === 'strength' ? CheckCircle2 : XCircle
  return (
    <li className="flex items-start gap-2">
      <Icon
        aria-hidden="true"
        className={cn(
          'mt-0.5 size-[18px] shrink-0',
          variant === 'strength' ? 'text-green-600' : 'text-amber-600',
        )}
      />
      <div>
        <p className="text-sm font-semibold">{point.title}</p>
        <p className="text-sm leading-relaxed text-pretty">
          {point.explanation}
        </p>
      </div>
    </li>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-5 mb-1.5 font-heading text-base font-bold text-primary">
      {children}
    </h3>
  )
}

function AlgorithmCard({ info }: { info: AlgoInfo }) {
  return (
    <div className="flex flex-col gap-2">
      <H2>{info.name}</H2>
      <p className="text-sm italic leading-relaxed text-pretty">
        {info.summary}
      </p>

      <SectionHeader>Strengths</SectionHeader>
      <ul className="flex flex-col gap-2">
        {info.strengths.map((p) => (
          <PointRow key={p.title} point={p} variant="strength" />
        ))}
      </ul>

      <SectionHeader>Weaknesses</SectionHeader>
      <ul className="flex flex-col gap-2">
        {info.weaknesses.map((p) => (
          <PointRow key={p.title} point={p} variant="weakness" />
        ))}
      </ul>

      <SectionHeader>How It Works</SectionHeader>
      <p className="text-sm leading-relaxed text-pretty">{info.howItWorks}</p>
    </div>
  )
}

export function Learn() {
  const [selected, setSelected] = useState<AlgoKey>('approval')

  return (
    <InfoPageLayout title="Learn About Voting Algorithms">
      {/* Segmented control — the React stand-in for Flutter's SegmentedButton.
          No Tabs primitive ships in the design system yet; a row of Buttons
          (selected = filled, others = outline) reproduces the look. */}
      <div
        role="tablist"
        aria-label="Voting algorithm"
        className="flex w-full gap-2"
      >
        {SEGMENTS.map((seg) => {
          const isSelected = seg.key === selected
          return (
            <Button
              key={seg.key}
              role="tab"
              aria-selected={isSelected}
              variant={isSelected ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setSelected(seg.key)}
            >
              {seg.label}
            </Button>
          )
        })}
      </div>

      <AlgorithmCard info={ALGO_DATA[selected]} />
    </InfoPageLayout>
  )
}

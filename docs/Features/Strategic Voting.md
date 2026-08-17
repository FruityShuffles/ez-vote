# Strategic Voting

The what-ifs explorer answers two counterfactual questions. The flip search
([[Features/Counterfactual Explorer]], #120/#135/#146) asks one about the
**electorate**: *what set of ballot changes would seat someone else?* The
strategic voting search (#149) asks the complementary one about an
**individual**: *given that everyone else voted as they did, could this voter
have gotten a better outcome by submitting a different ballot?*

That is the manipulability question, and it is the sharpest teaching tool the
product has — the concrete, named-voter form of "this method rewards
dishonesty". Gibbard–Satterthwaite says every reasonable method has such holes;
this finds the ones a real election actually contained, and names the person who
was in a position to use them.

Implementation: `supabase/functions/_shared/strategy.ts`, surfaced by
`web-react/src/components/counterfactual/StrategicVotingPanel.tsx`.

---

## The three governing rules

### 1. Methods are analyzed in isolation

**No real election anywhere runs a combined ballot.** EZVote's four-key payload
(`approval`, `irv`, `star`, `fptp` on one row) is a teaching apparatus for
showing four counts of one electorate side by side — see
[[Decisions/Client-Side Derivation]].

A finding about IRV is therefore: *holding every other IRV ranking fixed, had
this voter submitted ranking R instead, IRV's winner would have been X.* Whether
R is derivable from the same voter's STAR scores under this site's ballot
template is a fact about EZVote's input controls, not about IRV.

**It is expected and correct for the search to name a ballot change the voter
could not have entered through EZVote's own combined ballot screen.** A finding
hedged by EZVote's input constraints would be a claim about EZVote, not about the
method, and would be wrong everywhere else.

Mechanically, each trial edits exactly one payload key and carries the rest
through untouched — the same thing `flip.ts` already does with `irv`. The one
place that is not free is FPTP: `computeFPTP` reads `irv[0]` when no explicit
pick is stored, so rewriting `irv` would silently move the FPTP count too. IRV
trials therefore pin `fptp` to the voter's own honest effective pick, which
changes nothing about their FPTP vote and holds that column still. See
[[Features/FPTP]].

The `strategy: isolation` test in `_shared/strategy.test.ts` is the executable
form of this rule: a reported payload must differ in exactly one method's key
(plus that permitted pin), and every other enabled method's winners must be
unchanged.

### 2. Only the winner counts

An outcome is the `winners` array and nothing else. Round structure, runoff
composition, tallies and margins never register as a better outcome. A change
that reshuffles three IRV rounds and elects the same person is not a finding.

### 3. No strategy labels

The generators below (bullet vote, burial, compromise, push-over) are internal
scaffolding for proposing trial ballots. **The output never names a strategy.**
The search proved that a different ballot would have served this voter better; it
proved nothing about intent, and naming a strategy would assert intent. The UI
spells out what the change involves — "Bo 2nd → 1st", "Ada scored 5 (was 3)" —
and stops there.

---

## What multiple algorithms actually contribute

Evidence about **preferences**, never a constraint on the ballot.

When an election also ran STAR, those 0–5 scores say *how much* this voter
prefers Ada to Bo, which lets the search judge "better for them" more finely
while searching IRV. That is legitimate: it is information about the person. What
would not be legitimate is letting the STAR key constrain which IRV rankings are
considered — that is rule 1.

---

## The utility model

"Better for this voter" has to mean something precise, and the only evidence of
what this voter wants is the ballot they cast — which the issue's premise says to
read as **honest**. (It must: without an honest reading there is no way to say
what a better outcome would even be.)

Signals are layered richest first:

| Layer | Present when | Value |
|---|---|---|
| 1 | `star` | `score / 5` |
| 2 | `irv` | `(L − rank) / L` |
| 3 | `approval` | 1 / 0 |
| 4 | effective FPTP pick | 1 / 0 |

Each layer is weighted by a further factor of `ε = 1/(10n)`, so a lower layer can
only ever break an exact tie in a higher one, never reverse it: the coarsest gap
any layer can produce (`1/n`, from a full ranking) is wider than everything below
it combined.

**Outcome utility is the mean of that utility over the `winners` array** — a
uniform lottery on a tie. This is what makes "turn a loss into a tie" and "turn a
tie into a win" register as the real single-voter manipulations they are; a
strict-dominance rule reading only `winner` would miss both.

An opportunity exists iff a trial's outcome utility strictly exceeds the honest
outcome's.

---

## Trial generation, per method

| Method | Key edited | Trials |
|---|---|---|
| FPTP | `fptp` | Each candidate as the pick. The entire strategy space, exhaustive in *n* trials. |
| Approval | `approval` | Every prefix of the voter's preference order, from bullet vote to approve-all. |
| IRV | `irv` | Each candidate promoted to first; each moved to last; the pairwise combination, budget permitting. |
| STAR | `star` | Each candidate at each score 0–5 with the rest honest; min-max vectors at every threshold the honest ballot draws; favourite-at-5 paired with each rival-at-0. |

Trials are ordered strongest-first within each method, because under the
round-robin (below) a ballot may only get its first few tried.

The STAR sweep deliberately subsumes what would otherwise be separate named
strategies — exaggeration, burying a rival, and lifting someone over the top-two
boundary are all just score vectors, and the search does not need to tell them
apart. The boundary case is real and demonstrable, not theoretical: see
`strategy: a STAR ballot can change who reaches the runoff` for a profile where
one voter improves their outcome by scoring their own favourite 0.

### Approval where the honest ballot carries no order

The threshold trials need a preference order, and an **approval-only election
supplies none** — every approved candidate sits at utility 1. Where the layers
above yield no strict order among the approved, a weaker unordered generator is
added: drop each approved candidate, add each unapproved one, bullet-vote each
approved one in turn.

This is honestly weaker coverage than the threshold sweep, not the same thing
under another name. An approval-only election gets a less thorough search than
one that also ran STAR.

### Why truncation is absent

A shortened ranking behaves identically to the full one in every round until
every candidate it does rank has been eliminated. From that point it only
*withholds* support — and it withholds it from the remaining candidates in
precisely the voter's own order of preference, at a moment when everyone they
ranked higher is already out. Truncating is therefore weakly harmful to the
truncator and can never be an opportunity **for them**.

Note this is a claim about strategy, not about outcomes: `computeIRV` recomputes
its majority denominator each round from non-exhausted ballots, so truncation
*can* move a winner with four or more candidates — just never in the truncator's
favour. This is recorded here so the question does not get reopened.

---

## What makes it affordable

In order, each cutting most of the work before a tabulation is spent:

1. **Voter already optimal.** If the outcome this voter got is already worth as
   much as any outcome could be to them, no ballot can improve on it. Removes
   most voters in most elections.
2. **Pivotality screen**, read off the baseline `result_data` (O(candidates), no
   tabulation). One ballot moves any approval/FPTP tally by ≤ 1, a STAR score
   total by ≤ 5 (so a pairwise score margin by ≤ 10), a runoff preference count
   by ≤ 1. A method that fails this screen is one where **no** single ballot can
   move the winners — a proof, not a heuristic — so it is reported as *unsearched*
   rather than as "nothing found". IRV's screen is the conservative one:
   eliminations cascade, so only an outright first-round majority wide enough to
   survive losing this voter is provably safe.
3. **Dedupe identical honest ballots.** One search per distinct payload; the
   answer names one voter and reports `shared_by`.
4. **Round-robin, largest group first.** One trial per distinct ballot per pass,
   so a single voter can never consume the whole budget and the most promising
   trial of every ballot is tried before the second-most promising trial of any.
5. **Budget gate**, the same shape as `flip.ts`: a count budget backed by a
   wall-clock deadline. Exhaustion is never an error.

---

## The honesty contract

This is the **inverse** of the flip search's, and it is easy to read backwards:

- **Every reported opportunity is proven.** It is an existence claim, verified by
  re-tabulating the real tabulator with the trial ballot substituted in. Pruning
  may reason about tallies; a reported answer never does. So the copy is
  unhedged.
- **Absence is not proven.** An empty result never means the election was
  strategy-proof. The search tries a bounded set of trial ballots under a bounded
  budget. The panel's empty state says so explicitly, and must keep saying so.
- One finding per ballot per method, and it is the *strongest change the
  generator proposed*, not necessarily the largest gain reachable.

---

## Where it runs

| Path | When | Budget |
|---|---|---|
| Precompute | `compute-results` at close, after the flip precompute | `PRECOMPUTE_STRATEGY_MS`, clamped by time the flip search already spent |
| Live fallback | `simulate-counterfactual` with `find_strategy: true` | `MAX_STRATEGY_MS` |
| Case studies | `seed-case-studies`, which never goes through compute-results | `timeLimitMs: Infinity` — determinism, so re-seeding is a no-op |

Stored in `flip_searches.strategy` (migration 024), the same row as the flip
answer, read together by the explorer in one round trip. See
[[Backend/Schema]] and [[Backend/Edge Function]].

The live fallback exists for elections closed before #149 and those whose owner
enabled `public_ballots` after closing. Unlike the flip search there is no
algorithm requirement — every method has a strategy space, so any tabulated
election is searchable.

**The results-screen teaser reads the stored answer only.** It sits on a page
every participant loads, so it must never cost a server-side search; elections
without a precomputed row simply show no teaser and still offer the full panel
one navigation away.

---

## Caps

`MAX_STRATEGY_BALLOTS = 500` (equal to `MAX_OVERRIDES`, so any reported ballot is
replayable through the overrides path) and `MAX_STRATEGY_CANDIDATES = 20`. The
explorer explains the caps up front rather than surfacing a 400.

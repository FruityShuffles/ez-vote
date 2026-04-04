import 'package:flutter/material.dart';

class LearnScreen extends StatelessWidget {
  const LearnScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Learn')),
      body: const LearnTab(),
    );
  }
}

class _AlgoPoint {
  final String title;
  final String explanation;
  const _AlgoPoint(this.title, this.explanation);
}

class _AlgoInfo {
  final String name;
  final String summary;
  final List<_AlgoPoint> strengths;
  final List<_AlgoPoint> weaknesses;
  final String howItWorks;
  const _AlgoInfo({
    required this.name,
    required this.summary,
    required this.strengths,
    required this.weaknesses,
    required this.howItWorks,
  });
}

const Map<String, _AlgoInfo> _algoData = {
  'approval': _AlgoInfo(
    name: 'Approval Voting',
    summary:
        "Approval voting lets you vote for as many candidates as you like — simply check off everyone you find acceptable. The candidate with the most approvals wins. It's one of the simplest alternative voting methods to understand and administer.",
    strengths: [
      _AlgoPoint(
        'Simple to count',
        'There are no rankings, runoff rounds, or score calculations; each mark is worth exactly one point. This makes the count fast, easy to audit by hand, and nearly impossible to tabulate incorrectly.',
      ),
      _AlgoPoint(
        'Reduces vote-splitting',
        'In plurality voting, two popular candidates sharing similar supporters can split their votes and hand victory to a less-liked third candidate. Approval voting lets you back both favourites simultaneously, so similar candidates don\'t undermine each other.',
      ),
      _AlgoPoint(
        'Encourages honest voting',
        'Unlike plurality voting, there is no strategic reason to hide your true preferences. You can safely vote for your genuine favourite alongside a more mainstream candidate without worrying that doing so will backfire.',
      ),
    ],
    weaknesses: [
      _AlgoPoint(
        'Doesn\'t capture preference intensity',
        'Approving a candidate counts the same whether you adore them or merely tolerate them. Two voters who feel very differently about a candidate are treated identically, which means the winner may not reflect how strongly people actually feel.',
      ),
      _AlgoPoint(
        'Bullet-voting incentive',
        'A strategically minded voter may decide that approving only their single top choice gives that candidate the best relative advantage. If many voters do this, the election degrades toward ordinary plurality voting, losing approval voting\'s main benefit.',
      ),
      _AlgoPoint(
        'Can elect the \'least bad\' option',
        'Because broad acceptability is rewarded over passionate support, approval voting can elect a broadly inoffensive compromise candidate that few voters feel strongly positive about, rather than the candidate who genuinely inspires the most people.',
      ),
    ],
    howItWorks:
        'Each voter marks every candidate they approve of — there is no limit. After voting closes, the ballots are tallied by counting how many voters approved each candidate. The candidate with the highest approval count wins. In the event of a tie, a tiebreaker rule (such as a coin flip or a runoff) must be specified in advance.',
  ),
  'irv': _AlgoInfo(
    name: 'Instant Runoff Voting (IRV)',
    summary:
        'Instant Runoff Voting (IRV) — also called ranked-choice voting — asks you to rank candidates in order of preference. If no candidate wins an outright majority, the last-place candidate is eliminated and their votes are redistributed, repeating until someone has a majority.',
    strengths: [
      _AlgoPoint(
        'Guarantees a majority winner',
        'Because the process keeps eliminating the weakest candidate and redistributing ballots until one candidate holds more than 50% of remaining votes, the winner always has demonstrated majority support at some level of the count — not just a plurality.',
      ),
      _AlgoPoint(
        'Eliminates the spoiler effect',
        'Third-party and independent candidates can enter a race without drawing votes away from ideologically similar candidates. If your top choice is eliminated early, your ballot moves to your next choice rather than being wasted, so voting your conscience never risks helping your least-preferred candidate win.',
      ),
      _AlgoPoint(
        'Rewards broad coalition support',
        'A candidate who is many voters\' second or third choice, and therefore acceptable across different factions, can accumulate votes as the field narrows. This discourages extreme positions and incentivises candidates to appeal beyond their core base.',
      ),
    ],
    weaknesses: [
      _AlgoPoint(
        'More complex to explain',
        'The multi-round elimination process is harder to communicate to voters than simply counting marks. Some voters lose trust in the result because they cannot easily verify it themselves without software or a careful manual walkthrough.',
      ),
      _AlgoPoint(
        'Non-monotonic edge cases',
        'In rare scenarios, ranking a candidate higher on your ballot can paradoxically cause them to lose, while ranking them lower could have caused them to win. This is a known mathematical property of IRV that undermines the intuitive idea that expressing more support should always help a candidate.',
      ),
      _AlgoPoint(
        'Counting requires multiple rounds',
        'Unlike plurality or approval voting, the result cannot be determined from a single pass over the ballots. Precincts cannot simply report local totals; all ballots must be available centrally before the iterative elimination process can run, which slows official results.',
      ),
    ],
    howItWorks:
        'Voters rank candidates from first to last choice. In the first round, every ballot\'s top-ranked candidate receives one vote. If any candidate has more than 50% of the vote, they win immediately. Otherwise, the candidate with the fewest first-choice votes is eliminated, and every ballot that ranked that candidate first is redistributed to those voters\' next-ranked remaining candidate. This process repeats until one candidate crosses the 50% threshold.',
  ),
  'star': _AlgoInfo(
    name: 'STAR Voting',
    summary:
        'STAR Voting (Score Then Automatic Runoff) asks you to give each candidate a score from 0 to 5. The two highest-scoring candidates advance to an automatic runoff, and whichever of those two was preferred by more voters wins.',
    strengths: [
      _AlgoPoint(
        'Captures preference intensity',
        'A score of 5 means you strongly support a candidate; a 1 means you find them barely acceptable. This richer signal lets the election reflect not just who voters prefer but how much they prefer them, producing an outcome that better matches the electorate\'s genuine feelings.',
      ),
      _AlgoPoint(
        'Resistant to strategic bullet-voting',
        'Because the scoring phase determines which two candidates advance, giving an honest score to multiple candidates rarely hurts your favourite. Strategic incentives to misrepresent your preferences are much weaker than in plurality or approval voting.',
      ),
      _AlgoPoint(
        'Fast and auditable tabulation',
        'Despite the two-stage process, counting is straightforward: sum all scores for stage one, then compare ballot-by-ballot between the two finalists for stage two. There are no elimination rounds and no need to centralise ballots before tallying stage-one totals.',
      ),
    ],
    weaknesses: [
      _AlgoPoint(
        'Two-stage process can feel complex',
        'Voters unfamiliar with STAR must understand both the scoring round and the automatic runoff. Some may be confused about why the highest-scoring candidate does not automatically win, and election administrators must explain both stages clearly to maintain public trust.',
      ),
      _AlgoPoint(
        'Scores may be interpreted inconsistently',
        'One voter\'s "3 out of 5" might represent genuine enthusiasm while another voter uses 3 to mean mild disapproval. Without a shared reference point for what each number means, aggregate scores can obscure as much as they reveal.',
      ),
      _AlgoPoint(
        'Runoff can override the top scorer',
        'It is possible for the candidate with the highest total score to lose the runoff to the second-highest scorer. While this is intentional — it ensures the winner has majority preference between the two finalists — it can feel counterintuitive and erode confidence in the result among supporters of the top-scoring candidate.',
      ),
    ],
    howItWorks:
        'Each voter scores every candidate from 0 (worst) to 5 (best). Unscored candidates are treated as 0. After voting closes, all scores are summed for each candidate. The two candidates with the highest totals advance to the automatic runoff. In the runoff, every ballot is examined to see which of those two finalists the voter scored higher. The finalist preferred by more voters wins — producing a majority winner between the top two.',
  ),
};

class LearnTab extends StatefulWidget {
  const LearnTab({super.key});

  @override
  State<LearnTab> createState() => _LearnTabState();
}

class _LearnTabState extends State<LearnTab> {
  String _selected = 'approval';

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 600),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Learn About Voting Algorithms',
                style: Theme.of(context).textTheme.headlineSmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              Center(
                child: SizedBox(
                  width: 360,
                  child: SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'approval', label: Text('Approval')),
                      ButtonSegment(value: 'irv', label: Text('IRV')),
                      ButtonSegment(value: 'star', label: Text('STAR')),
                    ],
                    selected: {_selected},
                    onSelectionChanged: (s) => setState(() => _selected = s.first),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 250),
                child: _AlgorithmCard(
                  key: ValueKey(_selected),
                  info: _algoData[_selected]!,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AlgorithmCard extends StatelessWidget {
  final _AlgoInfo info;

  const _AlgorithmCard({super.key, required this.info});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final textTheme = theme.textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(info.name, style: textTheme.headlineMedium),
        const SizedBox(height: 8),
        Text(
          info.summary,
          style: textTheme.bodyMedium?.copyWith(fontStyle: FontStyle.italic),
        ),
        _SectionHeader('Strengths'),
        ..._buildPoints(info.strengths, Icons.check_circle_outline, Colors.green),
        _SectionHeader('Weaknesses'),
        ..._buildPoints(info.weaknesses, Icons.cancel_outlined, Colors.orange),
        _SectionHeader('How It Works'),
        Text(info.howItWorks, style: textTheme.bodyMedium),
        const SizedBox(height: 16),
      ],
    );
  }

  List<Widget> _buildPoints(
    List<_AlgoPoint> points,
    IconData icon,
    Color color,
  ) {
    return points.map((p) => _PointRow(point: p, icon: icon, color: color)).toList();
  }
}

class _SectionHeader extends StatelessWidget {
  final String text;
  const _SectionHeader(this.text);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 20, bottom: 6),
      child: Text(
        text,
        style: theme.textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.bold,
          color: theme.colorScheme.primary,
        ),
      ),
    );
  }
}

class _PointRow extends StatelessWidget {
  final _AlgoPoint point;
  final IconData icon;
  final Color color;

  const _PointRow({required this.point, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2, right: 8),
            child: Icon(icon, color: color, size: 18),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  point.title,
                  style: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.bold),
                ),
                Text(point.explanation, style: textTheme.bodyMedium),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

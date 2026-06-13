// Export historical-election golden fixtures from production (M2).
//
// For every CLOSED election it snapshots the scrubbed ballots + candidates as
// `input`, and the result_data already stored in the `results` table as
// `expected`. That stored result_data was produced by the original (pre-M1)
// code path, which is what makes the golden test a real regression guard rather
// than a tautology: tabulate() must reproduce it byte-for-byte.
//
// USER IDS ARE SCRUBBED: owner_id, ballot voter_id, ballot id, and all
// timestamps are dropped entirely. Candidate UUIDs are remapped to stable
// cand-N handles (and that remap is applied into every ballot payload) so no
// raw identifiers leak. Candidate *names* are retained — result_data is keyed
// by name and the issue scope only requires scrubbing user IDs.
//
// Usage (from supabase/functions/):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno task export-fixtures
//   deno task export-fixtures -- --dry-run     # report, write nothing
//   deno task export-fixtures -- --help
//
// Requires the SERVICE ROLE key (bypasses RLS to read every election's
// ballots/results). Never commit it — .env is gitignored.

import { createClient } from "@supabase/supabase-js";
import { type Ballot, type Candidate, tabulate } from "../_shared/tabulate.ts";

const HELP = `export-fixtures — snapshot closed elections into golden fixtures

Flags:
  --dry-run     Fetch and report, but do not write any files.
  --help        Show this help.

Environment:
  SUPABASE_URL                 Project URL (e.g. https://xxxx.supabase.co)
  SUPABASE_SERVICE_ROLE_KEY    Service-role key (bypasses RLS; do not commit)

Output:
  Writes one JSON file per closed election to _shared/fixtures/historical/.
`;

interface Fixture {
  name: string;
  description: string;
  source: "historical";
  election_id_hash: string;
  input: {
    algorithms: string[];
    include_fptp: boolean;
    candidates: Candidate[];
    ballots: Ballot[];
  };
  expected: { algorithm: string; result_data: Record<string, unknown> }[];
}

// Stable, non-reversible short hash so fixtures can be distinguished/regenerated
// deterministically without exposing the real election UUID.
async function shortHash(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "election";
}

// Remap a candidate UUID to its stable cand-N handle, assigning a synthetic
// `extra-N` for any id referenced by a ballot but absent from the candidate
// list (e.g. a since-deleted candidate). Keeps tabulation behavior identical
// while leaking no raw identifiers.
function makeRemapper(realToHandle: Map<string, string>) {
  let extra = 0;
  return (id: string): string => {
    const known = realToHandle.get(id);
    if (known) return known;
    const synthetic = `extra-${++extra}`;
    realToHandle.set(id, synthetic);
    return synthetic;
  };
}

function scrubPayload(
  payload: Record<string, unknown>,
  remap: (id: string) => string,
): Ballot["payload"] {
  const out: Ballot["payload"] = {};
  if (Array.isArray(payload.approval)) {
    out.approval = (payload.approval as string[]).map(remap);
  }
  if (Array.isArray(payload.irv)) {
    out.irv = (payload.irv as string[]).map(remap);
  }
  if (payload.star && typeof payload.star === "object") {
    const star: Record<string, number> = {};
    for (const [cid, score] of Object.entries(payload.star)) {
      star[remap(cid)] = score as number;
    }
    out.star = star;
  }
  if (typeof payload.fptp === "string") {
    out.fptp = remap(payload.fptp);
  }
  return out;
}

async function main() {
  const args = new Set(Deno.args);
  if (args.has("--help") || args.has("-h")) {
    console.log(HELP);
    return;
  }
  const dryRun = args.has("--dry-run");

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.\n",
    );
    console.error(HELP);
    Deno.exit(1);
  }

  const supabase = createClient(url, serviceKey);
  const outDir = new URL("../_shared/fixtures/historical/", import.meta.url);

  const { data: elections, error } = await supabase
    .from("elections")
    .select("id, title, algorithms, include_fptp")
    .eq("status", "closed")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch elections:", error.message);
    Deno.exit(1);
  }
  if (!elections || elections.length === 0) {
    console.log("No closed elections found — nothing to export.");
    return;
  }

  console.log(`Found ${elections.length} closed election(s).`);
  let written = 0;
  let mismatches = 0;

  for (const election of elections) {
    const electionId = election.id as string;

    const [
      { data: candidateRows },
      { data: ballotRows },
      { data: resultRows },
    ] = await Promise.all([
      supabase
        .from("candidates")
        .select("id, name, position")
        .eq("election_id", electionId)
        .order("position", { ascending: true }),
      supabase.from("ballots").select("payload").eq("election_id", electionId),
      supabase
        .from("results")
        .select("algorithm, result_data")
        .eq("election_id", electionId),
    ]);

    if (!resultRows || resultRows.length === 0) {
      console.warn(`  - ${electionId}: no stored results, skipping.`);
      continue;
    }

    // Build the candidate UUID -> cand-N remap from the position-ordered list.
    const realToHandle = new Map<string, string>();
    (candidateRows ?? []).forEach((c, i) => {
      realToHandle.set(c.id as string, `cand-${i + 1}`);
    });
    const remap = makeRemapper(realToHandle);

    const candidates: Candidate[] = (candidateRows ?? []).map((c, i) => ({
      id: `cand-${i + 1}`,
      name: c.name as string,
      position: (c.position as number) ?? i,
    }));

    const ballots: Ballot[] = (ballotRows ?? []).map((b) => ({
      payload: scrubPayload(
        (b.payload ?? {}) as Record<string, unknown>,
        remap,
      ),
    }));

    const algorithms: string[] = (election.algorithms as string[]) ?? [];
    const includeFptp = Boolean(election.include_fptp);

    // Order `expected` to match tabulate()'s output exactly: one entry per
    // configured algorithm (in `algorithms` order), then a trailing fptp entry
    // when include_fptp is set. Stored rows arrive in arbitrary order, so we
    // can't rely on the query order — the golden test compares the full ordered
    // array, so mismatched ordering would fail an otherwise-correct fixture.
    const resultByAlgo = new Map<string, Record<string, unknown>>();
    for (const r of resultRows) {
      resultByAlgo.set(
        r.algorithm as string,
        (r.result_data ?? {}) as Record<string, unknown>,
      );
    }
    const orderedAlgos = [...algorithms, ...(includeFptp ? ["fptp"] : [])];
    const missing = orderedAlgos.filter((a) => !resultByAlgo.has(a));
    if (missing.length > 0) {
      console.warn(
        `  - ${electionId}: missing stored result(s) for ${
          missing.join(", ")
        } — would never match tabulate(), skipping.`,
      );
      continue;
    }
    const expected = orderedAlgos.map((algo) => ({
      algorithm: algo,
      result_data: resultByAlgo.get(algo)!,
    }));

    // Sanity check: the current helper should already reproduce the stored
    // results. A mismatch here means latent drift (or a result computed by an
    // older algorithm version) — surface it, but still write the fixture so the
    // test makes the drift explicit and reviewable.
    const recomputed = tabulate(algorithms, includeFptp, candidates, ballots);
    if (JSON.stringify(recomputed) !== JSON.stringify(expected)) {
      mismatches++;
      console.warn(
        `  ! ${electionId}: tabulate() output differs from stored results — review before trusting this fixture.`,
      );
    }

    const hash = await shortHash(electionId);
    const fixture: Fixture = {
      name: `historical-${slugify(election.title as string)}-${hash}`,
      description:
        `Snapshot of closed election "${election.title}" (id scrubbed). ` +
        `${ballots.length} ballot(s), ${candidates.length} candidate(s).`,
      source: "historical",
      election_id_hash: hash,
      input: { algorithms, include_fptp: includeFptp, candidates, ballots },
      expected,
    };

    const fileName = `${fixture.name}.json`;
    if (dryRun) {
      console.log(`  (dry-run) would write ${fileName}`);
    } else {
      await Deno.mkdir(outDir, { recursive: true });
      await Deno.writeTextFile(
        new URL(fileName, outDir),
        JSON.stringify(fixture, null, 2) + "\n",
      );
      console.log(`  wrote ${fileName}`);
      written++;
    }
  }

  console.log(
    `\nDone. ${dryRun ? "0 (dry-run)" : written} fixture(s) written` +
      `${mismatches ? `, ${mismatches} mismatch(es) flagged` : ""}.`,
  );
  if (mismatches) {
    console.log(
      "Review flagged elections: their stored results may predate the current algorithm.",
    );
  }
}

await main();

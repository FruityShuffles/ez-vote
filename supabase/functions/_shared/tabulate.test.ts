// Golden-corpus tests for the shared tabulation helper (M2).
//
// Every JSON file under fixtures/synthetic/ and fixtures/historical/ is a
// self-contained case: an `input` mirroring the tabulate() signature and an
// `expected` TabulationResult[]. This suite runs tabulate() against each and
// asserts a full structural match — locking the algorithms' behavior so the
// React port (and any future refactor) is provably non-drifting.
//
// assertEquals does order-independent deep equality, so result_data key
// ordering is irrelevant; only shape and values matter.

import { assertEquals } from "@std/assert";
import {
  type Ballot,
  type Candidate,
  tabulate,
  type TabulationResult,
} from "./tabulate.ts";

interface Fixture {
  name: string;
  description?: string;
  source?: string;
  input: {
    algorithms: string[];
    include_fptp: boolean;
    candidates: Candidate[];
    ballots: Ballot[];
  };
  expected: TabulationResult[];
}

const HERE = new URL(".", import.meta.url);
const FIXTURE_DIRS = ["fixtures/synthetic", "fixtures/historical"];

async function loadFixtures(): Promise<{ path: string; fixture: Fixture }[]> {
  const found: { path: string; fixture: Fixture }[] = [];

  for (const dir of FIXTURE_DIRS) {
    const dirUrl = new URL(`${dir}/`, HERE);
    let entries: Deno.DirEntry[];
    try {
      entries = [...Deno.readDirSync(dirUrl)];
    } catch (err) {
      // historical/ may not exist until the export script is run; that's fine.
      if (err instanceof Deno.errors.NotFound) continue;
      throw err;
    }

    for (const entry of entries) {
      if (!entry.isFile || !entry.name.endsWith(".json")) continue;
      const fileUrl = new URL(entry.name, dirUrl);
      const fixture = JSON.parse(await Deno.readTextFile(fileUrl)) as Fixture;
      found.push({ path: `${dir}/${entry.name}`, fixture });
    }
  }

  return found.sort((a, b) => a.path.localeCompare(b.path));
}

const fixtures = await loadFixtures();

if (fixtures.length === 0) {
  // Guard against a silently-empty suite (e.g. a path typo or bad glob).
  Deno.test("corpus is non-empty", () => {
    throw new Error("No fixtures found under fixtures/synthetic or historical");
  });
}

for (const { path, fixture } of fixtures) {
  Deno.test(`${fixture.name} (${path})`, () => {
    const actual = tabulate(
      fixture.input.algorithms,
      fixture.input.include_fptp,
      fixture.input.candidates,
      fixture.input.ballots,
    );
    assertEquals(actual, fixture.expected);
  });
}

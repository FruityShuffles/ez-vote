// Golden tests for the ballot-derivation module.
//
// Every JSON file under fixtures/derivation/ names an `op` (which derivation
// function), an `input`, and the `expected` output. This suite runs derive.ts
// against each and asserts an exact match. The corpus is frozen: it was
// generated from the original Dart implementation during the React migration,
// and is now the contract derive.ts must meet rather than a regenerable
// snapshot. Changing a rule means changing a fixture deliberately.

import { assertEquals } from "@std/assert";
import {
  applyReorder,
  autoFptpFromScores,
  buildPayload,
  deriveApprovalsFromRanking,
  deriveApprovalsFromScores,
  deriveRanking,
  rebuildTieBreaksFromOrder,
  syncTieBreaks,
} from "./derive.ts";

// deno-lint-ignore no-explicit-any
type Json = any;

interface Fixture {
  name: string;
  op: string;
  description?: string;
  input: Json;
  expected: Json;
}

function run(op: string, input: Json): unknown {
  switch (op) {
    case "deriveRanking":
      return deriveRanking(input.scores, input.tieBreaks, input.candidateIds);
    case "deriveApprovalsFromScores":
      return deriveApprovalsFromScores(
        input.scores,
        input.candidateIds,
        input.cutoff,
      );
    case "deriveApprovalsFromRanking":
      return deriveApprovalsFromRanking(input.ranking, input.topK);
    case "syncTieBreaks":
      return syncTieBreaks(input.tieBreaks, input.scores, input.candidateIds);
    case "rebuildTieBreaksFromOrder":
      return rebuildTieBreaksFromOrder(input.order, input.scores);
    case "applyReorder":
      return applyReorder(
        input.scores,
        input.displayOrder,
        input.oldIndex,
        input.newIndex,
      );
    case "autoFptpFromScores":
      return autoFptpFromScores(
        input.scores,
        input.candidateIds,
        input.currentChoice,
      );
    case "buildPayload":
      return buildPayload(
        input.template,
        input.state,
        input.candidateIds,
        input.includeFptp,
      );
    default:
      throw new Error(`Unknown derivation op: ${op}`);
  }
}

const dirUrl = new URL("fixtures/derivation/", import.meta.url);

let entries: Deno.DirEntry[];
try {
  entries = [...Deno.readDirSync(dirUrl)];
} catch (err) {
  if (err instanceof Deno.errors.NotFound) entries = [];
  else throw err;
}

const fixtures = entries
  .filter((e) => e.isFile && e.name.endsWith(".json"))
  .map((e) => e.name)
  .sort();

if (fixtures.length === 0) {
  Deno.test("derivation corpus is non-empty", () => {
    throw new Error(
      "No fixtures under fixtures/derivation — the corpus is committed and must not be empty; restore it from git",
    );
  });
}

for (const fileName of fixtures) {
  const fixture = JSON.parse(
    Deno.readTextFileSync(new URL(fileName, dirUrl)),
  ) as Fixture;
  Deno.test(`${fixture.op}: ${fixture.name}`, () => {
    assertEquals(run(fixture.op, fixture.input), fixture.expected);
  });
}

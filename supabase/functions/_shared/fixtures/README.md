# Tabulation golden corpus

Fixtures that lock the behavior of the shared tabulation helper
(`../tabulate.ts`). The test runner (`../tabulate.test.ts`) loads every `*.json`
file under `synthetic/` and `historical/`, runs `tabulate()` against each
`input`, and asserts the output deep-equals `expected`. This is the M2 safety
net for the Flutter → React migration: both clients (and the edge function) call
this one helper, so a green corpus means no algorithm drift.

## Fixture format

```jsonc
{
  "name": "irv-multi-elimination-tie",      // unique, used as the test name
  "description": "...",                      // human note on what it locks
  "source": "synthetic" | "historical",
  "input": {                                 // mirrors the tabulate() signature
    "algorithms": ["irv"],                   // approval | irv | star (FPTP is separate)
    "include_fptp": false,                   // appends an FPTP result when true
    "candidates": [{ "id": "cand-1", "name": "Alice", "position": 0 }],
    "ballots": [{ "payload": { "irv": ["cand-1"] } }]
  },
  "expected": [                              // full TabulationResult[]
    { "algorithm": "irv", "result_data": { /* the entire shape, not just winners */ } }
  ]
}
```

`assertEquals` compares structurally, so key ordering inside `result_data`
doesn't matter — but the full shape does (the results view renders it
field-by-field, so shape drift is a parity bug even when winners match).

## Adding a synthetic fixture

1. Drop a new `synthetic/<name>.json` describing the input and the expected
   output (trace `../tabulate.ts` to derive `expected`).
2. From `supabase/functions/`: `deno task test`.
3. If the helper disagrees with your hand-derived `expected`: if you made an
   arithmetic error, fix the fixture; if the helper does something surprising
   but real, keep the helper's actual value and record it as a parity-checklist
   candidate (the algorithms are frozen — we lock existing behavior here, we
   don't change it).

## Regenerating historical fixtures

`historical/` is empty until you snapshot production. The script reads closed
elections, scrubs user IDs (drops `owner_id` / `voter_id` / ballot id /
timestamps, remaps candidate UUIDs to `cand-N`), and uses the **stored**
`result_data` as `expected` — the ground truth produced by the original code.

```bash
# from supabase/functions/ — requires the service-role key (never commit it)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno task export-fixtures
deno task export-fixtures -- --dry-run   # preview without writing
```

Commit the generated `historical/*.json`; CI then locks them like any other
fixture. If the script flags a mismatch, the stored result likely predates the
current algorithm — review before trusting that fixture.

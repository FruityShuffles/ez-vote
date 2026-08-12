# Service-Role Scripts

Two Deno scripts under `supabase/functions/scripts/` run against the live project with the
**service-role key**:

| Script | Task | Purpose |
|---|---|---|
| `export-fixtures.ts` | `deno task export-fixtures` | Snapshot closed elections into golden fixtures |
| `seed-case-studies.ts` | `deno task seed-case-studies` | Create/refresh the public Case Studies ([[Features/Case Studies]]) |

That key bypasses RLS entirely and reaches the auth admin API, so it is the most dangerous
credential in the project — strictly more powerful than any user account. Treat it as
write-anything access to production data.

**Never** put it in `.env`, on a command line, in a shell history, or in a commit.
`web-react/.env` and the repo-root `.env` hold the *anon* key only; that is deliberate.

## Getting it into the environment (Windows)

`tools/Set-SupabaseEnv.ps1` sets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` without the
key ever touching disk or a command line. Dot-source it, then run the task in the **same**
invocation — shell state does not survive between calls:

```powershell
. .\tools\Set-SupabaseEnv.ps1
cd supabase\functions
deno task seed-case-studies -- --dry-run
```

| Flag | Effect |
|---|---|
| *(none)* | Read the key from Credential Manager; on the first run, fetch it from the linked Supabase CLI project and store it |
| `-Refresh` | Re-fetch and re-store, after a key rotation |
| `-Clear` | Delete the stored credential |

How it works: the key lives in Windows Credential Manager as the generic credential
`EZVote:SupabaseServiceRoleKey`, written and read through `CredWrite`/`CredRead` P/Invoke
rather than `cmdkey`, whose arguments would be briefly visible to other processes.
`SUPABASE_URL` is not secret and comes from the repo-root `.env` (or `-Url`). The script
prints status lines only, never the key.

Credential Manager entries are **per Windows user** (DPAPI-encrypted). Another user on the
machine cannot read it — including a tool running under a separate sandbox account, which
will see the credential as simply absent.

Anywhere else, set the two environment variables however you like; nothing in the repo
depends on the helper.

## Rules when running these

- Never echo the key. If you need to confirm it is set, print its **length**, not its
  value.
- Prefer `--dry-run` first. Both scripts support it; `seed-case-studies` reports the exact
  row-level diff it would apply.
- `seed-case-studies` writes to production and creates `auth.users` rows. Confirm with the
  user before the non-dry run.

## Maintaining `Set-SupabaseEnv.ps1`

Keep it **ASCII-only**. Windows PowerShell 5.1 reads a `.ps1` without a BOM as ANSI, so a
stray em dash corrupts the file into parse errors that point at unrelated lines.

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useAddCandidate } from '@/lib/elections'
import { friendlyError, isUniqueViolation } from '@/lib/errors'

// Voter-suggested candidate input, ported from Flutter `_AddCandidateField`.
// Shown only for ad-hoc elections (`allow_voter_candidates`) while OPEN. A
// duplicate name is detected via the Postgres unique-violation code (CRT-02),
// not a string match; all other failures get a generic friendly message so no
// raw Supabase text leaks (DET-05).

export function AddCandidateField({ electionId }: { electionId: string }) {
  const [name, setName] = useState('')
  const addCandidate = useAddCandidate(electionId)

  async function submit() {
    const trimmed = name.trim()
    if (trimmed === '' || addCandidate.isPending) return
    try {
      await addCandidate.mutateAsync(trimmed)
      setName('')
    } catch (e) {
      toast.error(
        isUniqueViolation(e)
          ? 'A candidate with that name already exists'
          : friendlyError(e, 'Error adding candidate. Please try again.'),
      )
    }
  }

  return (
    <form
      className="mt-2 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add a candidate..."
        aria-label="Add a candidate"
      />
      <Button
        type="submit"
        size="icon"
        disabled={addCandidate.isPending}
        aria-label="Add candidate"
      >
        {addCandidate.isPending ? <Spinner className="size-4" /> : <Plus />}
      </Button>
    </form>
  )
}

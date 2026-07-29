import { beforeEach, describe, expect, it } from 'vitest'

import { useCounterfactualStore } from '@/lib/counterfactualStore'

const original = {
  approval: ['ada'],
  irv: ['ada', 'bo'],
  star: { ada: 5, bo: 1 },
}

beforeEach(() => {
  useCounterfactualStore.setState({ electionId: null, edits: {} })
})

describe('counterfactual ledger store', () => {
  it('survives route changes within an election and clears on election change', () => {
    const store = useCounterfactualStore.getState()
    store.selectElection('e1')
    store.recordEdit('v1', original, {
      ...original,
      irv: ['bo', 'ada'],
    })

    useCounterfactualStore.getState().selectElection('e1')
    expect(useCounterfactualStore.getState().edits.v1?.irv).toEqual([
      'bo',
      'ada',
    ])

    useCounterfactualStore.getState().selectElection('e2')
    expect(useCounterfactualStore.getState()).toMatchObject({
      electionId: 'e2',
      edits: {},
    })
  })

  it('removes an edit when the canonical original is restored', () => {
    const store = useCounterfactualStore.getState()
    store.selectElection('e1')
    store.recordEdit('v1', original, {
      ...original,
      approval: ['bo'],
    })
    expect(useCounterfactualStore.getState().edits).toHaveProperty('v1')

    // Object key order is deliberately different: payload equality is
    // structural, while ranking array order remains significant.
    useCounterfactualStore.getState().recordEdit('v1', original, {
      star: { bo: 1, ada: 5 },
      irv: ['ada', 'bo'],
      approval: ['ada'],
    })
    expect(useCounterfactualStore.getState().edits).toEqual({})
  })

  it('supports one-edit undo and reset-all', () => {
    const store = useCounterfactualStore.getState()
    store.selectElection('e1')
    store.recordEdit('v1', original, { ...original, approval: ['bo'] })
    store.recordEdit('v2', original, { ...original, approval: [] })

    useCounterfactualStore.getState().removeEdit('v1')
    expect(Object.keys(useCounterfactualStore.getState().edits)).toEqual(['v2'])

    useCounterfactualStore.getState().reset()
    expect(useCounterfactualStore.getState().edits).toEqual({})
  })
})

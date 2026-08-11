import { beforeEach, describe, expect, it } from 'vitest'

import { useCounterfactualStore } from '@/lib/counterfactualStore'

const original = {
  approval: ['ada'],
  irv: ['ada', 'bo'],
  star: { ada: 5, bo: 1 },
}

beforeEach(() => {
  useCounterfactualStore.setState({
    electionId: null,
    edits: {},
    flipApplied: {},
  })
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

  it('replaces the whole ledger when a flip change set is applied', () => {
    const store = useCounterfactualStore.getState()
    store.selectElection('e1')
    store.recordEdit('v9', original, { ...original, approval: ['bo'] })

    const suggested = { ...original, irv: ['bo', 'ada'] }
    useCounterfactualStore.getState().applyFlipChanges([
      { voterId: 'v1', payload: suggested },
      { voterId: 'v2', payload: suggested },
    ])

    const state = useCounterfactualStore.getState()
    expect(Object.keys(state.edits).sort()).toEqual(['v1', 'v2'])
    expect(state.edits.v1).toEqual(suggested)
    expect(state.flipApplied).toEqual({ v1: true, v2: true })
  })

  it('drops the flip marker when the voter is manually edited or undone', () => {
    const suggested = { ...original, irv: ['bo', 'ada'] }
    const store = useCounterfactualStore.getState()
    store.selectElection('e1')
    store.applyFlipChanges([
      { voterId: 'v1', payload: suggested },
      { voterId: 'v2', payload: suggested },
    ])

    // A manual edit wins: the payload is replaced and the marker drops.
    useCounterfactualStore.getState().recordEdit('v1', original, {
      ...original,
      approval: [],
    })
    expect(useCounterfactualStore.getState().flipApplied).toEqual({ v2: true })
    expect(useCounterfactualStore.getState().edits.v1?.approval).toEqual([])

    // Restoring the original clears both the edit and the marker.
    useCounterfactualStore.getState().recordEdit('v2', original, original)
    expect(useCounterfactualStore.getState().edits).toEqual({
      v1: { ...original, approval: [] },
    })
    expect(useCounterfactualStore.getState().flipApplied).toEqual({})
  })

  it('clears flip markers on undo, reset, and election change', () => {
    const suggested = { ...original, irv: ['bo', 'ada'] }
    useCounterfactualStore.getState().selectElection('e1')
    useCounterfactualStore
      .getState()
      .applyFlipChanges([{ voterId: 'v1', payload: suggested }])

    useCounterfactualStore.getState().removeEdit('v1')
    expect(useCounterfactualStore.getState().flipApplied).toEqual({})

    useCounterfactualStore
      .getState()
      .applyFlipChanges([{ voterId: 'v1', payload: suggested }])
    useCounterfactualStore.getState().reset()
    expect(useCounterfactualStore.getState().flipApplied).toEqual({})

    useCounterfactualStore
      .getState()
      .applyFlipChanges([{ voterId: 'v1', payload: suggested }])
    useCounterfactualStore.getState().selectElection('e2')
    expect(useCounterfactualStore.getState().flipApplied).toEqual({})
  })
})

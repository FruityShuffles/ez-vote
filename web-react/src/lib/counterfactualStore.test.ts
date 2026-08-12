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
    activeSuggestion: null,
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
    useCounterfactualStore.getState().applySuggestion([
      { voterId: 'v1', payload: suggested },
      { voterId: 'v2', payload: suggested },
    ])

    const state = useCounterfactualStore.getState()
    expect(Object.keys(state.edits).sort()).toEqual(['v1', 'v2'])
    expect(state.edits.v1).toEqual(suggested)
    expect(state.activeSuggestion).toEqual({ v1: suggested, v2: suggested })
  })

  it('leaves the active suggestion globally when any ballot is edited', () => {
    const suggested = { ...original, irv: ['bo', 'ada'] }
    const store = useCounterfactualStore.getState()
    store.selectElection('e1')
    store.applySuggestion([
      { voterId: 'v1', payload: suggested },
      { voterId: 'v2', payload: suggested },
    ])

    // Even an unrelated third ballot means this is no longer the exact
    // suggestion. The suggested working payloads remain as ordinary edits.
    useCounterfactualStore.getState().recordEdit('v3', original, {
      ...original,
      approval: [],
    })
    expect(useCounterfactualStore.getState().activeSuggestion).toBeNull()
    expect(useCounterfactualStore.getState().edits).toMatchObject({
      v1: suggested,
      v2: suggested,
      v3: { ...original, approval: [] },
    })

    // Clicking it again restores the exact suggestion and removes the unrelated
    // manual edit.
    useCounterfactualStore.getState().applySuggestion([
      { voterId: 'v1', payload: suggested },
      { voterId: 'v2', payload: suggested },
    ])
    expect(useCounterfactualStore.getState().edits).toEqual({
      v1: suggested,
      v2: suggested,
    })
    expect(useCounterfactualStore.getState().activeSuggestion).toEqual({
      v1: suggested,
      v2: suggested,
    })
  })

  it('clears active suggestion provenance on undo, reset, and election change', () => {
    const suggested = { ...original, irv: ['bo', 'ada'] }
    useCounterfactualStore.getState().selectElection('e1')
    useCounterfactualStore
      .getState()
      .applySuggestion([{ voterId: 'v1', payload: suggested }])

    useCounterfactualStore.getState().removeEdit('v1')
    expect(useCounterfactualStore.getState().activeSuggestion).toBeNull()

    useCounterfactualStore
      .getState()
      .applySuggestion([{ voterId: 'v1', payload: suggested }])
    useCounterfactualStore.getState().reset()
    expect(useCounterfactualStore.getState().activeSuggestion).toBeNull()

    useCounterfactualStore
      .getState()
      .applySuggestion([{ voterId: 'v1', payload: suggested }])
    useCounterfactualStore.getState().selectElection('e2')
    expect(useCounterfactualStore.getState().activeSuggestion).toBeNull()
  })
})

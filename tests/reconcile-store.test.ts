import { beforeEach, describe, expect, it } from 'vitest'
import {
    isBatchRunningFor,
    resultFor,
    useReconcileStore,
} from '../tinycld/books/stores/reconcile-store'

// The batch flag and the result line belong to the reconciliation that made them (spec §3
// "Toolbar": the result line reads the last batch result until the next action; the
// filters reset when the screen shows another reconciliation). A batch started on one
// work screen that settles after the user opened another reconciliation neither disables
// that screen's controls nor writes its result line.

const store = () => useReconcileStore.getState()

beforeEach(() => {
    useReconcileStore.setState({ runningBatchIds: [], result: null })
})

describe('reconcile store: batch flag', () => {
    it('is running only for the reconciliation that started it', () => {
        store().startBatch('recona000000001')
        expect(isBatchRunningFor(store(), 'recona000000001')).toBe(true)
        expect(isBatchRunningFor(store(), 'reconb000000001')).toBe(false)
    })

    it('ends one reconciliation batch without ending another', () => {
        store().startBatch('recona000000001')
        store().startBatch('reconb000000001')
        store().endBatch('recona000000001')
        expect(isBatchRunningFor(store(), 'recona000000001')).toBe(false)
        expect(isBatchRunningFor(store(), 'reconb000000001')).toBe(true)
    })
})

// Reconciliation report spec §3 "The history": the Account filter is in the store, not
// persisted, and resets when the screen loses focus (resetHistory).
describe('reconcile store: history filter and sort', () => {
    it('resetHistory gives back All accounts and the newest-first sort', () => {
        store().setHistoryAccount('a')
        store().toggleHistorySort()
        expect(store().historyAccount).toBe('a')
        expect(store().historySort).toBe('ascending')
        store().resetHistory()
        expect(store().historyAccount).toBe('')
        expect(store().historySort).toBe('descending')
    })

    it('is not persisted: the store has no persist part', () => {
        expect('persist' in useReconcileStore).toBe(false)
    })
})

describe('reconcile store: result line', () => {
    it('reads the result only on the reconciliation that made it', () => {
        store().setResult('recona000000001', { text: 'Cleared 2 transactions.', tone: 'muted' })
        expect(resultFor(store(), 'recona000000001')).toEqual({
            text: 'Cleared 2 transactions.',
            tone: 'muted',
        })
        expect(resultFor(store(), 'reconb000000001')).toBeNull()
    })

    it('clears the result on the next action', () => {
        store().setResult('recona000000001', { text: 'Cleared 2 transactions.', tone: 'muted' })
        store().setResult('recona000000001', null)
        expect(resultFor(store(), 'recona000000001')).toBeNull()
    })
})

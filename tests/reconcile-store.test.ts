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

// Reconciliation report spec §3 "Undo", §4 "Writes": the undo dialog's target, and the
// synchronous flag that holds the dialog open until the server has answered.
describe('reconcile store: undo', () => {
    beforeEach(() => {
        useReconcileStore.setState({ undoTarget: null, undoingId: null, undoError: null })
    })

    it('openUndo sets the target', () => {
        store().openUndo('a')
        expect(store().undoTarget).toBe('a')
    })

    it('startUndo sets the undoing id and clears the error', () => {
        store().openUndo('a')
        useReconcileStore.setState({ undoError: 'Only a Books admin can undo a reconciliation.' })
        store().startUndo('a')
        expect(store().undoingId).toBe('a')
        expect(store().undoError).toBeNull()
    })

    it('endUndo clears the undoing id', () => {
        store().startUndo('a')
        store().endUndo()
        expect(store().undoingId).toBeNull()
    })

    it('closeUndo does nothing while an undo is sent', () => {
        store().openUndo('a')
        store().startUndo('a')
        useReconcileStore.setState({ undoError: 'The change could not be sent.' })
        store().closeUndo()
        expect(store().undoTarget).toBe('a')
        expect(store().undoingId).toBe('a')
        expect(store().undoError).toBe('The change could not be sent.')
    })

    it('closeUndo clears the target and the error when no undo is sent', () => {
        store().openUndo('a')
        useReconcileStore.setState({ undoError: 'Only a Books admin can undo a reconciliation.' })
        store().closeUndo()
        expect(store().undoTarget).toBeNull()
        expect(store().undoError).toBeNull()
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

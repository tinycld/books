import { beforeEach, describe, expect, it } from 'vitest'
import { useBankingUIStore } from '../tinycld/books/stores/banking-ui-store'

// The drawer's way and its focus request belong to the open transaction: every open and
// close resets them. The write flag `isAdding` belongs to the write: it holds until the
// write settles, so no second send starts while one is in flight, whatever the drawer
// shows. A failure that arrives after the drawer moved on is kept as `failedNote` for the
// result line, as `addedNote` keeps a success.

const store = () => useBankingUIStore.getState()

const FAILED = {
    txnId: 'a',
    description: 'cat refused',
    text: 'The transaction could not be sent. Check your connection and try again.',
}

// A drawer open on `a` in the middle of a Categorize write (write id `w1`), on the
// Transfer way.
function midWrite() {
    useBankingUIStore.setState({
        openTxnId: 'a',
        txnWay: 'transfer',
        focusForm: true,
        addedNote: { id: 'catcat000000001' },
    })
    store().startAdding('a', 'w1')
}

beforeEach(() => {
    store().closeAll()
    useBankingUIStore.setState({
        txnWay: null,
        isAdding: false,
        addingTxnId: null,
        addingWriteId: null,
        focusForm: false,
        addedNote: null,
    })
})

describe('setTxnWay', () => {
    it('keeps the chosen way', () => {
        store().openTxn('a')
        store().setTxnWay('transfer')
        expect(store().txnWay).toBe('transfer')
    })
})

describe('openTxn', () => {
    it('resets the way and asks the form for the focus', () => {
        midWrite()
        useBankingUIStore.setState({ isAdding: false, focusForm: false })
        store().openTxn('b')
        expect(store().openTxnId).toBe('b')
        expect(store().txnWay).toBeNull()
        expect(store().isAdding).toBe(false)
        expect(store().focusForm).toBe(true)
    })
})

describe('openNextTxn', () => {
    it('opens the next row on its own way, with the focus when asked', () => {
        midWrite()
        store().openNextTxn('b', true)
        expect(store().openTxnId).toBe('b')
        expect(store().txnWay).toBeNull()
        expect(store().focusForm).toBe(true)
    })

    it('opens the next row without the focus after Exclude or Match', () => {
        midWrite()
        store().openNextTxn('b', false)
        expect(store().openTxnId).toBe('b')
        expect(store().txnWay).toBeNull()
        expect(store().focusForm).toBe(false)
    })

    it('closes the drawer when there is no next row', () => {
        midWrite()
        store().openNextTxn(null, true)
        expect(store().openTxnId).toBeNull()
    })
})

describe('closing the drawer', () => {
    it('closeTxn clears the way and the focus request', () => {
        midWrite()
        store().closeTxn()
        expect(store().openTxnId).toBeNull()
        expect(store().txnWay).toBeNull()
        expect(store().focusForm).toBe(false)
    })

    it('resetReviewSelection clears them too', () => {
        midWrite()
        store().resetReviewSelection()
        expect(store().openTxnId).toBeNull()
        expect(store().txnWay).toBeNull()
        expect(store().focusForm).toBe(false)
    })

    it('closeAll clears them and the notes', () => {
        midWrite()
        store().setFailedNote(FAILED)
        store().closeAll()
        expect(store().openTxnId).toBeNull()
        expect(store().txnWay).toBeNull()
        expect(store().focusForm).toBe(false)
        expect(store().addedNote).toBeNull()
        expect(store().failedNote).toBeNull()
    })
})

describe('isAdding holds until the write settles', () => {
    it('stays set when another row is opened', () => {
        midWrite()
        store().openTxn('b')
        expect(store().openTxnId).toBe('b')
        expect(store().isAdding).toBe(true)
    })

    it('stays set when the drawer closes', () => {
        midWrite()
        store().closeTxn()
        expect(store().openTxnId).toBeNull()
        expect(store().isAdding).toBe(true)
    })

    it('stays set when a tab or account change closes the drawer', () => {
        midWrite()
        store().resetReviewSelection()
        expect(store().openTxnId).toBeNull()
        expect(store().isAdding).toBe(true)
    })

    it('stays set when the screen leaves (closeAll)', () => {
        midWrite()
        store().closeAll()
        expect(store().isAdding).toBe(true)
        expect(store().addingTxnId).toBe('a')
        expect(store().addingWriteId).toBe('w1')
    })

    it('startAdding keeps the transaction and the write id', () => {
        midWrite()
        expect(store().isAdding).toBe(true)
        expect(store().addingTxnId).toBe('a')
        expect(store().addingWriteId).toBe('w1')
    })

    it('stays set when another write settles', () => {
        midWrite()
        store().finishAdding('w2')
        expect(store().isAdding).toBe(true)
        expect(store().addingTxnId).toBe('a')
        expect(store().addingWriteId).toBe('w1')
    })

    it('clears when its own write settles', () => {
        midWrite()
        store().closeTxn()
        store().finishAdding('w1')
        expect(store().isAdding).toBe(false)
        expect(store().addingTxnId).toBeNull()
        expect(store().addingWriteId).toBeNull()
    })

    it('clears when its own write settles after the screen left', () => {
        midWrite()
        store().closeAll()
        store().finishAdding('w1')
        expect(store().isAdding).toBe(false)
    })
})

describe('failedNote', () => {
    it('names the transaction and carries the text', () => {
        store().setFailedNote(FAILED)
        expect(store().failedNote).toEqual(FAILED)
    })

    it('outlives the drawer moving on', () => {
        midWrite()
        store().setFailedNote(FAILED)
        store().openTxn('b')
        expect(store().failedNote).toEqual(FAILED)
        store().openNextTxn('c', false)
        expect(store().failedNote).toEqual(FAILED)
        store().closeTxn()
        expect(store().failedNote).toEqual(FAILED)
    })

    it('replaces the added note, and a later success replaces it', () => {
        midWrite()
        store().setFailedNote(FAILED)
        expect(store().addedNote).toBeNull()
        store().setAddedNote({ id: 'catcat000000002' })
        expect(store().failedNote).toBeNull()
        expect(store().addedNote).toEqual({ id: 'catcat000000002' })
    })

    it('clears with null', () => {
        store().setFailedNote(FAILED)
        store().setFailedNote(null)
        expect(store().failedNote).toBeNull()
    })
})

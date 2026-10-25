import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ENTRIES_RANGE } from '../tinycld/books/lib/entries-query'
import { useEntriesUiStore } from '../tinycld/books/stores/entries-ui-store'

const store = () => useEntriesUiStore.getState()

beforeEach(() => {
    useEntriesUiStore.setState({
        status: 'all',
        search: '',
        range: DEFAULT_ENTRIES_RANGE,
        rowLimit: 100,
        dialog: null,
    })
})

describe('growRowLimit', () => {
    it('grows once for a burst of calls that pass the same from', () => {
        store().growRowLimit(100)
        store().growRowLimit(100)
        expect(store().rowLimit).toBe(200)
    })

    it('does nothing when from is behind the current limit', () => {
        store().growRowLimit(100)
        expect(store().rowLimit).toBe(200)
        store().growRowLimit(100)
        expect(store().rowLimit).toBe(200)
    })

    it('grows again from the new limit', () => {
        store().growRowLimit(100)
        store().growRowLimit(200)
        expect(store().rowLimit).toBe(300)
    })
})

describe('row limit reset', () => {
    beforeEach(() => {
        store().growRowLimit(100)
        expect(store().rowLimit).toBe(200)
    })

    it('setStatus resets it', () => {
        store().setStatus('draft')
        expect(store().rowLimit).toBe(100)
    })

    it('setSearch resets it', () => {
        store().setSearch('rent')
        expect(store().rowLimit).toBe(100)
    })

    it('setRange resets it', () => {
        store().setRange('all-dates')
        expect(store().rowLimit).toBe(100)
    })

    it('clearFilters resets it', () => {
        store().clearFilters()
        expect(store().rowLimit).toBe(100)
    })
})

describe('dialog', () => {
    it('openDialog sets the target and closeDialog clears it', () => {
        store().openDialog('void', 'e1')
        expect(store().dialog).toEqual({ kind: 'void', entryId: 'e1' })
        store().closeDialog()
        expect(store().dialog).toBeNull()
    })

    it('closeDialog(target) clears the dialog only when it is that target', () => {
        store().openDialog('reverse', 'e2')
        store().closeDialog({ kind: 'void', entryId: 'e1' })
        expect(store().dialog).toEqual({ kind: 'reverse', entryId: 'e2' })
        store().closeDialog({ kind: 'void', entryId: 'e2' })
        expect(store().dialog).toEqual({ kind: 'reverse', entryId: 'e2' })
        store().closeDialog({ kind: 'reverse', entryId: 'e1' })
        expect(store().dialog).toEqual({ kind: 'reverse', entryId: 'e2' })
        store().closeDialog({ kind: 'reverse', entryId: 'e2' })
        expect(store().dialog).toBeNull()
    })

    it('closeDialog() without a target clears unconditionally', () => {
        store().openDialog('delete', 'e3')
        store().closeDialog()
        expect(store().dialog).toBeNull()
    })
})

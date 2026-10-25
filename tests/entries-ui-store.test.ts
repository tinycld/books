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

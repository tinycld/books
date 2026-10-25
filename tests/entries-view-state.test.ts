import { describe, expect, it } from 'vitest'
import { entriesViewState } from '../tinycld/books/lib/entries-query'

const BASE = {
    isReady: true,
    isError: false,
    hasRows: true,
    isFilterActive: false,
    keepsRows: false,
}

describe('entriesViewState', () => {
    it('is error when the query failed', () => {
        expect(entriesViewState({ ...BASE, isError: true })).toBe('error')
    })

    it('is loading while not ready', () => {
        expect(entriesViewState({ ...BASE, isReady: false, hasRows: false })).toBe('loading')
    })

    it('is ready with rows', () => {
        expect(entriesViewState(BASE)).toBe('ready')
    })

    it('is empty with no rows and no filter', () => {
        expect(entriesViewState({ ...BASE, hasRows: false })).toBe('empty')
    })

    it('is no-match with no rows and a filter', () => {
        expect(entriesViewState({ ...BASE, hasRows: false, isFilterActive: true })).toBe('no-match')
    })

    it('stays ready while a later page loads over shown rows', () => {
        expect(entriesViewState({ ...BASE, isReady: false, keepsRows: true })).toBe('ready')
    })

    it('is loading when a page loads and there are no rows to keep', () => {
        expect(entriesViewState({ ...BASE, isReady: false, keepsRows: true, hasRows: false })).toBe(
            'loading'
        )
    })

    it('is loading when not ready and the rows are not kept', () => {
        expect(entriesViewState({ ...BASE, isReady: false, keepsRows: false })).toBe('loading')
    })

    it('lets error win over kept rows', () => {
        expect(entriesViewState({ ...BASE, isReady: false, isError: true, keepsRows: true })).toBe(
            'error'
        )
    })
})

import { createLiveQueryCollection, eq } from '@tanstack/db'
import { createCollection, disconnectRealtime } from 'pbtsdb/core'
import { describe, expect, it } from 'vitest'
import { registerCollections } from '../tinycld/books/collections'
import {
    anyRecordState,
    hasListFilter,
    type ListFilters,
    listFilter,
    searchPieces,
} from '../tinycld/books/lib/list-search'
import { OfflinePocketBase } from './offline-pocketbase'

// The filter one vendors list query sends for `filters`, as the real pbtsdb sends it.
async function vendorFilter(filters: ListFilters) {
    const pb = new OfflinePocketBase()
    disconnectRealtime(pb)
    const newCollection = createCollection(pb)
    const books = registerCollections(
        newCollection as never,
        { users: newCollection('users') } as never
    )
    const query = createLiveQueryCollection(q =>
        q.from({ vendor: books.books_vendors }).where(({ vendor }) =>
            listFilter(
                {
                    isActive: eq(vendor.inactive, false),
                    text: [vendor.display_name, vendor.company, vendor.email, vendor.phone],
                },
                filters
            )
        )
    )
    await query.preload()
    await query.cleanup()
    return pb.filters
}

const TEXT = (term: string) =>
    `display_name ~ "%${term}%" || company ~ "%${term}%" || email ~ "%${term}%" || phone ~ "%${term}%"`

describe('searchPieces', () => {
    it('trims the text and keeps inner spaces', () => {
        expect(searchPieces('  cedar and pine ')).toEqual(['cedar and pine'])
    })

    it('cuts the text where %, _ or \\ stood', () => {
        expect(searchPieces('100% off')).toEqual(['100', 'off'])
        expect(searchPieces('a_b\\c')).toEqual(['a', 'b', 'c'])
        expect(searchPieces('C:\\')).toEqual(['C:'])
    })

    it('leaves nothing of a text made only of those characters', () => {
        expect(searchPieces('%_\\ ')).toEqual([])
        expect(searchPieces('')).toEqual([])
    })
})

describe('hasListFilter', () => {
    it('filters unless Show inactive is on and there is nothing to search', () => {
        expect(hasListFilter({ search: '', showInactive: false })).toBe(true)
        expect(hasListFilter({ search: 'harbor', showInactive: true })).toBe(true)
        expect(hasListFilter({ search: ' %% ', showInactive: true })).toBe(false)
        expect(hasListFilter({ search: '', showInactive: true })).toBe(false)
    })
})

describe('listFilter, as pbtsdb sends it to the server', () => {
    it('keeps active rows only', async () => {
        expect(await vendorFilter({ search: '', showInactive: false })).toEqual([
            'inactive = false',
        ])
    })

    it('matches the text in any column, with Show inactive on', async () => {
        expect(await vendorFilter({ search: 'Harbor', showInactive: true })).toEqual([
            `(${TEXT('Harbor')})`,
        ])
    })

    it('needs every piece, and the inactive filter, when both apply', async () => {
        expect(await vendorFilter({ search: '100% off', showInactive: false })).toEqual([
            `((${TEXT('100')}) && (${TEXT('off')}) && inactive = false)`,
        ])
    })

    it('escapes a quote in the text', async () => {
        expect(await vendorFilter({ search: 'say "hi"', showInactive: true })).toEqual([
            `(${TEXT('say \\"hi\\"')})`,
        ])
    })
})

describe('anyRecordState', () => {
    it('is true while the list shows rows, without asking', () => {
        expect(anyRecordState(false, { isReady: false, data: undefined })).toBe(true)
    })

    it('is unknown until the one-row query answers', () => {
        expect(anyRecordState(true, { isReady: false, data: undefined })).toBeUndefined()
    })

    it('says whether that query found a row', () => {
        expect(anyRecordState(true, { isReady: true, data: [] })).toBe(false)
        expect(anyRecordState(true, { isReady: true, data: [{ id: 'a' }] })).toBe(true)
    })
})

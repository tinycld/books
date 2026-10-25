import {
    BasicIndex,
    type Context,
    createCollection,
    createLiveQueryCollection,
    type InitialQueryBuilder,
    localOnlyCollectionOptions,
    type QueryBuilder,
} from '@tanstack/db'
import { describe, expect, it } from 'vitest'
import {
    entriesFilterActive,
    entriesWhere,
    entryMatchesSearch,
    searchTerm,
} from '../tinycld/books/lib/entries-query'
import { ENTRIES } from '../tinycld/books/lib/journal-entries-fixture'
import type { BooksJournalEntries } from '../tinycld/books/types'

const DEFAULTS = { status: 'all', search: '', range: 'this-fiscal-year' } as const
const NO_TERM = { status: 'all', search: '' } as const

function entriesStore() {
    return createCollection(
        localOnlyCollectionOptions({
            id: `entries-${Math.random()}`,
            getKey: (row: BooksJournalEntries) => row.id,
            initialData: ENTRIES,
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        })
    )
}

async function run<TContext extends Context>(
    build: (query: InitialQueryBuilder) => QueryBuilder<TContext>
) {
    const live = createLiveQueryCollection({ query: build, startSync: true })
    await live.preload()
    return live.toArray
}

// Applies every clause `entriesWhere` returns, one `.where` each, and returns the matching ids.
async function matching(
    filters: Parameters<typeof entriesWhere>[0],
    range: Parameters<typeof entriesWhere>[1]
) {
    const entries = entriesStore()
    const rows = await run(query =>
        entriesWhere(filters, range).reduce(
            (q, clause) => q.where(clause),
            query.from({ entry: entries })
        )
    )
    return rows.map(row => row.id).sort()
}

describe('entriesFilterActive', () => {
    it('is false for the defaults', () => {
        expect(entriesFilterActive(DEFAULTS)).toBe(false)
    })

    it.each([
        ['a status', { ...DEFAULTS, status: 'draft' }],
        ['a search', { ...DEFAULTS, search: 'wages' }],
        ['a different range', { ...DEFAULTS, range: 'last-month' }],
        ['all dates', { ...DEFAULTS, range: 'all-dates' }],
    ] as const)('is true when %s differs', (_label, state) => {
        expect(entriesFilterActive(state)).toBe(true)
    })
})

describe('searchTerm', () => {
    it('trims the text', () => {
        expect(searchTerm('  JE-10 ')).toBe('JE-10')
    })
})

describe('entriesWhere', () => {
    const ALL_IDS = ENTRIES.map(row => row.id).sort()

    it('adds no clause for the defaults without a range', async () => {
        expect(entriesWhere(NO_TERM, null)).toEqual([])
        expect(await matching(NO_TERM, null)).toEqual(ALL_IDS)
    })

    it('adds the status clause only when the status is not all', async () => {
        expect(await matching({ ...NO_TERM, status: 'draft' }, null)).toEqual(['je_draft_1'])
        expect(await matching({ ...NO_TERM, status: 'void' }, null)).toEqual(['je_1049'])
        const posted = await matching({ ...NO_TERM, status: 'posted' }, null)
        expect(posted).toEqual(ALL_IDS.filter(id => id !== 'je_draft_1' && id !== 'je_1049'))
    })

    it('adds date bounds only with a range, inclusive at both ends', async () => {
        const range = { start: '2026-09-30', end: '2026-10-01' }
        expect(await matching(NO_TERM, range)).toEqual(['je_1046', 'je_1050', 'je_1051'])
        expect(entriesWhere(NO_TERM, range).length).toBeGreaterThan(0)
    })

    it('adds the search clause only with a term, matching number or memo', async () => {
        expect(await matching({ ...NO_TERM, search: 'JE-1052' }, null)).toEqual(['je_1052'])
        expect(await matching({ ...NO_TERM, search: 'Accrue August payroll taxes' }, null)).toEqual(
            ['je_1047']
        )
        expect(await matching({ ...NO_TERM, search: 'zzzz-no-such' }, null)).toEqual([])
        expect(entriesWhere({ ...NO_TERM, search: '   ' }, null)).toEqual([])
    })

    it('matches the number and memo regardless of case', async () => {
        expect(await matching({ ...NO_TERM, search: 'accrue august payroll taxes' }, null)).toEqual(
            ['je_1047']
        )
        expect(await matching({ ...NO_TERM, search: 'ACCRUE AUGUST PAYROLL TAXES' }, null)).toEqual(
            ['je_1047']
        )
        expect(await matching({ ...NO_TERM, search: 'je-1052' }, null)).toEqual(['je_1052'])
    })

    it('combines status, range and search', async () => {
        const range = { start: '2026-09-01', end: '2026-10-31' }
        expect(await matching({ status: 'posted', search: 'wages accrual' }, range)).toEqual([
            'je_1046',
            'je_1051',
        ])
        expect(await matching({ status: 'posted', search: 'Reversal of' }, range)).toEqual([
            'je_1051',
        ])
        expect(await matching({ status: 'draft', search: 'JE-1052' }, range)).toEqual([])
    })
})

describe('entryMatchesSearch', () => {
    const entry = { number: 'JE-1046', memo: 'Wages accrual, 50% bonus' }

    it('matches the memo regardless of case', () => {
        expect(entryMatchesSearch(entry, 'WAGES ACCRUAL')).toBe(true)
        expect(entryMatchesSearch(entry, 'wages accrual')).toBe(true)
    })

    it('matches the number regardless of case', () => {
        expect(entryMatchesSearch(entry, 'je-1046')).toBe(true)
        expect(entryMatchesSearch(entry, 'JE-1046')).toBe(true)
    })

    it('matches a substring', () => {
        expect(entryMatchesSearch(entry, '104')).toBe(true)
        expect(entryMatchesSearch(entry, 'accru')).toBe(true)
    })

    it('does not match when neither field contains the term', () => {
        expect(entryMatchesSearch(entry, 'zzzz-no-such')).toBe(false)
    })

    it('trims whitespace around the term', () => {
        expect(entryMatchesSearch(entry, '  JE-10 ')).toBe(true)
    })

    it.each(['', '   '])('matches every entry for the empty term %j', term => {
        expect(entryMatchesSearch(entry, term)).toBe(true)
        expect(entryMatchesSearch({ number: '', memo: '' }, term)).toBe(true)
    })

    it('does not throw for an optimistic row with no number, and still matches its memo', () => {
        const optimistic = { number: undefined, memo: 'Wages accrual' } as unknown as Parameters<
            typeof entryMatchesSearch
        >[0]
        expect(entryMatchesSearch(optimistic, 'wages')).toBe(true)
        expect(entryMatchesSearch(optimistic, 'je-1')).toBe(false)
    })

    it('does not throw for a row with no memo, and still matches its number', () => {
        const noMemo = { number: 'JE-7', memo: undefined } as unknown as Parameters<
            typeof entryMatchesSearch
        >[0]
        expect(entryMatchesSearch(noMemo, 'je-7')).toBe(true)
        expect(entryMatchesSearch(noMemo, 'wages')).toBe(false)
    })

    it('matches % and _ literally', () => {
        expect(entryMatchesSearch({ number: 'JE-1', memo: 'Bonus 50%' }, '50%')).toBe(true)
        expect(entryMatchesSearch({ number: 'JE-2', memo: 'Bonus 500' }, '50%')).toBe(false)
        expect(entryMatchesSearch({ number: 'JE-3', memo: 'a_b' }, 'a_b')).toBe(true)
        expect(entryMatchesSearch({ number: 'JE-4', memo: 'axb' }, 'a_b')).toBe(false)
    })
})

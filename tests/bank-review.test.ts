import { describe, expect, it } from 'vitest'
import {
    REVIEW_TABS,
    reviewCountText,
    reviewEmptyText,
    reviewTabFromParam,
    reviewTabItems,
    reviewViewState,
    txnAmountCells,
    txnPhoneLine,
    txnSecondLine,
} from '../tinycld/books/lib/bank-review'

describe('reviewTabFromParam', () => {
    it('keeps each known tab as it is', () => {
        for (const tab of ['review', 'reviewed', 'excluded', 'files'] as const) {
            expect(reviewTabFromParam(tab)).toBe(tab)
        }
    })

    it('falls back to For review for a missing, empty or unknown param', () => {
        expect(reviewTabFromParam(undefined)).toBe('review')
        expect(reviewTabFromParam('')).toBe('review')
        expect(reviewTabFromParam('foo')).toBe('review')
    })

    it('reads the first value of a repeated param', () => {
        expect(reviewTabFromParam(['excluded', 'files'])).toBe('excluded')
    })
})

describe('reviewTabItems', () => {
    it('labels the tabs in REVIEW_TABS order, with the count on For review only', () => {
        const items = reviewTabItems(12)
        expect(items.map(item => item.label)).toEqual([
            'For review (12)',
            'Reviewed',
            'Excluded',
            'Files',
        ])
        expect(items.map(item => item.value)).toEqual([...REVIEW_TABS])
        expect([...REVIEW_TABS]).toEqual(['review', 'reviewed', 'excluded', 'files'])
    })

    it('shows no count on For review at 0', () => {
        expect(reviewTabItems(0)[0].label).toBe('For review')
    })
})

describe('reviewCountText', () => {
    it('says how many transactions wait, or that none do', () => {
        expect(reviewCountText(0)).toBe('Nothing to review')
        expect(reviewCountText(1)).toBe('1 to review')
        expect(reviewCountText(12)).toBe('12 to review')
    })
})

describe('reviewViewState', () => {
    it('shows the error before anything else', () => {
        expect(
            reviewViewState({ isReady: false, isError: true, rowCount: 0, hasFilter: false })
        ).toBe('error')
        expect(
            reviewViewState({ isReady: true, isError: true, rowCount: 3, hasFilter: true })
        ).toBe('error')
    })

    it('is loading until the read is ready', () => {
        expect(
            reviewViewState({ isReady: false, isError: false, rowCount: 0, hasFilter: false })
        ).toBe('loading')
    })

    it('is ready with rows, with or without a filter', () => {
        expect(
            reviewViewState({ isReady: true, isError: false, rowCount: 3, hasFilter: false })
        ).toBe('ready')
        expect(
            reviewViewState({ isReady: true, isError: false, rowCount: 3, hasFilter: true })
        ).toBe('ready')
    })

    it('tells no-match under a filter from empty without one', () => {
        expect(
            reviewViewState({ isReady: true, isError: false, rowCount: 0, hasFilter: true })
        ).toBe('no-match')
        expect(
            reviewViewState({ isReady: true, isError: false, rowCount: 0, hasFilter: false })
        ).toBe('empty')
    })
})

describe('reviewEmptyText', () => {
    it('gives each tab its empty sentence', () => {
        expect(reviewEmptyText('review', 2)).toBe(
            'Nothing to review. 2 files are waiting to import.'
        )
        expect(reviewEmptyText('review', 1)).toBe('Nothing to review. 1 file is waiting to import.')
        expect(reviewEmptyText('review', 0)).toBe(
            'Nothing to review. Upload a statement and import it to see its transactions here.'
        )
        expect(reviewEmptyText('reviewed', 3)).toBe(
            'No reviewed transactions yet. A transaction moves here when you match or categorize it.'
        )
        expect(reviewEmptyText('excluded', 0)).toBe(
            'No excluded transactions. Exclude a transaction in For review to keep it out of your books.'
        )
    })
})

describe('txnAmountCells', () => {
    it('puts money out in Spent and money in in Received, without a sign', () => {
        expect(txnAmountCells(-8647, 'USD')).toEqual({ spent: '$86.47', received: '' })
        expect(txnAmountCells(425000, 'USD')).toEqual({ spent: '', received: '$4,250.00' })
    })

    it('leaves both cells empty for a zero amount', () => {
        expect(txnAmountCells(0, 'USD')).toEqual({ spent: '', received: '' })
    })
})

describe('txnSecondLine', () => {
    it('joins the memo and the check number', () => {
        expect(txnSecondLine('Window cleaning, Q3', '1043')).toBe(
            'Window cleaning, Q3 · Check 1043'
        )
    })

    it('shows either part alone, and nothing when both are blank', () => {
        expect(txnSecondLine('', '1049')).toBe('Check 1049')
        expect(txnSecondLine('INV-1041', '')).toBe('INV-1041')
        expect(txnSecondLine(' ', '')).toBe('')
    })
})

describe('txnPhoneLine', () => {
    it('reads the day, then the check number when there is one', () => {
        expect(txnPhoneLine('2026-09-30', '1043')).toBe('Sep 30, 2026 · Check 1043')
        expect(txnPhoneLine('2026-09-30', '')).toBe('Sep 30, 2026')
    })
})

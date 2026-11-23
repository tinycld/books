import { describe, expect, it } from 'vitest'
import {
    canUndoRow,
    clearedCountText,
    HISTORY_KEYS,
    HISTORY_TEXTS,
    type HistorySort,
    historyAccounts,
    historyMenuItems,
    historyState,
    latestFinishedIds,
    reconciledByText,
    reconciledCardText,
    shownHistory,
    undoDialogTexts,
    undoResultText,
} from '../tinycld/books/lib/reconcile-history'
import type { BooksAccounts, BooksReconciliations } from '../tinycld/books/types'

// The pure parts of the History tab (reconciliation report spec §3 "The history", §4
// "Reads" and "Client modules"; plan checkpoint 3). The rows are the history query's rows:
// a finished reconciliation with its account (`accountRow`, the query's materialize()).

type AccountPart = Pick<BooksAccounts, 'id' | 'name' | 'full_name' | 'number' | 'type' | 'currency'>

type HistoryRow = Pick<
    BooksReconciliations,
    | 'id'
    | 'account'
    | 'statement_date'
    | 'statement_balance'
    | 'beginning_balance'
    | 'cleared_out_count'
    | 'cleared_in_count'
    | 'status'
    | 'finished_at'
    | 'finished_by'
    | 'finished_by_name'
    | 'currency'
> & { accountRow: AccountPart }

function account(id: string, number: string, name: string): AccountPart {
    return { id, name, full_name: name, number, type: 'bank', currency: 'USD' }
}

const CHECKING = account('acctchecking001', '1000', 'Business Checking')
const SAVINGS = account('acctsavings0001', '1010', 'Business Savings')
const CARD = account('acctcard0000001', '2100', 'Company Card')

function row(
    id: string,
    accountRow: AccountPart,
    statementDate: string,
    extra: Partial<HistoryRow> = {}
): HistoryRow {
    return {
        id,
        account: accountRow.id,
        statement_date: statementDate,
        statement_balance: 500_000,
        beginning_balance: 400_000,
        cleared_out_count: 1,
        cleared_in_count: 3,
        status: 'finished',
        // Midday UTC: the local day is Nov 21 in every time zone the tests run in.
        finished_at: '2026-11-21 12:04:00.000Z',
        finished_by: 'userana00000001',
        finished_by_name: 'Ana Ruiz',
        currency: 'USD',
        accountRow,
        ...extra,
    }
}

// Three statements of 1000 Business Checking and one of 1010 Business Savings, listed out
// of order. Checking's October and Savings's October share a statement date.
const CHECKING_AUG = row('rchk20260831aaa', CHECKING, '2026-08-31')
const CHECKING_SEP = row('rchk20260930aaa', CHECKING, '2026-09-30')
const CHECKING_OCT = row('rchk20261031aaa', CHECKING, '2026-10-31')
const SAVINGS_OCT = row('rsav20261031aaa', SAVINGS, '2026-10-31')
const CARD_SEP = row('rcrd20260930aaa', CARD, '2026-09-30')

const ids = (rows: readonly { id: string }[]) => rows.map(r => r.id)

describe('latestFinishedIds', () => {
    it('gives the row with the latest statement date of each account', () => {
        const latest = latestFinishedIds([CHECKING_SEP, SAVINGS_OCT, CHECKING_OCT, CHECKING_AUG])
        expect([...latest].sort()).toEqual([CHECKING_OCT.id, SAVINGS_OCT.id].sort())
    })

    it('gives an empty set for no row', () => {
        expect(latestFinishedIds([]).size).toBe(0)
    })
})

describe('historyAccounts', () => {
    it('lists each account that has a row once, by account number, as "<number> <name>"', () => {
        expect(historyAccounts([CARD_SEP, SAVINGS_OCT, CHECKING_SEP, CHECKING_OCT])).toEqual([
            { id: CHECKING.id, label: '1000 Business Checking' },
            { id: SAVINGS.id, label: '1010 Business Savings' },
            { id: CARD.id, label: '2100 Company Card' },
        ])
    })
})

describe('shownHistory', () => {
    const ALL = [CHECKING_SEP, CARD_SEP, SAVINGS_OCT, CHECKING_AUG, CHECKING_OCT]

    it('with no account shows every row, newest statement first, then by account number', () => {
        expect(ids(shownHistory(ALL, '', 'descending'))).toEqual([
            CHECKING_OCT.id,
            SAVINGS_OCT.id,
            CHECKING_SEP.id,
            CARD_SEP.id,
            CHECKING_AUG.id,
        ])
    })

    it('ascending reverses the dates and keeps the account order inside a date', () => {
        const sort: HistorySort = 'ascending'
        expect(ids(shownHistory(ALL, '', sort))).toEqual([
            CHECKING_AUG.id,
            CHECKING_SEP.id,
            CARD_SEP.id,
            CHECKING_OCT.id,
            SAVINGS_OCT.id,
        ])
    })

    it('with an account shows only its rows', () => {
        expect(ids(shownHistory(ALL, CHECKING.id, 'descending'))).toEqual([
            CHECKING_OCT.id,
            CHECKING_SEP.id,
            CHECKING_AUG.id,
        ])
    })

    it('with an account that has no row shows none', () => {
        expect(shownHistory(ALL, 'acctnorows00001', 'descending')).toEqual([])
    })
})

describe('clearedCountText', () => {
    it('counts the cleared transactions of both sides', () => {
        expect(
            clearedCountText(
                row('rzero0000000001', CHECKING, '2026-10-31', {
                    cleared_out_count: 0,
                    cleared_in_count: 0,
                })
            )
        ).toBe('0 transactions')
        expect(
            clearedCountText(
                row('rone00000000001', CHECKING, '2026-10-31', {
                    cleared_out_count: 0,
                    cleared_in_count: 1,
                })
            )
        ).toBe('1 transaction')
        expect(
            clearedCountText(
                row('rfour000000001', CHECKING, '2026-10-31', {
                    cleared_out_count: 1,
                    cleared_in_count: 3,
                })
            )
        ).toBe('4 transactions')
    })
})

describe('reconciled texts', () => {
    const named = row('rnamed00000001', CHECKING, '2026-10-31')
    const unnamed = row('runnamed000001', CHECKING, '2026-10-31', { finished_by_name: '' })

    it('reconciledByText gives the day and the name, or only the day', () => {
        expect(reconciledByText(named)).toBe('Nov 21, 2026 · Ana Ruiz')
        expect(reconciledByText(unnamed)).toBe('Nov 21, 2026')
    })

    it('reconciledCardText gives "Reconciled <day> by <name>", or only the day', () => {
        expect(reconciledCardText(named)).toBe('Reconciled Nov 21, 2026 by Ana Ruiz')
        expect(reconciledCardText(unnamed)).toBe('Reconciled Nov 21, 2026')
    })
})

describe('historyState', () => {
    const ALL = [CHECKING_OCT, SAVINGS_OCT]
    const base = { isLoading: false, isError: false, all: ALL, shown: ALL, accountId: '' }

    it('is loading while a query loads', () => {
        expect(historyState({ ...base, isLoading: true, all: [], shown: [] })).toBe('loading')
    })

    it('is error when a query failed, also while another still loads', () => {
        expect(historyState({ ...base, isError: true })).toBe('error')
        expect(historyState({ ...base, isError: true, isLoading: true, all: [], shown: [] })).toBe(
            'error'
        )
    })

    it('is empty when no reconciliation is finished', () => {
        expect(historyState({ ...base, all: [], shown: [] })).toBe('empty')
    })

    it('is empty-filtered when a picked account has no row', () => {
        expect(historyState({ ...base, shown: [], accountId: 'acctnorows00001' })).toBe(
            'empty-filtered'
        )
    })

    it('is rows otherwise', () => {
        expect(historyState(base)).toBe('rows')
        expect(historyState({ ...base, shown: [CHECKING_OCT], accountId: CHECKING.id })).toBe(
            'rows'
        )
    })

    it('has the texts of the two empty states', () => {
        expect(HISTORY_TEXTS.emptyFiltered('1010 Business Savings')).toBe(
            '1010 Business Savings has no finished reconciliation.'
        )
        expect(HISTORY_TEXTS.empty).toBe(
            'No reconciliation is finished yet. A finished reconciliation shows here with its report.'
        )
    })
})

describe('historyMenuItems', () => {
    it('offers only View report for a row that is not the latest, or when Undo is not offered', () => {
        // `canUndo` is false for a row that is not the latest of its account, and on the
        // card of this checkpoint.
        expect(historyMenuItems(CHECKING_SEP, false)).toEqual(['report'])
        expect(historyMenuItems(CHECKING_OCT, false)).toEqual(['report'])
    })

    it('offers View report and Undo reconciliation on the latest row of an admin', () => {
        expect(historyMenuItems(CHECKING_OCT, true)).toEqual(['report', 'undo'])
    })
})

// Reconciliation report spec §3 "Undo" (plan checkpoint 4): the dialog's texts, the work
// screen's result line after an undo, and who sees Undo on a history row.
describe('undoDialogTexts', () => {
    const counted = (out: number, inCount: number) =>
        row('rundo0000000001', CHECKING, '2026-10-31', {
            cleared_out_count: out,
            cleared_in_count: inCount,
        })

    it('with none in progress: the title, not blocked, and the text with the count of both sides', () => {
        const texts = undoDialogTexts(counted(4, 10), CHECKING, undefined)
        expect(texts.title).toBe('Undo this reconciliation?')
        expect(texts.isBlocked).toBe(false)
        expect(texts.text).toBe(
            '1000 Business Checking, statement of Oct 31, 2026. Its 14 transactions are no longer reconciled, so they can be changed or voided again. They stay cleared: the reconciliation returns to In progress. Correct it and finish it again, or discard it.'
        )
    })

    it('with one cleared transaction: the singular text', () => {
        const texts = undoDialogTexts(counted(0, 1), CHECKING, undefined)
        expect(texts.isBlocked).toBe(false)
        expect(texts.text).toBe(
            '1000 Business Checking, statement of Oct 31, 2026. Its 1 transaction is no longer reconciled, so it can be changed or voided again. It stays cleared: the reconciliation returns to In progress. Correct it and finish it again, or discard it.'
        )
    })

    it('with no cleared transaction: the text says it has none', () => {
        const texts = undoDialogTexts(counted(0, 0), CHECKING, undefined)
        expect(texts.isBlocked).toBe(false)
        expect(texts.text).toBe(
            '1000 Business Checking, statement of Oct 31, 2026. It has no cleared transaction. The reconciliation returns to In progress. Correct it and finish it again, or discard it.'
        )
    })

    it('with a reconciliation in progress on the account: blocked, and the text names its statement', () => {
        const open = row('ropen0000000001', CHECKING, '2026-11-30', { status: 'in_progress' })
        const texts = undoDialogTexts(counted(4, 10), CHECKING, open)
        expect(texts.isBlocked).toBe(true)
        expect(texts.text).toBe(
            '1000 Business Checking has a reconciliation in progress (statement of Nov 30, 2026). Discard it before you undo this one.'
        )
    })
})

describe('undoResultText', () => {
    it('names the count of transactions that stay cleared, or none at 0', () => {
        expect(undoResultText(14)).toBe(
            'The reconciliation is in progress again. Its 14 transactions stay cleared.'
        )
        expect(undoResultText(1)).toBe(
            'The reconciliation is in progress again. Its 1 transaction stays cleared.'
        )
        expect(undoResultText(0)).toBe('The reconciliation is in progress again.')
    })
})

describe('canUndoRow', () => {
    const latest = new Set([CHECKING_OCT.id, SAVINGS_OCT.id])

    it('is true for an admin on the latest row of its account', () => {
        expect(canUndoRow(CHECKING_OCT, latest, true)).toBe(true)
        expect(canUndoRow(SAVINGS_OCT, latest, true)).toBe(true)
    })

    it('is false for an admin on an earlier row', () => {
        expect(canUndoRow(CHECKING_SEP, latest, true)).toBe(false)
        expect(canUndoRow(CHECKING_AUG, latest, true)).toBe(false)
    })

    it('is false for a user who is not an admin, also on the latest row', () => {
        expect(canUndoRow(CHECKING_OCT, latest, false)).toBe(false)
        expect(canUndoRow(CHECKING_SEP, latest, false)).toBe(false)
    })
})

describe('HISTORY_KEYS', () => {
    it('maps J and ↓ to next, K and ↑ to previous, ↵ and O to open, R to report, and no other key', () => {
        const byKey = Object.fromEntries(
            Object.entries(HISTORY_KEYS).flatMap(([action, keys]) =>
                [...keys].map(key => [key, action])
            )
        )
        expect(byKey).toEqual({
            j: 'next',
            ArrowDown: 'next',
            k: 'previous',
            ArrowUp: 'previous',
            Enter: 'open',
            o: 'open',
            r: 'report',
        })
    })
})

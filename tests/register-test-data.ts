// Ledger rows for the register query tests: the fixture plus three lines that a
// correct query must leave out of the register of REGISTER_ACCOUNT_ID.
import {
    BALANCES,
    ENTRIES,
    LINES,
    REGISTER_ACCOUNT_ID,
} from '../tinycld/books/lib/account-register-fixture'
import type { BooksJournalEntries, BooksJournalLines } from '../tinycld/books/types'

export const RANGE = { start: '2026-10-01', end: '2026-10-23' }

export const DRAFT_IN_RANGE_LINE = 'line_draft_in_range'
export const AFTER_END_LINE = 'line_after_range_end'

const afterEndEntry: BooksJournalEntries = {
    ...ENTRIES[0],
    id: 'je_1070',
    number: 'JE-1070',
    date: '2026-10-30',
    posted_at: '2026-10-30 09:00:00.000Z',
}

export function registerLine(
    id: string,
    seed: Partial<BooksJournalLines> & Pick<BooksJournalLines, 'entry' | 'account'>
): BooksJournalLines {
    return {
        id,
        debit: 1_000,
        credit: 0,
        memo: '',
        position: 0,
        posted: true,
        date: '2026-10-12',
        currency: 'USD',
        created: '2026-10-12 08:00:00.000Z',
        updated: '2026-10-12 08:00:00.000Z',
        ...seed,
    }
}

export const SEED_ENTRIES: BooksJournalEntries[] = [...ENTRIES, afterEndEntry]

export const SEED_LINES: BooksJournalLines[] = [
    ...LINES,
    registerLine(DRAFT_IN_RANGE_LINE, {
        entry: 'je_1060',
        account: REGISTER_ACCOUNT_ID,
        posted: false,
        date: '2026-10-10',
    }),
    registerLine(AFTER_END_LINE, {
        entry: afterEndEntry.id,
        account: REGISTER_ACCOUNT_ID,
        date: '2026-10-30',
    }),
]

export { BALANCES }

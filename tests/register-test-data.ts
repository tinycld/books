// Ledger rows for the register query tests: the fixture plus three lines that a
// correct query must leave out of the register of REGISTER_ACCOUNT_ID.
import {
    BALANCES,
    ENTRIES,
    LINES,
    REGISTER_ACCOUNT_ID,
} from '../tinycld/books/lib/account-register-fixture'
import {
    RECONCILIATION_EMPTY,
    RECONCILIATION_SAVINGS_FINISHED,
} from '../tinycld/books/lib/reconcile-fixture'
import type {
    BooksJournalEntries,
    BooksJournalLines,
    BooksReconcileLines,
    BooksReconciliations,
} from '../tinycld/books/types'

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
        customer: '',
        vendor: '',
        position: 0,
        posted: true,
        date: '2026-10-12',
        currency: 'USD',
        card_payment: false,
        doc_type: 'journal',
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

// The `books_reconcile_lines` view row of a journal line: its id is the line id
// (reconcile spec §4 "Schema"). `reconciliation` is '' for a line no reconciliation holds.
export function reconcileViewRow(
    line: BooksJournalLines,
    seed: Partial<Pick<BooksReconcileLines, 'reconciliation' | 'finished' | 'bank_matched'>> = {}
): BooksReconcileLines {
    return {
        id: line.id,
        line: line.id,
        account: line.account,
        entry: line.entry,
        date: line.date,
        debit: line.debit,
        credit: line.credit,
        memo: line.memo,
        number: '',
        doc_type: 'journal',
        origin: 'manual',
        document: '',
        payee: '',
        reconciliation: '',
        finished: false,
        bank_matched: false,
        ...seed,
    }
}

export const FINISHED_RECONCILIATION_ID = 'recfinished0001'
export const PROGRESS_RECONCILIATION_ID = 'recprogress0001'

// Three posted October lines of the register account, each with a view row of its own; every
// other line of the account has none.
const octoberLines = SEED_LINES.filter(
    l =>
        l.account === REGISTER_ACCOUNT_ID &&
        l.posted &&
        l.date >= RANGE.start &&
        l.date <= RANGE.end
)
export const RECONCILED_LINE = octoberLines[0]
export const CLEARED_LINE = octoberLines[1]
export const MATCHED_LINE = octoberLines[2]
export const PLAIN_LINE = octoberLines[3]

export const FINISHED_STATEMENT_DATE = '2026-10-15'
export const PROGRESS_STATEMENT_DATE = '2026-10-31'

// The two reconciliations the view rows name: the line's statement day comes from its own
// reconciliation row, read inside the lines query (one query, no id → date map).
export const SEED_RECONCILIATIONS: BooksReconciliations[] = [
    {
        ...RECONCILIATION_SAVINGS_FINISHED,
        id: FINISHED_RECONCILIATION_ID,
        account: REGISTER_ACCOUNT_ID,
        statement_date: FINISHED_STATEMENT_DATE,
    },
    {
        ...RECONCILIATION_EMPTY,
        id: PROGRESS_RECONCILIATION_ID,
        account: REGISTER_ACCOUNT_ID,
        statement_date: PROGRESS_STATEMENT_DATE,
    },
]

export const SEED_RECONCILE_ROWS: BooksReconcileLines[] = [
    reconcileViewRow(RECONCILED_LINE, {
        reconciliation: FINISHED_RECONCILIATION_ID,
        finished: true,
    }),
    reconcileViewRow(CLEARED_LINE, { reconciliation: PROGRESS_RECONCILIATION_ID }),
    reconcileViewRow(MATCHED_LINE, { bank_matched: true }),
]

export { BALANCES }

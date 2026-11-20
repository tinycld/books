// The words of customer statements (statements spec §3). A plain module: no React, no
// React Native, so the seed, the audit labels and e2e helpers can import it.
import type { BooksStatements } from '../types'

export type StatementType = BooksStatements['type']

// The create screen's Customer balance filter (spec §3.2).
export type StatementBalanceFilter = 'open' | 'overdue' | 'all'

export const STATEMENT_TYPE_LABELS: Record<StatementType, string> = {
    balance_forward: 'Balance forward',
    open_items: 'Open items',
}

export const STATEMENT_BALANCE_LABELS: Record<StatementBalanceFilter, string> = {
    open: 'Open',
    overdue: 'Overdue',
    all: 'All',
}

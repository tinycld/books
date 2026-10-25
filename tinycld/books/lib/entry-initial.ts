import type { BooksJournalEntries, BooksJournalLines } from '../types'
import type { EntryFormValues } from './entry-schema'
import { amountText } from './money'

type EntryHeaderRow = Pick<BooksJournalEntries, 'date' | 'memo' | 'auto_reverse_on'>

// The form's starting values for a saved draft: lines keep their saved ids so a save
// updates them in place instead of inserting copies.
export function entryInitialValues(
    entry: EntryHeaderRow,
    lines: readonly BooksJournalLines[],
    currency: string
): EntryFormValues {
    return {
        date: entry.date,
        memo: entry.memo,
        autoReverseOn: entry.auto_reverse_on,
        lines: [...lines]
            .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
            .map(line => ({
                id: line.id,
                account: line.account,
                debit: amountText(line.debit, currency),
                credit: amountText(line.credit, currency),
                memo: line.memo,
            })),
    }
}

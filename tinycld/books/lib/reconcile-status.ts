import type { BooksReconcileLines } from '../types'

// The register's Status word of a journal line (reconcile spec §3 "The account register"),
// read from the line's `books_reconcile_lines` row. Apart from lib/reconcile.ts, which
// re-exports it, because lib/register.ts needs it and lib/reconcile.ts imports lib/register.ts.
export type LineStatusWord = '' | 'Reconciled' | 'Cleared' | 'Matched'

export function lineStatusText(
    line: Pick<BooksReconcileLines, 'reconciliation' | 'finished' | 'bank_matched'> | undefined
): LineStatusWord {
    if (!line) return ''
    if (line.finished) return 'Reconciled'
    if (line.reconciliation !== '') return 'Cleared'
    if (line.bank_matched) return 'Matched'
    return ''
}

const STATUS_TONES: Record<LineStatusWord, string> = {
    '': 'text-foreground',
    Reconciled: 'text-success',
    Cleared: 'text-foreground',
    Matched: 'text-muted-foreground',
}

export function lineStatusTone(word: LineStatusWord): string {
    return STATUS_TONES[word]
}

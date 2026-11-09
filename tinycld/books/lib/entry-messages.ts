import type { BooksJournalEntries } from '../types'

// The server names a refused line as "Line n", counting saved lines (blank
// lines were dropped), so callers map n to the n-th non-blank form line.
// tests/entry-messages.test.ts fails if the wording in server/posting.go drifts.
const linePattern = /^Line (\d+)[:\s]/

export function parseLineRefusal(message: string): { lineNumber: number | null; text: string } {
    const match = linePattern.exec(message)
    if (!match) return { lineNumber: null, text: message }
    const lineNumber = Number(match[1])
    const rest = message.slice(match[0].length).trimStart()
    // "Line 3: x" drops the "Line 3:" prefix; "Line 2 has ..." keeps its sentence.
    const text = match[0].endsWith(':') ? rest : message
    return { lineNumber, text }
}

// The refusals of a line's customer or vendor; %s is the party's display name.
// tests/entry-messages.test.ts fails if the wording in server/lines.go drifts.
export const LINE_BOTH_PARTIES = 'A line can name a customer or a vendor, not both.'
export const LINE_PARTY_INACTIVE = '%s is inactive. Choose an active customer or vendor.'
export const PARTY_ON_LINES = '%s is on journal lines. Make it inactive instead.'

// Origin `document` has no label of its own: a document's entry is named by its doc
// type (entry-display.ts).
export const ENTRY_TYPE_LABELS: Record<
    Exclude<BooksJournalEntries['origin'], 'document'>,
    string
> = {
    manual: 'Journal entry',
    reversal: 'Reversal',
    void_reversal: 'Void reversal',
    auto_reversal: 'Auto reversal',
    opening_balance: 'Opening balance',
}

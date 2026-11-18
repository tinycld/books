// What a payment form starts from (vendor refund spec §3.1): its title, the start document
// of a new form, and the entries a draft and a correction start with. Pure, moved out of
// the receive-payment screen so every flow's screen shares them.

import type { BooksInvoices } from '../types'
import type { OutstandingRow } from './payment-allocation'
import type { PaymentFlow } from './payment-flow'

export type PaymentFormMode = 'new' | 'draft' | 'correction'

export function titleOf(
    flow: PaymentFlow,
    mode: PaymentFormMode,
    originalNumber: string | undefined
): string {
    if (mode === 'draft') return flow.texts.draftTitle
    if (mode === 'correction') return flow.texts.editTitle(originalNumber ?? '')
    return flow.texts.newTitle
}

// The helpers below read a stored line as the record read builds it in its `.select()`
// (usePaymentRecord, `PaymentRecordView['lines']`): the line, with its document's number,
// date, total, open balance (`open`, the document's stored balance) and ref flattened.
// Each takes only the fields it reads.
type LineAmount = { document: string; amount: number; number: string; open: number }

// The lines once every line's document is in the store (`isFiled`); null before (the
// screen stays on loading: a line with no document has no open balance).
export function readyApplicationsOf<L extends { isFiled: boolean }>(
    lines: readonly L[]
): L[] | null {
    return lines.every(line => line.isFiled) ? [...lines] : null
}

// A document the stored lines name, as the outstanding list merges it with the open ones:
// `balance` is its stored balance, `party` its customer or vendor.
export type StoredDocument = Pick<
    BooksInvoices,
    'id' | 'number' | 'date' | 'due_date' | 'total' | 'balance'
> & { party: string; ref: string }

type StoredLine = LineAmount & { date: string; total: number; ref: string; dueDate?: string }

// The documents stored lines name, each once. A document with no due date (a vendor
// credit, `dueDate` absent or '') lists its date in the due-date place, which is the
// list's sort key.
export function storedDocumentsOf(lines: readonly StoredLine[], party: string): StoredDocument[] {
    const seen = new Set<string>()
    return lines.flatMap(line => {
        if (seen.has(line.document)) return []
        seen.add(line.document)
        return [
            {
                id: line.document,
                number: line.number,
                date: line.date,
                due_date: line.dueDate || line.date,
                total: line.total,
                balance: line.open,
                party,
                ref: line.ref,
            },
        ]
    })
}

// Stored lines as the form's start values read them; `extra` adds what a corrected
// original put on each document to its open balance.
export function draftApplicationsOf(
    lines: readonly LineAmount[],
    extra: Readonly<Record<string, number>>
) {
    return lines.map(line => ({
        document: line.document,
        amount: line.amount,
        open: line.open + (extra[line.document] ?? 0),
        number: line.number,
    }))
}

// A posted original's lines as correctionPaymentValues reads them.
export function originalApplicationsOf(lines: readonly LineAmount[]) {
    return lines.map(line => ({
        document: line.document,
        amount: line.amount,
        number: line.number,
        balance: line.open,
    }))
}

// A start document (`?invoice`, `?credit`) as the screen reads it, with its party.
export type StartDocument = Pick<BooksInvoices, 'id' | 'number' | 'date' | 'total' | 'balance'> & {
    status: string
    party: string
    dueDate?: string
    ref?: string
}

// The start document ticks its row only when it is a posted document of the form's party.
// A document with no due date (a vendor credit) lists its date in the due-date place.
export function startRowOf(
    document: StartDocument | null | undefined,
    party: string
): OutstandingRow | null {
    if (!document || document.party !== party || document.status !== 'posted') return null
    const date = document.date.slice(0, 10)
    return {
        id: document.id,
        number: document.number,
        date,
        due_date: (document.dueDate ?? date).slice(0, 10),
        total: document.total,
        open: document.balance,
        ref: document.ref,
    }
}

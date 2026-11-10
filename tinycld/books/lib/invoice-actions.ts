import type { BooksInvoices } from '../types'

// The read view's actions of a posted or void invoice (spec §3.6). Pure, so who sees
// which action and the key map are unit-tested.

export type InvoiceReadAction = 'edit' | 'void' | 'copy' | 'entry' | 'pdf'

// The read view's keys: single letters, so they never fire while a text field has focus.
// Download PDF's key (⌘P) is the PDF tab's.
export const INVOICE_READ_KEYS = { edit: 'e', void: 'v', copy: 'c', entry: 'j' } as const

export type InvoiceReadKeyAction = keyof typeof INVOICE_READ_KEYS

// A writer edits or voids a posted invoice and copies any; a void invoice (a replaced
// original is void too) is only copied. A reader views the journal entry and the PDF.
// A draft opens in the form, never here, so it offers nothing.
export function invoiceReadActions(
    status: BooksInvoices['status'],
    canWrite: boolean
): InvoiceReadAction[] {
    if (status === 'draft') return []
    if (!canWrite) return ['entry', 'pdf']
    if (status === 'posted') return ['edit', 'void', 'copy', 'entry', 'pdf']
    return ['copy', 'entry', 'pdf']
}

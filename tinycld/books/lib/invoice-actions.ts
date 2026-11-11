import type { BooksInvoices } from '../types'

// The read view's actions of a posted or void invoice (spec §3.6). Pure, so who sees
// which action and the key map are unit-tested.

export type InvoiceReadAction = 'edit' | 'void' | 'copy' | 'entry' | 'pdf'

// The read view's letter keys: single letters, so they never fire while a text field has
// focus. Download PDF has ⌘P (INVOICE_PDF_KEY), on the form as well.
export const INVOICE_READ_KEYS = { edit: 'e', void: 'v', copy: 'c', entry: 'j' } as const

export type InvoiceReadKeyAction = keyof typeof INVOICE_READ_KEYS

// Download PDF on the form and the read view. Always taken while the screen holds the
// keys, so the browser's Print never opens.
export const INVOICE_PDF_KEY = '$mod+p'

// Every read-view action's key.
export const INVOICE_READ_ACTION_KEYS: Record<InvoiceReadAction, string> = {
    ...INVOICE_READ_KEYS,
    pdf: INVOICE_PDF_KEY,
}

// The tabs under the title: Edit (form) or Details (read view), and PDF view.
export const INVOICE_TAB_KEYS = { edit: 'Alt+1', pdf: 'Alt+2' } as const

// The download's name when the server gives none: "invoice-1004", or "draft-invoice"
// while the invoice has no number (the server's names, server/pdf_invoice.go).
export function invoicePdfStem(number: string): string {
    return number ? `invoice-${number}` : 'draft-invoice'
}

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

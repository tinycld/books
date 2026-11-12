import type { BooksInvoices } from '../types'

// The read view's actions of a posted or void sales document (spec §3.6 of the invoice).
// Pure, so who sees which action and the key map are unit-tested.

export type DocumentReadAction = 'edit' | 'void' | 'copy' | 'entry' | 'pdf'

// The read view's letter keys: single letters, so they never fire while a text field has
// focus. Download PDF has ⌘P (DOCUMENT_PDF_KEY), on the form as well.
export const DOCUMENT_READ_KEYS = { edit: 'e', void: 'v', copy: 'c', entry: 'j' } as const

export type DocumentReadKeyAction = keyof typeof DOCUMENT_READ_KEYS

// Download PDF on the form and the read view. Always taken while the screen holds the
// keys, so the browser's Print never opens.
export const DOCUMENT_PDF_KEY = '$mod+p'

// Every read-view action's key.
export const DOCUMENT_READ_ACTION_KEYS: Record<DocumentReadAction, string> = {
    ...DOCUMENT_READ_KEYS,
    pdf: DOCUMENT_PDF_KEY,
}

// The tabs under the title: Edit (form) or Details (read view), and PDF view.
export const DOCUMENT_TAB_KEYS = { edit: 'Alt+1', pdf: 'Alt+2' } as const

// A writer edits or voids a posted document and copies any; a void document (a replaced
// original is void too) is only copied. A reader views the journal entry and the PDF.
// A draft opens in the form, never here, so it offers nothing. Every kind shares the
// statuses.
export function documentReadActions(
    status: BooksInvoices['status'],
    canWrite: boolean
): DocumentReadAction[] {
    if (status === 'draft') return []
    if (!canWrite) return ['entry', 'pdf']
    if (status === 'posted') return ['edit', 'void', 'copy', 'entry', 'pdf']
    return ['copy', 'entry', 'pdf']
}

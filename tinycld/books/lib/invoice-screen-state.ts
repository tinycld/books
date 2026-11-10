import type { BooksInvoices } from '../types'

export type InvoiceScreenState =
    | 'loading'
    | 'error'
    | 'not-found'
    | 'no-access'
    | 'cannot-edit'
    | 'form'
    | 'read'

type Status = BooksInvoices['status']

// Which screen the invoice routes show. A failed read wins over one still loading, so
// Retry shows at once. A posted or void invoice opens in the read view for every Books
// user; a form (new or draft) is for writers only. `isHeld` keeps the form through a
// post or a delete: the optimistic `posted` status, or the row leaving the store, would
// swap it for the read view or "not found" before the server answers, and a refusal
// would have no form to show on; on a correction, the post voids the replaced invoice
// before the form navigates away. `replacesStatus` is the invoice a correction replaces: undefined when
// the form is not a correction, null when that invoice does not exist. `copyStatus` is
// the invoice a copy starts from (any status): undefined when the form is no copy, null
// when that invoice does not exist.
export function invoiceScreenState(input: {
    isReady: boolean
    isError: boolean
    canWrite: boolean
    isNew: boolean
    status: Status | null
    isHeld: boolean
    replacesStatus: Status | null | undefined
    copyStatus?: Status | null
}): InvoiceScreenState {
    const { isReady, isError, canWrite, isNew, status, isHeld, replacesStatus, copyStatus } = input
    if (isError) return 'error'
    if (!isReady) return 'loading'
    if (isHeld && canWrite) return 'form'
    if (isNew) return newFormState(canWrite, replacesStatus, copyStatus)
    if (status === null) return 'not-found'
    if (status === 'draft') return canWrite ? 'form' : 'no-access'
    return 'read'
}

function newFormState(
    canWrite: boolean,
    replacesStatus: Status | null | undefined,
    copyStatus: Status | null | undefined
) {
    if (!canWrite) return 'no-access'
    if (copyStatus === null) return 'not-found'
    if (replacesStatus === undefined || replacesStatus === 'posted') return 'form'
    if (replacesStatus === null) return 'not-found'
    return 'cannot-edit'
}

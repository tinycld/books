import { type DocumentStatus, isFormStatus } from './document-lifecycle'
import type { DocumentLifecycle } from './sales-document-kinds'

export type DocumentScreenState =
    | 'loading'
    | 'error'
    | 'not-found'
    | 'no-access'
    | 'cannot-edit'
    | 'cannot-convert'
    | 'cannot-start'
    | 'closed-edit'
    | 'form'
    | 'read'

type Status = DocumentStatus

// Whether a hold shows the form, whatever the held row's status. An order's saves never
// change its status, and the held row keeps it (useHeldRecord), so its state follows that
// row and the route: a delete from the read view (its More row) holds the order and keeps
// the read view, with the dialog that shows a refusal. Keyed by DocumentLifecycle, so a
// new lifecycle fails tsc until it has its answer.
const HOLD_KEEPS_FORM: Record<DocumentLifecycle, boolean> = {
    posting: true,
    quote: true,
    order: false,
}

// Which screen a sales document's routes show. A failed read wins over one still
// loading, so Retry shows at once. In the posting lifecycle a posted or void document
// opens in the read view for every Books user, and a form (new or draft) is for writers
// only. In the quote lifecycle a writer edits a pending, accepted or rejected estimate in
// the form; a closed estimate, and every estimate for a reader, opens in the read view;
// a reader at new gets no access. `isHeld` keeps the form
// through a post or a delete: the optimistic `posted` status, or the row leaving the
// store, would swap it for the read view or "not found" before the server answers, and a
// refusal would have no form to show on; on a correction, the post voids the replaced
// document before the form navigates away. `replacesStatus` is the document a correction
// replaces: undefined when the form is not a correction, null when that document does
// not exist. `copyStatus` is the document a copy starts from (any status): undefined
// when the form is no copy, null when that document does not exist. `estimateStatus` is
// the estimate an invoice is made from (`?estimate`): undefined when the form is not
// made from one, null when that estimate does not exist; only a pending or accepted
// estimate converts, any other shows the cannot-convert notice. `sourceAllowed` is the
// kind's answer for the source a new form is made from (`?invoice`, `?sales_receipt`,
// `?credit_memo`; DocumentKind.sourceAllowed): undefined when the form is not made from
// one, null when that source does not exist or cannot be read; any answer but true shows
// the kind's cannot-start notice (DocumentKind.sourceNotice). In the order lifecycle (a
// purchase order, spec §3.1, §3.12) a saved order, open or closed, opens in the read view
// for everyone; `isEdit` (`?edit=1`) opens the form for a writer on an open order, and on a
// closed order is the read view with the closed-edit notice; a reader at new gets no
// access; a hold keeps the state of the held row (HOLD_KEEPS_FORM).
export function documentScreenState(input: {
    lifecycle: DocumentLifecycle
    isReady: boolean
    isError: boolean
    canWrite: boolean
    isNew: boolean
    status: Status | null
    isHeld: boolean
    replacesStatus: Status | null | undefined
    copyStatus?: Status | null
    estimateStatus?: Status | null
    sourceAllowed?: boolean | null
    // The route asks for the form (`?edit=1`); read by the order lifecycle only.
    isEdit?: boolean
}): DocumentScreenState {
    const { lifecycle, isReady, isError, canWrite, isNew, status, isHeld } = input
    if (isError) return 'error'
    if (!isReady) return 'loading'
    if (isHeld && canWrite && HOLD_KEEPS_FORM[lifecycle]) return 'form'
    if (isNew) return newFormState(canWrite, input)
    if (status === null) return 'not-found'
    switch (lifecycle) {
        case 'order':
            return savedOrderState(status, canWrite, input.isEdit === true)
        case 'posting':
        case 'quote':
            if (!isFormStatus(lifecycle, status)) return 'read'
            if (canWrite) return 'form'
            // A posting draft is never shown to a reader; an open quote is, in the read view.
            return lifecycle === 'quote' ? 'read' : 'no-access'
    }
}

// A saved order: the read view, unless a writer asks for the form of an open order. A
// reader's `?edit=1` is the read view; a closed order's is the read view with the notice.
function savedOrderState(status: Status, canWrite: boolean, isEdit: boolean): DocumentScreenState {
    if (!isEdit || !canWrite) return 'read'
    return isFormStatus('order', status) ? 'form' : 'closed-edit'
}

function newFormState(
    canWrite: boolean,
    sources: {
        replacesStatus: Status | null | undefined
        copyStatus?: Status | null
        estimateStatus?: Status | null
        sourceAllowed?: boolean | null
    }
): DocumentScreenState {
    const { replacesStatus, copyStatus, estimateStatus, sourceAllowed } = sources
    if (!canWrite) return 'no-access'
    if (copyStatus === null) return 'not-found'
    if (estimateStatus === null) return 'not-found'
    if (estimateStatus !== undefined) {
        const converts = estimateStatus === 'pending' || estimateStatus === 'accepted'
        return converts ? 'form' : 'cannot-convert'
    }
    if (sourceAllowed !== undefined) return sourceAllowed === true ? 'form' : 'cannot-start'
    if (replacesStatus === undefined || replacesStatus === 'posted') return 'form'
    if (replacesStatus === null) return 'not-found'
    return 'cannot-edit'
}

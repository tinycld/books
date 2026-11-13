import { type DocumentStatus, isFormStatus } from './document-lifecycle'
import type { DocumentLifecycle } from './sales-document-kinds'

export type DocumentScreenState =
    | 'loading'
    | 'error'
    | 'not-found'
    | 'no-access'
    | 'cannot-edit'
    | 'form'
    | 'read'

type Status = DocumentStatus

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
// when the form is no copy, null when that document does not exist.
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
}): DocumentScreenState {
    const { lifecycle, isReady, isError, canWrite, isNew, status, isHeld } = input
    if (isError) return 'error'
    if (!isReady) return 'loading'
    if (isHeld && canWrite) return 'form'
    if (isNew) return newFormState(canWrite, input.replacesStatus, input.copyStatus)
    if (status === null) return 'not-found'
    if (!isFormStatus(lifecycle, status)) return 'read'
    if (canWrite) return 'form'
    // A posting draft is never shown to a reader; an open quote is, in the read view.
    return lifecycle === 'quote' ? 'read' : 'no-access'
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

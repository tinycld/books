// Which surface the receive-payment screen shows (spec §3.8, §3.6, §2).

import type { BooksPayments } from '../types'

export type PaymentScreenState =
    | 'loading'
    | 'error'
    | 'not-found'
    | 'no-access'
    | 'cannot-edit'
    | 'form'
    | 'read'

type PaymentStatus = BooksPayments['status']

export type PaymentScreenInput = {
    // Every read of the screen (access, settings, customer, deposit accounts and, for an
    // id, the payment and its applications) is ready.
    isReady: boolean
    // One of those reads failed.
    isError: boolean
    canWrite: boolean
    // The route is `books/payments/new`.
    isNew: boolean
    // The payment's status at an id; null when no row has the id (or at `new`).
    status: PaymentStatus | null
    // A post of this draft runs (the save store holds it): its optimistic `posted` status
    // must not swap the form for the read view, or a refusal is lost.
    isHeld: boolean
    // `?replaces`: undefined without it; else the original's status, null when no row has
    // the id.
    replacesStatus: PaymentStatus | null | undefined
    replacesReady: boolean
    replacesError: boolean
}

export function paymentScreenState(input: PaymentScreenInput): PaymentScreenState {
    const hasReplaces = input.replacesStatus !== undefined
    if (input.isError || (hasReplaces && input.replacesError)) return 'error'
    if (!input.isReady || (hasReplaces && !input.replacesReady)) return 'loading'
    if (input.isNew) return newState(input, hasReplaces)
    if (input.status === null) return 'not-found'
    if (input.status === 'draft' || input.isHeld) return input.canWrite ? 'form' : 'no-access'
    return 'read'
}

function newState(input: PaymentScreenInput, hasReplaces: boolean): PaymentScreenState {
    if (!input.canWrite) return 'no-access'
    if (hasReplaces && input.replacesStatus !== 'posted') return 'cannot-edit'
    return 'form'
}

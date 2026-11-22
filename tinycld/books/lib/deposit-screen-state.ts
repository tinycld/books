// Which surface the deposit screen shows (bank deposit spec §2, §3.6, §3.9). The rules are
// the payment screen's (a failed read before loading; a posted or void deposit in the read
// view for every Books user; a new form and a draft for writers only; a held post keeps the
// form; `?replaces` of a deposit that is not posted cannot be edited), so this reads
// paymentScreenState with the deposit's own types.

import type { BooksDeposits } from '../types'
import { paymentScreenState } from './payment-screen-state'

export type DepositScreenState =
    | 'loading'
    | 'error'
    | 'not-found'
    | 'no-access'
    | 'cannot-edit'
    | 'form'
    | 'read'

type DepositStatus = BooksDeposits['status']

export type DepositScreenInput = {
    // Every read of the screen (access, settings and, for an id, the deposit, its items and
    // its lines) is ready.
    isReady: boolean
    // One of those reads failed.
    isError: boolean
    canWrite: boolean
    // The route is `books/deposits/new`.
    isNew: boolean
    // The deposit's status at an id; null when no row has the id (or at `new`).
    status: DepositStatus | null
    // A post of this draft runs (the save store holds it).
    isHeld: boolean
    // `?replaces`: undefined without one; else the original's status, null when no row has
    // the id.
    replacesStatus: DepositStatus | null | undefined
    replacesReady: boolean
    replacesError: boolean
}

export function depositScreenState(input: DepositScreenInput): DepositScreenState {
    return paymentScreenState(input)
}

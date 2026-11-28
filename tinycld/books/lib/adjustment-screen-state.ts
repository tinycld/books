// Which surface the inventory adjustment screen shows (inventory-adjust spec §3.4, §3.5,
// §3.13). The rules are the payment screen's (a failed read before loading; a posted or
// void adjustment in the read view for every Books user; a new form for writers only; a
// held post keeps the form; `?replaces` of an adjustment that is not posted cannot be
// edited), so this reads paymentScreenState with the adjustment's own types, with three
// changes: a reader opens a draft in the read view (its stored lines and the Draft badge),
// not the no-access notice; `?replaces` of an adjustment Books made cannot be edited; and
// the own correction's post keeps the form while the original reads void.

import type { BooksInventoryAdjustments } from '../types'
import { paymentScreenState } from './payment-screen-state'

export type AdjustmentScreenState =
    | 'loading'
    | 'error'
    | 'not-found'
    | 'no-access'
    | 'cannot-edit'
    | 'form'
    | 'read'

type AdjustmentStatus = BooksInventoryAdjustments['status']
type AdjustmentKind = BooksInventoryAdjustments['kind']

export type AdjustmentScreenInput = {
    // Every read of the screen (access and, for an id, the adjustment, its lines and its
    // stock moves) is ready.
    isReady: boolean
    // One of those reads failed.
    isError: boolean
    canWrite: boolean
    // The route is `books/inventory-adjustments/new`.
    isNew: boolean
    // The adjustment's status at an id; null when no row has the id (or at `new`).
    status: AdjustmentStatus | null
    // A post of this draft runs (the save store holds it).
    isHeld: boolean
    // `?replaces`: undefined without one; else the original's status, null when no row has
    // the id.
    replacesStatus: AdjustmentStatus | null | undefined
    // `?replaces`: the original's kind; undefined without one, null when no row has the id.
    replacesKind: AdjustmentKind | null | undefined
    replacesReady: boolean
    replacesError: boolean
    // The save store's `correcting` is the `?replaces` id: this form's own correction posts,
    // and the server voids the original in that post.
    isCorrecting: boolean
}

// Spec §3.4: "Void and Edit are offered on a manual adjustment only", so `?replaces` of an
// adjustment Books made reads as not correctable. While the own correction posts, the
// original reads void before the screen leaves; it reads as posted so the form stays and a
// refusal of the post lands on it.
function replacesStatusOf(input: AdjustmentScreenInput): AdjustmentStatus | null | undefined {
    const { replacesStatus, replacesKind } = input
    if (replacesStatus === undefined || replacesStatus === null) return replacesStatus
    if (input.isCorrecting) return 'posted'
    if (replacesKind !== 'manual') return 'void'
    return replacesStatus
}

export function adjustmentScreenState(input: AdjustmentScreenInput): AdjustmentScreenState {
    const state = paymentScreenState({ ...input, replacesStatus: replacesStatusOf(input) })
    const isStoredDraft = !input.isNew && input.status === 'draft' && !input.isHeld
    if (state === 'no-access' && isStoredDraft) return 'read'
    return state
}

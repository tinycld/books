// The inventory adjustment's actions (inventory-adjust spec §3.4, §3.5, §3.13): the read
// view's Edit, Void and Copy, the list's row menu, and the stale state of a draft that
// another person posted or deleted while its form is open. Pure, so each rule is
// unit-tested (tests/adjustment-actions.test.ts).

import type { BooksInventoryAdjustments } from '../types'

type AdjustmentStatus = BooksInventoryAdjustments['status']
type AdjustmentKind = BooksInventoryAdjustments['kind']

// How the read view draws an action: a live button (and its key), a disabled button with
// no key (writes are unavailable), or nothing.
export type AdjustmentActionOffer = 'offered' | 'disabled' | 'hidden'

export type AdjustmentReadActions = {
    edit: AdjustmentActionOffer
    void: AdjustmentActionOffer
    copy: AdjustmentActionOffer
}

export type AdjustmentActionInput = {
    status: AdjustmentStatus
    kind: AdjustmentKind
    // The correction that replaced this adjustment; '' when none did.
    replacedBy: string
    // The user may record inventory adjustments (bookkeeper or admin).
    canWrite: boolean
    // core useWritesAvailable: false while the server cannot be reached.
    writesAvailable: boolean
}

const HIDDEN: AdjustmentReadActions = { edit: 'hidden', void: 'hidden', copy: 'hidden' }

// Spec §3.4: "Void and Edit are offered on a manual adjustment only"; a posted one that no
// correction replaced (the server refuses `replaces` of one "corrected before").
function isCorrectable(input: Pick<AdjustmentActionInput, 'status' | 'kind' | 'replacedBy'>) {
    return input.kind === 'manual' && input.status === 'posted' && input.replacedBy === ''
}

/**
 * The read view's Edit (a correction), Void and Copy. A draft opens in the form, so it has
 * none; an adjustment Books made (opening, recost) has none (spec §3.5 "No Edit, no Void,
 * no Copy"); a reader has none. A writer gets Copy on any manual posted or void adjustment,
 * and Edit and Void on a posted one that no correction replaced. While writes are
 * unavailable each offered action is `disabled`.
 */
export function adjustmentReadActions(input: AdjustmentActionInput): AdjustmentReadActions {
    if (!input.canWrite || input.kind !== 'manual' || input.status === 'draft') return HIDDEN
    const live: AdjustmentActionOffer = input.writesAvailable ? 'offered' : 'disabled'
    const correctable = isCorrectable(input)
    return {
        edit: correctable ? live : 'hidden',
        void: correctable ? live : 'hidden',
        copy: live,
    }
}

export type AdjustmentRowMenuAction = 'open' | 'edit' | 'copy' | 'void' | 'delete'

/**
 * The list row's menu (spec §3.5): "Open, Edit (draft or posted manual, writers), Copy
 * (writers), Void (posted manual, writers), Delete (draft, writers)". An adjustment Books
 * made has Open only (§3.5 "No Edit, no Void, no Copy"), and a replaced one is void, so it
 * has Open and Copy.
 */
export function adjustmentRowMenuItems(
    input: Pick<AdjustmentActionInput, 'status' | 'kind' | 'replacedBy' | 'canWrite'>
): AdjustmentRowMenuAction[] {
    if (!input.canWrite || input.kind !== 'manual') return ['open']
    if (input.status === 'draft') return ['open', 'edit', 'copy', 'delete']
    if (isCorrectable(input)) return ['open', 'edit', 'copy', 'void']
    return ['open', 'copy']
}

// The row actions that write from the list (their dialogs update or delete the row): the
// menu disables them while writes are unavailable, as the read view's buttons. Edit and
// Copy open a form, whose own bar disables its writes.
const WRITING_ROW_ACTIONS: ReadonlySet<AdjustmentRowMenuAction> = new Set(['void', 'delete'])

export function adjustmentRowActionWrites(action: AdjustmentRowMenuAction): boolean {
    return WRITING_ROW_ACTIONS.has(action)
}

export type AdjustmentStale = 'none' | 'posted' | 'deleted'

export type AdjustmentStaleInput = {
    // The form shows a stored draft.
    formStatus: 'draft'
    // The live record of that draft; undefined when no row has its id.
    live: { status: string } | undefined
    // The live record's query has loaded, so `undefined` means the row is gone.
    isLoaded: boolean
    // An own save, post or delete holds the draft (stores/adjustment-save-store.ts): its
    // optimistic status or delete is not a stale state.
    isHeld: boolean
}

/**
 * Whether the draft open in the form changed elsewhere (spec §3.13): `posted` when its
 * live record is posted or void, `deleted` when the record is gone after the load, and
 * `none` while it is still a draft, before the load, and while an own write holds it.
 */
export function adjustmentStale(input: AdjustmentStaleInput): AdjustmentStale {
    if (input.isHeld || !input.isLoaded) return 'none'
    if (input.live === undefined) return 'deleted'
    if (input.live.status === input.formStatus) return 'none'
    return 'posted'
}

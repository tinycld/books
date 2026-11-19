// The "More actions" menu of any list row, sales or purchases (spec §3 "Row menu"): the
// row's kind picks the rules, `documentRowMenuItems` / `rowActionHref` for a sales row and
// `purchaseRowMenuItems` / `purchaseRowActionHref` for a purchase row. Pure, so the list
// hooks and the menu share one choice.

import { type DocumentListRow, isSalesKind, kindLabel } from './document-list'
import {
    documentRowMenuItems,
    ROW_MENU_LABELS,
    type RowMenuAction,
    rowActionHref,
} from './document-row-menu'
import { PAYMENT_MESSAGES } from './payment-texts'
import {
    PURCHASE_ROW_MENU_LABELS,
    type PurchaseRowMenuAction,
    purchaseRowActionHref,
    purchaseRowMenuItems,
    purchaseVoidTexts,
} from './purchase-row-menu'

export type ListRowAction = RowMenuAction | PurchaseRowMenuAction

export const LIST_ROW_MENU_LABELS: Record<ListRowAction, string> = {
    ...ROW_MENU_LABELS,
    ...PURCHASE_ROW_MENU_LABELS,
}

function isSalesAction(action: ListRowAction): action is RowMenuAction {
    return action in ROW_MENU_LABELS
}

function isPurchaseAction(action: ListRowAction): action is PurchaseRowMenuAction {
    return action in PURCHASE_ROW_MENU_LABELS
}

export function listRowMenuItems(row: DocumentListRow, canWrite: boolean): ListRowAction[] {
    if (isSalesKind(row.kind)) return documentRowMenuItems(row, canWrite)
    return purchaseRowMenuItems(row, canWrite)
}

// The route a navigating action pushes (without the org prefix); null for the actions that
// stay on the list, and for an action the row's area does not have.
export function listRowActionHref(row: DocumentListRow, action: ListRowAction): string | null {
    if (isSalesKind(row.kind)) return isSalesAction(action) ? rowActionHref(row, action) : null
    return isPurchaseAction(action) ? purchaseRowActionHref(row, action) : null
}

// The Void dialog's words for a row: a purchase kind's read view texts
// (`purchaseVoidTexts`); for a sales kind the document's noun, and a payment's own body.
export function listVoidTexts(row: DocumentListRow): {
    body: string | undefined
    confirmLabel: string
    noun: string
} {
    const { kind } = row
    if (!isSalesKind(kind)) return purchaseVoidTexts(kind)
    const noun = kindLabel(kind).toLowerCase()
    const body = kind === 'payment' ? PAYMENT_MESSAGES.voidBody : undefined
    return { body, confirmLabel: `Void ${noun}`, noun }
}

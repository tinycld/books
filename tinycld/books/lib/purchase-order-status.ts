// What is still open on a purchase order (purchase order spec §3.6, §3.8, §4). The server
// writes the open values (server/purchase_order_receipts.go); the client reads them, and
// the fixture and the badge compute with the same formula. server/testdata/
// purchase_order_open_cases.json is run by both sides so the two stay equal.
//
// Plain functions over numbers: the seed graph runs this in node.

import type { BooksPurchaseOrderLines, BooksPurchaseOrders } from '../types'
import type { StatusTone } from './document-lifecycle'
import { lineAmount } from './document-lines'

type LineKind = BooksPurchaseOrderLines['kind']

// Quantities have at most 2 decimals; a difference of two is rounded back to hundredths so
// 0.3 - 0.1 reads 0.2, as Go rounds it.
function hundredths(value: number): number {
    return Math.round(value * 100) / 100
}

// A product line's open quantity: what is ordered and not received, not below 0. An
// account line has none.
export function orderLineOpenQuantity(line: {
    kind: LineKind
    quantity: number
    received: number
}): number {
    if (line.kind !== 'item') return 0
    return Math.max(hundredths(line.quantity - line.received), 0)
}

// A product line's open amount is its open quantity at the line's rate (Qty x Rate,
// rounded half away from zero); an account line's is its amount less what is billed, not
// below 0.
export function orderLineOpenAmount(line: {
    kind: LineKind
    quantity: number
    rate: number
    amount: number
    received: number
    billed: number
}): number {
    if (line.kind === 'item') return lineAmount(orderLineOpenQuantity(line), line.rate)
    return Math.max(line.amount - line.billed, 0)
}

// A product line is open while a quantity is open, an account line while an amount is.
export function isOrderLineOpen(line: {
    kind: LineKind
    open_quantity: number
    open_amount: number
}): boolean {
    if (line.kind === 'item') return line.open_quantity > 0
    return line.open_amount > 0
}

export function orderHasOpenLine(
    lines: readonly { kind: LineKind; open_quantity: number; open_amount: number }[]
): boolean {
    return lines.some(isOrderLineOpen)
}

// An open order with a received quantity or a billed amount above zero (spec §3.6).
export function isPartlyReceived(
    order: { status: BooksPurchaseOrders['status'] },
    lines: readonly { received: number; billed: number }[]
): boolean {
    if (order.status !== 'open') return false
    return lines.some(line => line.received > 0 || line.billed > 0)
}

// The order's badge (spec §3.6): Open (info), Partly received (warning), Closed (muted).
export function purchaseOrderBadge(
    order: { status: BooksPurchaseOrders['status'] },
    lines: readonly { received: number; billed: number }[]
): { label: string; tone: StatusTone } {
    if (order.status === 'closed') return { label: 'Closed', tone: 'muted' }
    if (isPartlyReceived(order, lines)) return { label: 'Partly received', tone: 'warning' }
    return { label: 'Open', tone: 'info' }
}

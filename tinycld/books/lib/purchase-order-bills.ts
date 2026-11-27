// The bills of a purchase order (purchase order spec §3.6, §3.8), as the order's read view
// and form use them. Pure: usePurchaseOrderBills reads the bills that name the order with
// their lines.

import type { FormHostUi } from '@tinycld/core/lib/forms/host-ui'
import type { BooksBillLines, BooksBills } from '../types'
import { type CopyToBillDraftLine, heldByDrafts } from './copy-to-bill'
import type { StatusTone } from './document-lifecycle'
import { statusBadgeOf } from './document-lifecycle'
import { formatMoney } from './money'

export type OrderBillLine = Pick<BooksBillLines, 'po_line' | 'kind' | 'quantity' | 'amount'>

export type OrderBill = Pick<
    BooksBills,
    'id' | 'number' | 'date' | 'status' | 'currency' | 'replaced_by' | 'replaces'
> & {
    lines: readonly OrderBillLine[]
}

// A row of the order's Bills section: "Draft bill" or "Bill <n>", the bill's date, the sum
// of its lines from this order (a line the bill adds names no order line) and its status.
export type OrderBillRow = {
    id: string
    number: string
    date: string
    amount: number
    currency: string
    status: { label: string; tone: StatusTone }
}

const DRAFT_NOTE = 'on a draft bill'

function rowOf(bill: OrderBill): OrderBillRow {
    const amount = bill.lines.reduce((sum, line) => (line.po_line ? sum + line.amount : sum), 0)
    const number = bill.status === 'draft' ? 'Draft bill' : `Bill ${bill.number}`
    const status = statusBadgeOf('posting', bill.status) ?? { label: bill.status, tone: 'muted' }
    return { id: bill.id, number, date: bill.date, amount, currency: bill.currency, status }
}

function byDateThenNumber(a: OrderBill, b: OrderBill): number {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    return a.number < b.number ? -1 : a.number > b.number ? 1 : 0
}

// A bill the Bills section lists (spec §3.6): not void, and not replaced by a correction
// (the server counts the same bills: server/purchase_order_receipts.go, `replaced_by` '').
function isListedBill(bill: OrderBill): boolean {
    return bill.status !== 'void' && !bill.replaced_by
}

// A draft bill whose lines the open values lose: a draft correction (`replaces` set) takes
// the place of a posted bill whose lines the order already counts, so it holds nothing more.
function isHoldingDraft(bill: OrderBill): boolean {
    return bill.status === 'draft' && !bill.replaces
}

/**
 * What the bills of an order give: the Bills section's rows (each bill that is not void
 * and not replaced, by date then number), the lines of its draft bills that name an order
 * line, a draft correction left out (what Copy to bill and the draft-bill note take off the
 * open values), and every order line a bill of any status names (the server keeps their
 * product or account and refuses their removal: server/purchase_order_bills.go).
 * `hasBills`: a bill of any status names the order, so its vendor cannot change.
 */
export function orderBillsSummary(bills: readonly OrderBill[]) {
    const rows = bills.filter(isListedBill).sort(byDateThenNumber).map(rowOf)
    const draftLines: CopyToBillDraftLine[] = []
    const linkedLines = new Set<string>()
    for (const bill of bills) {
        for (const line of bill.lines) {
            if (!line.po_line) continue
            linkedLines.add(line.po_line)
            if (!isHoldingDraft(bill)) continue
            draftLines.push({ po_line: line.po_line, quantity: line.quantity, amount: line.amount })
        }
    }
    const summary: {
        rows: OrderBillRow[]
        draftLines: CopyToBillDraftLine[]
        linkedLines: ReadonlySet<string>
        hasBills: boolean
    } = { rows, draftLines, linkedLines, hasBills: bills.length > 0 }
    return summary
}

// A stored order line as its form's linked-line text reads it.
export type OrderLineProgress = {
    id: string
    kind: string
    quantity: number
    amount: number
    received: number
    billed: number
}

function progressText(line: OrderLineProgress, currency: string): string {
    if (line.kind === 'account') {
        const billed = formatMoney(line.billed, currency)
        return `Billed ${billed} of ${formatMoney(line.amount, currency)}`
    }
    return `Received ${line.received} of ${line.quantity}`
}

/**
 * The line under each linked order line's Description in the order form (spec §3.8):
 * "Received 4 of 10" (a product line) or "Billed $120.00 of $300.00" (an account line),
 * from the stored line, by its id. `linked` is the order lines a bill of any status names
 * (orderBillsSummary); null while the bills are not read, when the lines whose posted bills
 * received or billed any are the linked ones.
 */
export function linkedLineTexts(
    lines: readonly OrderLineProgress[],
    linked: ReadonlySet<string> | null,
    currency: string
): Record<string, string> {
    const texts: Record<string, string> = {}
    for (const line of lines) {
        const isLinked = linked ? linked.has(line.id) : line.received > 0 || line.billed > 0
        if (isLinked) texts[line.id] = progressText(line, currency)
    }
    return texts
}

/**
 * The order form's host UI with its linked lines kept (spec §3.8 "Its row menu has no
 * Remove"; the human, 2026-11-26: no Duplicate either, as a copy carries the line's
 * product or account): core `canRemoveRow` is false for a line in `linked`
 * (linkedLineTexts, by the order line's id), so its row menu has no Remove and no Duplicate
 * and the row keys skip it. The server refuses the removal too
 * (server/purchase_orders.go `checkPurchaseOrderLineDelete`). No linked line: the UI as it is.
 */
export function withKeptOrderLines(
    ui: FormHostUi | null,
    linked: Readonly<Record<string, string>>
): FormHostUi | null {
    if (!ui || Object.keys(linked).length === 0) return ui
    return { ...ui, canRemoveRow: (_table, row) => linked[row.id] === undefined }
}

/**
 * The note under an order line's Open value (spec §3.6): what the order's draft bills hold
 * of it, "4 on a draft bill" (a product line) or "$120.00 on a draft bill" (an account
 * line); '' when no draft holds it.
 */
export function draftNoteText(
    line: { id: string; kind: string },
    draftLines: readonly CopyToBillDraftLine[],
    currency: string
): string {
    const held = heldByDrafts(draftLines).get(line.id)
    if (!held) return ''
    if (line.kind === 'account') {
        if (held.amount === 0) return ''
        return `${formatMoney(held.amount, currency)} ${DRAFT_NOTE}`
    }
    if (held.quantity === 0) return ''
    return `${held.quantity} ${DRAFT_NOTE}`
}

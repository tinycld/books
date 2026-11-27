// Copy to bill (purchase order spec §3.7, §3.8): the rows of the dialog and the values
// each starts at, the dialog's one zod schema, and the bill lines a choice gives (or every
// open line, when there is no choice: a typed URL, a reload). Pure: the hook reads the
// order's lines with their product and account rows and the lines of its draft bills, and
// the bill's data source hands the lines and the stored choice to billLinesFromChoice.

import type { TableRow } from '@tinycld/core/lib/forms/values'
import { z } from '@tinycld/core/ui/form'
import { newRecordId } from 'pbtsdb/core'
import type { BooksAccounts, BooksProducts, BooksPurchaseOrderLines } from '../types'
import { lineAmount } from './document-lines'
import { accountAmountMessage, quantityMessage } from './document-schema'
import { ACCOUNT_AMOUNT_MESSAGES, PURCHASE_ORDER_MESSAGES } from './document-texts'
import { formatMoney } from './money'
import { moneyInputCents } from './money-input'
import { centsToText } from './money-text'
import { isOrderLineOpen } from './purchase-order-status'
import type { PurchaseTableRows } from './purchase-values'

// An order line as the dialog and the bill start read it: the stored line, with its
// product row (a product line) or its account row (an account line) when the read holds
// them.
export type CopyToBillOrderLine = Pick<
    BooksPurchaseOrderLines,
    | 'id'
    | 'kind'
    | 'account'
    | 'product'
    | 'description'
    | 'quantity'
    | 'rate'
    | 'amount'
    | 'position'
    | 'open_quantity'
    | 'open_amount'
> & {
    productRow?: Pick<BooksProducts, 'name' | 'vendor_part_no'> | undefined
    accountRow?: Pick<BooksAccounts, 'number' | 'name'> | undefined
}

// A line of a draft bill of the order: the order line it names, and the quantity (a
// product line) or the amount in cents (an account line) it holds.
export type CopyToBillDraftLine = { po_line: string; quantity: number; amount: number }

// What Create bill hands to the bill form (stores/copy-to-bill-store.ts): each ticked row's
// order line with its Qty to bill (a product line) or its Amount to bill in cents (an
// account line).
export type CopyToBillChoice = { lines: CopyToBillDraftLine[] }

export const COPY_TO_BILL_HEADINGS = {
    item: 'Products and services',
    account: 'Accounts',
} as const

type LineKind = 'item' | 'account'

// One row of the dialog. `quantity` and `amount` are the values the row starts at; an
// account row's amount is in cents, a product row's is its quantity at the line's rate.
export type CopyToBillRow = {
    lineId: string
    kind: LineKind
    heading: (typeof COPY_TO_BILL_HEADINGS)[LineKind]
    name: string
    partNo: string
    description: string
    openText: string
    // What is still open for a new bill: the open quantity (a product row) or amount (an
    // account row) less what the draft bills hold, not below 0, which the hint compares
    // the typed value with ("More than the 6 still open."). `openText` shows the line's
    // own open value.
    openQuantity: number
    openAmount: number
    rate: number
    quantity: number
    amount: number
    isTicked: boolean
}

const DEFAULT_CURRENCY = 'USD'

// Quantities have at most 2 decimals; a difference of two is rounded back to hundredths.
function hundredths(value: number): number {
    return Math.round(value * 100) / 100
}

function lineKindOf(line: Pick<CopyToBillOrderLine, 'kind'>): LineKind | null {
    if (line.kind === 'item' || line.kind === 'account') return line.kind
    return null
}

// The order's lines in form order: product lines, then account lines, each by position
// (the bill's two tables, Products and services above Accounts in the dialog).
function inFormOrder<L extends Pick<CopyToBillOrderLine, 'kind' | 'position' | 'id'>>(
    lines: readonly L[]
): L[] {
    const rank = (line: L) => (line.kind === 'item' ? 0 : 1)
    return [...lines].sort(
        (a, b) => rank(a) - rank(b) || a.position - b.position || (a.id < b.id ? -1 : 1)
    )
}

// What the draft bills hold of each order line, summed by the order line.
export function heldByDrafts(drafts: readonly CopyToBillDraftLine[]) {
    const held = new Map<string, { quantity: number; amount: number }>()
    for (const draft of drafts) {
        const sum = held.get(draft.po_line) ?? { quantity: 0, amount: 0 }
        held.set(draft.po_line, {
            quantity: hundredths(sum.quantity + draft.quantity),
            amount: sum.amount + draft.amount,
        })
    }
    return held
}

function rowNameOf(line: CopyToBillOrderLine): string {
    if (line.kind === 'account') {
        const account = line.accountRow
        return account ? `${account.number} ${account.name}` : ''
    }
    return line.productRow?.name ?? ''
}

/**
 * The dialog's rows: one for each open line of the order (isOrderLineOpen), in form order,
 * product lines under "Products and services" and account lines under "Accounts". Each
 * starts at the open quantity or amount less what the order's draft bills already hold,
 * not below 0; a row that starts at 0 starts unticked. A product row carries its product's
 * Vendor part no.; an account row has none.
 */
export function copyToBillRows(
    lines: readonly CopyToBillOrderLine[],
    draftLines: readonly CopyToBillDraftLine[],
    currency: string = DEFAULT_CURRENCY
): CopyToBillRow[] {
    const held = heldByDrafts(draftLines)
    const rows: CopyToBillRow[] = []
    for (const line of inFormOrder(lines)) {
        const kind = lineKindOf(line)
        if (kind === null || !isOrderLineOpen(line)) continue
        const drafts = held.get(line.id) ?? { quantity: 0, amount: 0 }
        const isItem = kind === 'item'
        const quantity = isItem ? Math.max(hundredths(line.open_quantity - drafts.quantity), 0) : 0
        const amount = isItem
            ? lineAmount(quantity, line.rate)
            : Math.max(line.open_amount - drafts.amount, 0)
        const startsAt = isItem ? quantity : amount
        rows.push({
            lineId: line.id,
            kind,
            heading: COPY_TO_BILL_HEADINGS[kind],
            name: rowNameOf(line),
            partNo: isItem ? (line.productRow?.vendor_part_no ?? '') : '',
            description: line.description,
            openText: isItem
                ? `Open ${line.open_quantity}`
                : `Open ${formatMoney(line.open_amount, currency)}`,
            openQuantity: quantity,
            openAmount: isItem ? 0 : amount,
            rate: line.rate,
            quantity,
            amount,
            isTicked: startsAt > 0,
        })
    }
    return rows
}

// The open value a row's typed value is over, as the hint words it ("6", "$180.00"); null
// while the typed value is not above it (or does not read as a number or money).
export function overOpenText(
    row: Pick<CopyToBillRow, 'kind' | 'openQuantity' | 'openAmount'>,
    value: { quantity: unknown; amount: unknown },
    currency: string = DEFAULT_CURRENCY
): string | null {
    if (row.kind === 'item') {
        const quantity = value.quantity
        if (typeof quantity !== 'number' || quantity <= row.openQuantity) return null
        return PURCHASE_ORDER_MESSAGES.overOpen.replace('%s', String(row.openQuantity))
    }
    if (typeof value.amount !== 'string') return null
    const cents = moneyInputCents(value.amount, currency)
    if (cents === null || cents <= row.openAmount) return null
    return PURCHASE_ORDER_MESSAGES.overOpen.replace('%s', formatMoney(row.openAmount, currency))
}

// The dialog's form values: one row per open line, with its tick, its Qty to bill (a
// product row) and its Amount to bill as typed money text (an account row). The quantity
// is '' while its text is cleared (core NumberInput writes '' for an empty input).
export type CopyToBillFormRow = {
    lineId: string
    kind: LineKind
    isTicked: boolean
    quantity: number | ''
    amount: string
}

export type CopyToBillFormValues = { rows: CopyToBillFormRow[] }

// A row's start values in the form: its Amount to bill as money text.
export function copyToBillFormValues(rows: readonly CopyToBillRow[]): CopyToBillFormValues {
    return {
        rows: rows.map(row => ({
            lineId: row.lineId,
            kind: row.kind,
            isTicked: row.isTicked,
            quantity: row.quantity,
            amount: row.kind === 'account' ? centsToText(row.amount) : '',
        })),
    }
}

// A ticked account row's Amount to bill: well formed, inside the line limit and not 0 (an
// empty amount is 0 too); the bill's account line rule (accountAmountMessage).
function amountToBillMessage(amount: string, currency: string): string | null {
    if (amount.trim() === '') return ACCOUNT_AMOUNT_MESSAGES.zero
    return accountAmountMessage(amount, currency)
}

/**
 * The dialog's rules (spec §3.7): at least one row ticked ("Choose at least one line."); a
 * ticked product row's quantity above 0 with at most 2 decimals (the bill line's rule); a
 * ticked account row's amount not 0. An unticked row's value is not checked (its input is
 * disabled and keeps its value; a cleared quantity '' passes there), and a value above the
 * open one passes (the dialog shows a hint). A ticked row's cleared quantity is refused by
 * quantityMessage. `currency` is the Books currency, in which the typed money reads.
 */
export function copyToBillSchemaFor(currency: string) {
    const row = z.object({
        lineId: z.string(),
        kind: z.enum(['item', 'account']),
        isTicked: z.boolean(),
        quantity: z.union([z.number(), z.literal('')]),
        amount: z.string(),
    })
    return z.object({ rows: z.array(row) }).superRefine((values, ctx) => {
        const ticked = values.rows.filter(item => item.isTicked)
        if (ticked.length === 0) {
            ctx.addIssue({
                code: 'custom',
                path: ['rows'],
                message: PURCHASE_ORDER_MESSAGES.chooseLine,
            })
        }
        values.rows.forEach((item, index) => {
            if (!item.isTicked) return
            const isItem = item.kind === 'item'
            const message = isItem
                ? quantityMessage(item.quantity, PURCHASE_ORDER_MESSAGES)
                : amountToBillMessage(item.amount, currency)
            if (message === null) return
            ctx.addIssue({
                code: 'custom',
                path: ['rows', index, isItem ? 'quantity' : 'amount'],
                message,
            })
        })
    })
}

export const copyToBillSchema = copyToBillSchemaFor(DEFAULT_CURRENCY)

// A ticked row the schema passed has a number; '' is the cleared text of an unticked row.
function quantityOf(row: CopyToBillFormRow): number {
    return typeof row.quantity === 'number' ? row.quantity : 0
}

// The choice Create bill stores: each ticked row's order line with its quantity, or its
// amount in cents. Runs on values the schema passed.
export function copyToBillChoiceOf(
    values: CopyToBillFormValues,
    currency: string = DEFAULT_CURRENCY
): CopyToBillChoice {
    const lines = values.rows
        .filter(row => row.isTicked)
        .map(row =>
            row.kind === 'item'
                ? { po_line: row.lineId, quantity: quantityOf(row), amount: 0 }
                : {
                      po_line: row.lineId,
                      quantity: 0,
                      amount: moneyInputCents(row.amount, currency) ?? 0,
                  }
        )
    return { lines }
}

// One bill line from an order line: its table, product or account, description and rate,
// with the quantity or amount the bill takes, a new id, and the order line it names.
function billLineOf(line: CopyToBillOrderLine, take: { quantity: number; amount: number }) {
    if (line.kind === 'account') {
        return {
            id: newRecordId(),
            kind: 'account',
            account: line.account,
            description: line.description,
            amount: centsToText(take.amount),
            po_line: line.id,
        } satisfies TableRow
    }
    return {
        id: newRecordId(),
        kind: 'item',
        product: line.product,
        description: line.description,
        quantity: take.quantity,
        rate: centsToText(line.rate),
        amount: lineAmount(take.quantity, line.rate),
        po_line: line.id,
    } satisfies TableRow
}

/**
 * The bill lines a bill from the order starts with (spec §3.7, §3.8): one for each line the
 * choice names, at its chosen quantity or amount, in form order; with no choice (a typed
 * URL, a reload), every open line at its open quantity or amount. Each names its order line
 * (`po_line`) and has a new id.
 */
export function billLinesFromChoice(
    lines: readonly CopyToBillOrderLine[],
    choice: CopyToBillChoice | undefined
): PurchaseTableRows {
    const chosen = new Map(choice?.lines.map(line => [line.po_line, line]))
    const rows: PurchaseTableRows = { account_lines: [], item_lines: [] }
    for (const line of inFormOrder(lines)) {
        const kind = lineKindOf(line)
        if (kind === null) continue
        const take = choice
            ? chosen.get(line.id)
            : isOrderLineOpen(line)
              ? { quantity: line.open_quantity, amount: line.open_amount }
              : undefined
        if (!take) continue
        const table = kind === 'account' ? rows.account_lines : rows.item_lines
        table.push(billLineOf(line, take))
    }
    return rows
}

// A bill's two line tables (spec §3.4): `account_lines` (row kind `account`) and
// `item_lines` (row kind `item`), both stored in books_bill_lines with their `kind`: their
// columns, their row kinds and how a row maps to a line record. `forms/hosts.ts` imports
// these and the generator loads hosts.ts in Node, and the bill fixture re-exports
// BILL_ACCOUNT_TYPES into the plain-node seed graph, so this file imports types, the
// shared column sizes and money-text.ts only.

import type { HostTableColumn } from '@tinycld/core/lib/forms/definition'
import type { HostRowKind } from '@tinycld/core/lib/forms/host'
import type { TableRowMapper } from '@tinycld/core/lib/forms/table-rows'
import type { BooksBillLines } from '../types'
import { AMOUNT_SIZE, QUANTITY_SIZE, RATE_SIZE } from './document-line-columns'
import { centsToText, parseMoney } from './money-text'

// The account types an account line may charge: the Account picker lists only these, and
// the server refuses any other (server/bills.go billAccountTypes).
export const BILL_ACCOUNT_TYPES: ReadonlySet<string> = new Set([
    'expense',
    'other_expense',
    'cost_of_goods_sold',
])

// As the sales lines (document-line-columns.ts), no column is required table-wide or
// carries a bound: each row kind lists the cells it needs, and the bill's schema owns
// the bounds.
//
// The two tables stack, and their Amount columns line up so the totals sit under both.
// Each slot takes its `flex` share of the free width and never less than its floor, and
// every floored column keeps the one floor-to-weight ratio (`floored`), so Amount has
// the same width in both tables when the two tables' weights add up to the same sum: the
// account table's Description takes the weight the product table gives Qty and Rate.
// Both tables keep core's 44 px row menu column. Amount is AMOUNT_SIZE in both, the sales
// lines' size (forms/document-line-cells.tsx AMOUNT_COLUMN_WIDTH is its floor).
const PRODUCT_FLEX = 5.7
const DESCRIPTION_FLEX = 5.9
const ACCOUNT_DESCRIPTION_FLEX = DESCRIPTION_FLEX + QUANTITY_SIZE.flex + RATE_SIZE.flex

export const BILL_ACCOUNT_COLUMNS: readonly HostTableColumn[] = [
    {
        key: 'account',
        label: 'Account',
        kind: 'text',
        required: false,
        hidden: false,
        component: 'LineAccountCell',
        flex: PRODUCT_FLEX,
    },
    {
        key: 'description',
        label: 'Description',
        kind: 'text',
        required: false,
        hidden: false,
        component: 'LineDescriptionCell',
        flex: ACCOUNT_DESCRIPTION_FLEX,
    },
    {
        // Typed by the writer: may be negative, never 0.
        key: 'amount',
        label: 'Amount',
        kind: 'text',
        required: false,
        hidden: false,
        component: 'LineTypedAmountCell',
        addOnSubmit: true,
        align: 'end',
        ...AMOUNT_SIZE,
    },
]

export const PURCHASE_ITEM_COLUMNS: readonly HostTableColumn[] = [
    {
        key: 'product',
        label: 'Product or service',
        kind: 'text',
        required: false,
        hidden: false,
        component: 'LinePurchaseProductCell',
        flex: PRODUCT_FLEX,
    },
    {
        key: 'description',
        label: 'Description',
        kind: 'text',
        required: false,
        hidden: false,
        component: 'LineDescriptionCell',
        flex: DESCRIPTION_FLEX,
    },
    {
        key: 'quantity',
        label: 'Qty',
        kind: 'number',
        required: false,
        hidden: false,
        component: 'LineQuantityCell',
        align: 'end',
        ...QUANTITY_SIZE,
    },
    {
        key: 'rate',
        label: 'Rate',
        kind: 'text',
        required: false,
        hidden: false,
        component: 'LineRateCell',
        addOnSubmit: true,
        align: 'end',
        ...RATE_SIZE,
    },
    {
        // Display only: the server writes Qty x Rate at every line write.
        key: 'amount',
        label: 'Amount',
        kind: 'number',
        required: false,
        hidden: false,
        component: 'LineItemAmountCell',
        align: 'end',
        ...AMOUNT_SIZE,
    },
]

// Core checks a kind's required cells ("Amount is required"); the bill's schema and the
// server refuse an amount of 0 with their own text.
export const ACCOUNT_ROW_KIND: HostRowKind = {
    key: 'account',
    label: 'Account line',
    addLabel: 'Add account line',
    columns: ['account', 'description', 'amount'],
    required: ['account', 'amount'],
    span: false,
    shortcut: 'Alt+Enter',
}

export const PURCHASE_ITEM_ROW_KIND: HostRowKind = {
    key: 'item',
    label: 'Product line',
    addLabel: 'Add product line',
    columns: ['product', 'description', 'quantity', 'rate', 'amount'],
    required: ['product'],
    span: false,
    shortcut: 'Alt+p',
}

export type PurchaseLineRow = Pick<
    BooksBillLines,
    | 'id'
    | 'kind'
    | 'account'
    | 'product'
    | 'description'
    | 'quantity'
    | 'rate'
    | 'amount'
    | 'position'
>

// What a row writes; the bill's data source adds the parent field (`bill`). An account
// line writes its typed amount; a product line writes none, as the server computes it.
export type PurchaseLineValues = Omit<PurchaseLineRow, 'id' | 'amount'> & { amount?: number }

function textCell(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

function moneyCents(value: unknown): number {
    return typeof value === 'string' ? (parseMoney(value) ?? 0) : 0
}

// A cell a kind does not draw is null in the row and 0 or '' in the record. The form
// checks the typed amount and rate before it saves; text that slips past is written as 0
// and the server's own bounds still apply.
export const PURCHASE_LINE_MAPPER: TableRowMapper<PurchaseLineRow, PurchaseLineValues> = {
    toRow: line =>
        line.kind === 'account'
            ? {
                  kind: line.kind,
                  account: line.account,
                  description: line.description,
                  amount: centsToText(line.amount),
              }
            : {
                  kind: line.kind,
                  product: line.product,
                  description: line.description,
                  quantity: line.quantity,
                  rate: centsToText(line.rate),
                  amount: line.amount,
              },
    positionOf: line => line.position,
    toRecord: (row, position) => {
        const base = { description: textCell(row.description), position }
        if (row.kind === 'account') {
            return {
                ...base,
                kind: 'account',
                account: textCell(row.account),
                product: '',
                quantity: 0,
                rate: 0,
                amount: moneyCents(row.amount),
            }
        }
        return {
            ...base,
            kind: 'item',
            account: '',
            product: textCell(row.product),
            quantity: typeof row.quantity === 'number' ? row.quantity : 0,
            rate: moneyCents(row.rate),
        }
    },
}

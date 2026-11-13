// A bill's two line tables (spec §3.4): `account_lines` (row kind `account`) and
// `item_lines` (row kind `item`), both stored in books_bill_lines with their `kind`.
// `forms/hosts.ts` imports these and the generator loads hosts.ts in Node, so this file
// imports types and the shared column sizes only.

import type { HostTableColumn } from '@tinycld/core/lib/forms/definition'
import type { HostRowKind } from '@tinycld/core/lib/forms/host'
import { AMOUNT_SIZE, QUANTITY_SIZE, RATE_SIZE } from './document-line-columns'

// As the sales lines (document-line-columns.ts), no column is required table-wide or
// carries a bound: each row kind lists the cells it needs, and the bill's schema owns
// the bounds.
//
// The two tables stack, and their Amount columns line up so the totals sit under both.
// Each slot takes its `flex` share of the free width and never less than its floor, and
// every floored column keeps one floor-to-weight ratio, so Amount has the same width in
// both tables when the two tables' weights add up to the same sum: the account table's
// Description takes the weight the product table gives Qty and Rate.
const PRODUCT_FLEX = 5.7
const DESCRIPTION_FLEX = 5.9
const ACCOUNT_DESCRIPTION_FLEX = DESCRIPTION_FLEX + QUANTITY_SIZE.flex + RATE_SIZE.flex

export const PURCHASE_ACCOUNT_LINE_COLUMNS: readonly HostTableColumn[] = [
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

export const PURCHASE_ITEM_LINE_COLUMNS: readonly HostTableColumn[] = [
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
        component: 'LineAmountCell',
        align: 'end',
        ...AMOUNT_SIZE,
    },
]

// An account line's "not 0" amount is the bill schema's and the server's rule (its own
// text), so only the account is a required cell here.
export const PURCHASE_ACCOUNT_ROW_KINDS: readonly HostRowKind[] = [
    {
        key: 'account',
        label: 'Account line',
        addLabel: 'Add account line',
        columns: ['account', 'description', 'amount'],
        required: ['account'],
        span: false,
        shortcut: 'Alt+Enter',
    },
]

export const PURCHASE_ITEM_ROW_KINDS: readonly HostRowKind[] = [
    {
        key: 'item',
        label: 'Product line',
        addLabel: 'Add product line',
        columns: ['product', 'description', 'quantity', 'rate', 'amount'],
        required: ['product'],
        span: false,
        shortcut: 'Alt+p',
    },
]

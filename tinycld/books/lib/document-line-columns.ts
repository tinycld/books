// A sales document's `lines` table: its columns, its row kinds and how a row maps to a
// line record (books_invoice_lines; a sales receipt's lines have the same columns).
// `forms/hosts.ts` imports the columns and kinds and the
// generator loads hosts.ts in Node, so the only runtime import is money-text.ts,
// which imports nothing: money.ts would pull React Native code into the generator.

import type { HostTableColumn } from '@tinycld/core/lib/forms/definition'
import type { HostRowKind } from '@tinycld/core/lib/forms/host'
import type { TableRowMapper } from '@tinycld/core/lib/forms/table-rows'
import type { BooksInvoiceLines } from '../types'
import { centsToText, parseMoney } from './money-text'

// No column is required table-wide: each row kind lists the cells it needs in its own
// `required` (DOCUMENT_ROW_KINDS), which core checks on the client and the server. No
// column carries a bound either: `documentSchema` owns the quantity and description
// bounds, so a cell shows one message, and counts text in code points as the server does.
//
// Each wide-grid slot takes its `flex` weight's share of the grid's free width (core:
// row − row menu − gaps) and never less than its `minWidth` floor. The numeric columns
// have floors so their cells show a whole value at the narrowest grid, a 640 px lines
// container (548 px free): Qty "1000", Rate "1890.00", Amount its 112 px figure
// (AMOUNT_COLUMN_WIDTH) and Tax its 44 px switch. Product and Description have no
// floor: below the width where the floors hold, they share what the floors leave, so
// a wide grid gives them most of its width (at 1280, Product ≥ 200 px and Description
// ≥ 260 px) and Description stays the widest with Product next.
//
// Every floored column has the same floor-to-weight ratio (FLOOR_PER_WEIGHT), so all
// floors hold, or all release, at one grid width. A footer span over a group of slots
// (document-footer-layout.ts) then resolves to its slots' summed width at every width.
const FLOOR_PER_WEIGHT = 45

// A floored column's size: the floor and the weight that keeps the shared ratio.
function floored(minWidth: number) {
    return { minWidth, flex: minWidth / FLOOR_PER_WEIGHT }
}

// A Percent line draws its cell in the Rate slot (`columnAt`), so both share one size.
const RATE_SIZE = floored(90)

export const DOCUMENT_LINE_COLUMNS: readonly HostTableColumn[] = [
    {
        key: 'product',
        label: 'Product or service',
        kind: 'text',
        required: false,
        hidden: false,
        component: 'LineProductCell',
        flex: 5.7,
    },
    {
        key: 'description',
        label: 'Description',
        kind: 'text',
        required: false,
        hidden: false,
        component: 'LineDescriptionCell',
        flex: 5.9,
    },
    {
        key: 'quantity',
        label: 'Qty',
        kind: 'number',
        required: false,
        hidden: false,
        component: 'LineQuantityCell',
        align: 'end',
        ...floored(68),
    },
    {
        key: 'rate',
        label: 'Price',
        kind: 'text',
        required: false,
        hidden: false,
        component: 'LineRateCell',
        addOnSubmit: true,
        align: 'end',
        ...RATE_SIZE,
    },
    {
        key: 'percent',
        label: 'Percent',
        kind: 'text',
        required: false,
        hidden: false,
        component: 'LinePercentCell',
        addOnSubmit: true,
        align: 'end',
        ...RATE_SIZE,
    },
    {
        // Display only: the server writes the amount at every line write.
        key: 'amount',
        label: 'Amount',
        kind: 'number',
        required: false,
        hidden: false,
        component: 'LineAmountCell',
        align: 'end',
        ...floored(112),
    },
    {
        key: 'taxable',
        label: 'Tax',
        kind: 'toggle',
        required: false,
        hidden: false,
        // Its own cell, so a phone card shows the "Tax" label core omits for a switch.
        component: 'LineTaxableCell',
        ...floored(45),
    },
]

// The first kind's columns are the wide grid's header.
export const DOCUMENT_ROW_KINDS: readonly HostRowKind[] = [
    {
        key: 'item',
        label: 'Item',
        addLabel: 'Add line',
        columns: ['product', 'description', 'quantity', 'rate', 'amount', 'taxable'],
        required: ['product'],
        span: false,
        shortcut: 'Alt+Enter',
    },
    {
        key: 'description',
        label: 'Description',
        addLabel: 'Description line',
        columns: ['description'],
        required: ['description'],
        span: true,
        shortcut: 'Alt+t',
    },
    {
        key: 'subtotal',
        label: 'Subtotal',
        addLabel: 'Subtotal',
        columns: ['amount'],
        span: true,
        shortcut: 'Alt+s',
    },
    {
        key: 'percent',
        label: 'Percent',
        addLabel: 'Percent line',
        columns: ['product', 'description', 'percent', 'amount', 'taxable'],
        required: ['product', 'percent'],
        span: false,
        columnAt: { percent: 'rate' },
        shortcut: 'Alt+5',
    },
]

export type DocumentLineRow = Pick<
    BooksInvoiceLines,
    | 'id'
    | 'kind'
    | 'product'
    | 'description'
    | 'quantity'
    | 'rate'
    | 'percent_ppm'
    | 'amount'
    | 'taxable'
    | 'position'
>

// What a row writes; the kind's data source adds the parent field (`invoice`). `amount` is never written: the server
// computes it.
export type DocumentLineValues = Omit<DocumentLineRow, 'id' | 'amount'>

const PPM_DIGITS = 4
const PERCENT_TEXT = /^(-?)(\d+)(?:\.(\d{1,4}))?\s*%?$/

// -100000 ppm → "-10", 125000 → "12.5": up to 4 decimals of a percent, trailing zeros cut.
export function ppmToPercentText(ppm: number): string {
    const digits = BigInt(Math.abs(ppm))
        .toString()
        .padStart(PPM_DIGITS + 1, '0')
    const whole = digits.slice(0, -PPM_DIGITS)
    const fraction = digits.slice(-PPM_DIGITS).replace(/0+$/, '')
    const sign = ppm < 0 ? '-' : ''
    return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`
}

// The percent typed in a cell in ppm; null when it is not a percent with at most 4
// decimals. Digit math, so no float rounds a typed value.
export function percentTextToPpm(text: string): number | null {
    const match = PERCENT_TEXT.exec(text.trim())
    if (!match) return null
    const [, sign, whole, fraction = ''] = match
    const ppm = Number(BigInt(whole + fraction.padEnd(PPM_DIGITS, '0')))
    return sign === '-' && ppm !== 0 ? -ppm : ppm
}

function textCell(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

function rateCents(value: unknown): number {
    return typeof value === 'string' ? (parseMoney(value) ?? 0) : 0
}

function percentPpm(value: unknown): number {
    return typeof value === 'string' ? (percentTextToPpm(value) ?? 0) : 0
}

function lineKind(value: unknown): DocumentLineRow['kind'] {
    const kinds: readonly DocumentLineRow['kind'][] = ['item', 'description', 'subtotal', 'percent']
    return kinds.find(kind => kind === value) ?? 'item'
}

// A cell a kind does not draw is null in the row and 0 or '' in the record. The form
// checks the typed rate and percent before it saves; text that slips past is written
// as 0 and the server's own bounds still apply.
export const DOCUMENT_LINE_MAPPER: TableRowMapper<DocumentLineRow, DocumentLineValues> = {
    toRow: line => ({
        kind: line.kind,
        product: line.product,
        description: line.description,
        quantity: line.kind === 'item' ? line.quantity : null,
        rate: line.kind === 'item' ? centsToText(line.rate) : null,
        percent: line.kind === 'percent' ? ppmToPercentText(line.percent_ppm) : null,
        amount: line.amount,
        taxable: line.taxable,
    }),
    positionOf: line => line.position,
    toRecord: (row, position) => {
        const kind = lineKind(row.kind)
        const hasProduct = kind === 'item' || kind === 'percent'
        return {
            kind,
            product: hasProduct ? textCell(row.product) : '',
            description: kind === 'subtotal' ? '' : textCell(row.description),
            quantity: kind === 'item' && typeof row.quantity === 'number' ? row.quantity : 0,
            rate: kind === 'item' ? rateCents(row.rate) : 0,
            percent_ppm: kind === 'percent' ? percentPpm(row.percent) : 0,
            taxable: hasProduct && row.taxable === true,
            position,
        }
    },
}

// The invoice's `lines` table: its columns, its row kinds and how a row maps to a
// books_invoice_lines record. `forms/hosts.ts` imports the columns and kinds and the
// generator loads hosts.ts in Node, so the only runtime import is money-text.ts,
// which imports nothing: money.ts would pull React Native code into the generator.

import type { HostTableColumn } from '@tinycld/core/lib/forms/definition'
import type { HostRowKind } from '@tinycld/core/lib/forms/host'
import type { TableRowMapper } from '@tinycld/core/lib/forms/table-rows'
import type { BooksInvoiceLines } from '../types'
import { centsToText, parseMoney } from './money-text'

// A column is required only when every kind that draws it requires it (core checks a
// column's flag for each kind that draws it). So `description` is not required here: an
// item may leave it blank, and a description line's own need is the server's
// "Description is required" and the invoice form's check.
export const INVOICE_LINE_COLUMNS: readonly HostTableColumn[] = [
    {
        key: 'product',
        label: 'Product or service',
        kind: 'text',
        required: true,
        hidden: false,
        component: 'LineProductCell',
    },
    {
        key: 'description',
        label: 'Description',
        kind: 'text',
        required: false,
        hidden: false,
        maxLength: 4000,
        component: 'LineDescriptionCell',
    },
    {
        key: 'quantity',
        label: 'Qty',
        kind: 'number',
        required: false,
        hidden: false,
        min: 0.01,
        max: 1000000,
    },
    {
        key: 'rate',
        label: 'Rate',
        kind: 'text',
        required: false,
        hidden: false,
        component: 'LineRateCell',
        addOnSubmit: true,
    },
    {
        key: 'percent',
        label: 'Percent',
        kind: 'text',
        required: true,
        hidden: false,
        component: 'LinePercentCell',
        addOnSubmit: true,
    },
    {
        // Display only: the server writes the amount at every line write.
        key: 'amount',
        label: 'Amount',
        kind: 'number',
        required: false,
        hidden: false,
        component: 'LineAmountCell',
    },
    {
        key: 'taxable',
        label: 'Tax',
        kind: 'toggle',
        required: false,
        hidden: false,
    },
]

// The first kind's columns are the wide grid's header.
export const INVOICE_ROW_KINDS: readonly HostRowKind[] = [
    {
        key: 'item',
        label: 'Item',
        addLabel: 'Add line',
        columns: ['product', 'description', 'quantity', 'rate', 'amount', 'taxable'],
        span: false,
        shortcut: 'Alt+Enter',
    },
    {
        key: 'description',
        label: 'Description',
        addLabel: 'Description line',
        columns: ['description'],
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
        span: false,
        columnAt: { percent: 'rate' },
        shortcut: 'Alt+5',
    },
]

export type InvoiceLineRow = Pick<
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

// What a row writes; the host adds `invoice`. `amount` is never written: the server
// computes it.
export type InvoiceLineValues = Omit<InvoiceLineRow, 'id' | 'amount'>

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

function lineKind(value: unknown): InvoiceLineRow['kind'] {
    const kinds: readonly InvoiceLineRow['kind'][] = ['item', 'description', 'subtotal', 'percent']
    return kinds.find(kind => kind === value) ?? 'item'
}

// A cell a kind does not draw is null in the row and 0 or '' in the record. The form
// checks the typed rate and percent before it saves; text that slips past is written
// as 0 and the server's own bounds still apply.
export const INVOICE_LINE_MAPPER: TableRowMapper<InvoiceLineRow, InvoiceLineValues> = {
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

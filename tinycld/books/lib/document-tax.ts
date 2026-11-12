// A sales document's header tax as the totals read it, and the totals the screen shows
// while the form is typed in.

import type { TableRow } from '@tinycld/core/lib/forms/values'
import { percentTextToPpm } from './document-line-columns'
import type { DocumentTax, DocumentTotals } from './document-lines'
import { type DocumentFormValuesBase, documentTotalsOf } from './document-values'
import { formatMoney } from './money'
import { moneyInputCents } from './money-input'
import { groupPpm, ratePercentText } from './sales-tax'
import type { TaxOptionRate } from './tax-rate-options'

type TaxRow = Pick<TaxOptionRate, 'id' | 'name' | 'type' | 'rate_ppm' | 'components'>

export type DocumentHeaderTax = { tax: DocumentTax; label: string | null }

const NO_TAX: DocumentHeaderTax = { tax: null, label: null }

// The chosen rate or group: a rate is its own one component; a group's components are
// its rates. The label is the totals' tax line, "Denver combined (8.71%)". No choice, or
// a choice whose row is not loaded, is no tax.
export function documentTaxOf(rows: readonly TaxRow[], taxRateId: string): DocumentHeaderTax {
    const chosen = rows.find(row => row.id === taxRateId)
    if (!taxRateId || !chosen) return NO_TAX
    const byId = new Map(rows.map(row => [row.id, row]))
    const components =
        chosen.type === 'group'
            ? chosen.components.flatMap(id => {
                  const rate = byId.get(id)
                  return rate ? [{ id, ppm: rate.rate_ppm }] : []
              })
            : [{ id: chosen.id, ppm: chosen.rate_ppm }]
    const ppm = groupPpm(components.map(component => component.ppm))
    return { tax: { components }, label: `${chosen.name} (${ratePercentText(ppm)})` }
}

function textOf(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

// A cell whose text does not parse makes a total that means nothing.
export function rowParses(row: TableRow, currency: string): boolean {
    if (row.kind === 'item') {
        const quantityOk = typeof row.quantity === 'number' && Number.isFinite(row.quantity)
        return quantityOk && moneyInputCents(textOf(row.rate), currency) !== null
    }
    if (row.kind === 'percent') return percentTextToPpm(textOf(row.percent) || '0') !== null
    return true
}

// What a line's Amount cell shows: nothing (`no-target`: a percent line with no line to
// apply to, whose percent cell shows the message while the user edits), an amount, or a
// Subtotal line's sum.
export type LineAmountView =
    | { kind: 'none' }
    | { kind: 'no-target' }
    | { kind: 'amount'; text: string }
    | { kind: 'subtotal'; text: string }

const NO_AMOUNT = '—'

// Every line's Amount cell from one pass over the lines: "—" while the line's cells (a
// Subtotal: every line above it) do not parse. Computed once per change by the form, so
// each cell reads its own entry and 250 lines cost one totals run, not 250.
export function lineAmountViews(rows: readonly TableRow[], currency: string): LineAmountView[] {
    const totals = documentTotalsOf({ lines: [...rows] }, null)
    const targetErrors = new Set(totals.percentTargetErrors)
    let aboveParse = true
    return rows.map((row, index) => {
        const parses = row.kind === 'subtotal' ? aboveParse : rowParses(row, currency)
        aboveParse = aboveParse && rowParses(row, currency)
        if (targetErrors.has(index)) return { kind: 'no-target' }
        const amount = totals.amounts[index]
        const text =
            parses && typeof amount === 'number' ? formatMoney(amount, currency) : NO_AMOUNT
        return row.kind === 'subtotal' ? { kind: 'subtotal', text } : { kind: 'amount', text }
    })
}

// The totals the screen shows, or null while a cell does not parse or a percent line has
// no line to apply to (the header then reads "—").
export function shownDocumentTotals(
    values: Pick<DocumentFormValuesBase, 'lines'>,
    tax: DocumentTax,
    currency: string
): DocumentTotals | null {
    const lines = values.lines ?? []
    if (!lines.every(row => rowParses(row, currency))) return null
    const totals = documentTotalsOf(values, tax)
    return totals.percentTargetErrors.length > 0 ? null : totals
}

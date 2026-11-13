import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import { type CustomerFill, customerFills } from '../tinycld/books/lib/document-fills'
import { DOCUMENT_LINE_MAPPER } from '../tinycld/books/lib/document-line-columns'
import { ESTIMATE_IDS, ESTIMATE_LINES, ESTIMATES } from '../tinycld/books/lib/estimate-form-fixture'
import { copyEstimateValues, newEstimateValues } from '../tinycld/books/lib/estimate-values'
import { TAX_IDS, TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'

// An estimate form's start values (spec §3.3, §3.5; plan Produces `lib/estimate-values.ts`).

const TODAY = '2026-11-12'
const COPY_DAY = '2026-11-20'
const MESSAGE = 'Thank you for the chance to quote this work.'

const RATES = TAX_RATE_ROWS.map(rate => ({
    id: rate.id,
    inactive: rate.inactive,
    is_default: rate.is_default,
}))

// The book's default rate (`is_default`).
const DEFAULT_RATE = TAX_IDS.denverCombined

// A customer fill from the customer fixture, with Adams combined as its own default rate.
function fillOf(id: string, overrides: Partial<CustomerFill> = {}): CustomerFill {
    const row = CUSTOMERS.find(c => c.id === id)
    if (!row) throw new Error(`no customer ${id} in the fixture`)
    return {
        id: row.id,
        display_name: row.display_name,
        email: row.email,
        billing_address: row.billing_address,
        terms: 'net_30',
        tax_exempt: false,
        default_tax_rate: TAX_IDS.adamsCombined,
        ...overrides,
    }
}

function estimateWithLines(id: string) {
    const estimate = ESTIMATES.find(e => e.id === id)
    if (!estimate) throw new Error(`no estimate ${id} in the fixture`)
    const lines = ESTIMATE_LINES.filter(l => l.estimate === id).sort(
        (a, b) => a.position - b.position
    )
    if (lines.length === 0) throw new Error(`estimate ${id} has no lines in the fixture`)
    return { estimate, lines }
}

function storedCells(record: {
    kind: string
    product: string
    description: string
    quantity: number
    rate: number
    percent_ppm: number
    taxable: boolean
}) {
    const { kind, product, description, quantity, rate, percent_ppm, taxable } = record
    return { kind, product, description, quantity, rate, percent_ppm, taxable }
}

function expectSameCellsWithNewIds(
    rows: TableRow[],
    lines: ReturnType<typeof estimateWithLines>['lines']
) {
    expect(rows).toHaveLength(lines.length)
    rows.forEach((row, index) => {
        expect(storedCells(DOCUMENT_LINE_MAPPER.toRecord(row, index))).toEqual(
            storedCells(lines[index])
        )
    })
    const ids = rows.map(row => String(row.id))
    for (const id of ids) expect(id).not.toBe('')
    expect(new Set(ids).size).toBe(ids.length)
    const storedIds = new Set(lines.map(line => line.id))
    expect(ids.filter(id => storedIds.has(id))).toEqual([])
}

describe('newEstimateValues', () => {
    it('with no customer starts Pending, dated today, with no expiration, no acceptance, one empty Item line and the default message', () => {
        const values = newEstimateValues({
            today: TODAY,
            customer: null,
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
            message: MESSAGE,
        })
        expect(values.customer).toBe('')
        expect(values.date).toBe(TODAY)
        expect(values.status).toBe('pending')
        expect(values.expiration_date).toBe('')
        expect(values.accepted_by).toBe('')
        expect(values.accepted_date).toBe('')
        expect(values.tax_rate).toBe(DEFAULT_RATE)
        expect(values.message).toBe(MESSAGE)
        expect(values.memo).toBe('')
        const lines = values.lines as TableRow[]
        expect(lines).toHaveLength(1)
        expect(lines[0]).toMatchObject({ kind: 'item', quantity: 1 })
        expect(lines[0].product ?? '').toBe('')
        expect(lines[0].description ?? '').toBe('')
        expect(String(lines[0].id)).not.toBe('')
    })

    it('with a customer fills Bill to, Email and Tax as a pick does, and has no Terms or Due date', () => {
        const customer = fillOf(CUSTOMER_IDS.harborview)
        const values = newEstimateValues({
            today: TODAY,
            customer,
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
            message: MESSAGE,
        })
        const fills = customerFills(customer, RATES, TODAY, null)
        expect(values.customer).toBe(customer.id)
        expect(values.bill_to).toEqual(fills.bill_to)
        expect(values.email).toBe(fills.email)
        expect(values.tax_rate).toBe(fills.tax_rate)
        expect(values.tax_rate).toBe(TAX_IDS.adamsCombined)
        expect(values).not.toHaveProperty('terms')
        expect(values).not.toHaveProperty('due_date')
    })

    it('with an exempt customer turns every line taxable off', () => {
        const customer = fillOf(CUSTOMER_IDS.harborview, { tax_exempt: true })
        const values = newEstimateValues({
            today: TODAY,
            customer,
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
            message: MESSAGE,
        })
        expect(values.tax_rate).toBe(customerFills(customer, RATES, TODAY, null).tax_rate)
        expect(values.tax_rate).not.toBe(TAX_IDS.adamsCombined)
        const lines = values.lines as TableRow[]
        expect(lines.length).toBeGreaterThan(0)
        for (const line of lines) expect(line.taxable).toBe(false)
    })
})

describe('copyEstimateValues', () => {
    // Accepted 1003 (Marisol Alvarez): Accepted by, an accepted date, an expiration date, a
    // memo and no tax chosen. The fill's own default rate (Adams combined) differs from the
    // source's tax, so a copy that refilled Tax from the customer would show here.
    it("keeps the accepted estimate's customer, Bill to, Email, Tax and message, and starts a new Pending estimate dated today", () => {
        const { estimate, lines } = estimateWithLines(ESTIMATE_IDS.accepted)
        expect(estimate.status).toBe('accepted')
        expect(estimate.accepted_by).not.toBe('')
        expect(estimate.accepted_date).not.toBe('')
        expect(estimate.expiration_date).not.toBe('')
        expect(estimate.memo).not.toBe('')
        const values = copyEstimateValues(estimate, lines, COPY_DAY, fillOf(CUSTOMER_IDS.alvarez))
        expect(values.customer).toBe(estimate.customer)
        expect(values.bill_to).toEqual(estimate.bill_to)
        expect(values.email).toBe(estimate.email)
        expect(values.tax_rate).toBe(estimate.tax_rate)
        expect(values.message).toBe(estimate.message)
        expect(values.message).not.toBe('')
        expect(values.date).toBe(COPY_DAY)
        expect(values.expiration_date).toBe('')
        expect(values.status).toBe('pending')
        expect(values.accepted_by).toBe('')
        expect(values.accepted_date).toBe('')
        expect(values.memo).toBe('')
        expectSameCellsWithNewIds(values.lines, lines)
    })

    // Pending 1001 holds every line kind: items, a subtotal, a percent and a description.
    it('keeps every line kind in order, each with a new id', () => {
        const { estimate, lines } = estimateWithLines(ESTIMATE_IDS.pending)
        expect(new Set(lines.map(l => l.kind))).toEqual(
            new Set(['item', 'subtotal', 'percent', 'description'])
        )
        const values = copyEstimateValues(
            estimate,
            lines,
            COPY_DAY,
            fillOf(CUSTOMER_IDS.harborview)
        )
        expectSameCellsWithNewIds(values.lines, lines)
    })
})

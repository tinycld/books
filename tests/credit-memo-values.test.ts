import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import { CREDIT_MEMO_DOCUMENT } from '../tinycld/books/components/documents/document-kinds'
import {
    CREDIT_MEMO_IDS,
    CREDIT_MEMO_LINES,
    CREDIT_MEMO_TODAY,
    CREDIT_MEMOS,
} from '../tinycld/books/lib/credit-memo-form-fixture'
import {
    copyCreditMemoValues,
    creditMemoCorrectionValues,
    newCreditMemoValues,
} from '../tinycld/books/lib/credit-memo-values'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import { type CustomerFill, customerFills } from '../tinycld/books/lib/document-fills'
import { DOCUMENT_LINE_MAPPER } from '../tinycld/books/lib/document-line-columns'
import { TAX_IDS, TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'

const TODAY = CREDIT_MEMO_TODAY
const COPY_DAY = '2026-11-17'

const RATES = TAX_RATE_ROWS.map(rate => ({
    id: rate.id,
    inactive: rate.inactive,
    is_default: rate.is_default,
}))

// The book's default rate (`is_default`).
const DEFAULT_RATE = TAX_IDS.denverCombined

function harborview(): CustomerFill {
    const row = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.harborview)
    if (!row) throw new Error('no Harborview in the fixture')
    return {
        id: row.id,
        display_name: row.display_name,
        email: row.email,
        billing_address: row.billing_address,
        terms: 'net_30',
        tax_exempt: false,
        default_tax_rate: TAX_IDS.adamsCombined,
    }
}

// Harborview marked exempt: its own default rate must not be used.
function exemptHarborview(): CustomerFill {
    return { ...harborview(), tax_exempt: true }
}

// The posted memo 1001 (Harborview, for invoice 1004, message and memo set) and its
// lines in position order.
function posted1001() {
    const memo = CREDIT_MEMOS.find(m => m.id === CREDIT_MEMO_IDS.posted)
    if (!memo) throw new Error('no posted 1001 in the credit memo fixture')
    const lines = CREDIT_MEMO_LINES.filter(l => l.credit_memo === memo.id).sort(
        (a, b) => a.position - b.position
    )
    if (lines.length === 0) throw new Error('posted 1001 has no lines in the fixture')
    return { memo, lines }
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
    lines: ReturnType<typeof posted1001>['lines']
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

describe('newCreditMemoValues', () => {
    it('with no customer starts empty, on the default rate, with one empty Item line', () => {
        const values = newCreditMemoValues({
            today: TODAY,
            customer: null,
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
        })
        expect(values.customer).toBe('')
        expect(values.bill_to).toBeNull()
        expect(values.tax_rate).toBe(DEFAULT_RATE)
        expect(values.date).toBe(TODAY)
        expect(values.message).toBe('')
        expect(values.memo).toBe('')
        const lines = values.lines as TableRow[]
        expect(lines).toHaveLength(1)
        expect(lines[0]).toMatchObject({ kind: 'item', quantity: 1 })
        expect(lines[0].product ?? '').toBe('')
        expect(lines[0].description ?? '').toBe('')
        expect(String(lines[0].id)).not.toBe('')
    })

    it('has no terms and no due date: a credit memo has neither', () => {
        const values = newCreditMemoValues({
            today: TODAY,
            customer: harborview(),
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
        })
        expect(values).not.toHaveProperty('terms')
        expect(values).not.toHaveProperty('due_date')
    })

    it('with a customer (`?customer=`) fills the header as a customer pick does', () => {
        const customer = harborview()
        const values = newCreditMemoValues({
            today: TODAY,
            customer,
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
        })
        const fills = customerFills(customer, RATES, TODAY, null)
        expect(values.customer).toBe(customer.id)
        expect(values.bill_to).toEqual(fills.bill_to)
        expect(values.email).toBe(fills.email)
        expect(values.tax_rate).toBe(fills.tax_rate)
        expect(values.tax_rate).toBe(TAX_IDS.adamsCombined)
    })

    it('with an exempt customer turns every line taxable off', () => {
        const customer = exemptHarborview()
        const values = newCreditMemoValues({
            today: TODAY,
            customer,
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
        })
        const fills = customerFills(customer, RATES, TODAY, null)
        expect(values.tax_rate).toBe(fills.tax_rate)
        const lines = values.lines as TableRow[]
        expect(lines.length).toBeGreaterThan(0)
        for (const line of lines) expect(line.taxable).toBe(false)
    })
})

describe('CREDIT_MEMO_DOCUMENT.values.new', () => {
    // Q8: the Books setting "Default message to customer" does not fill a credit memo.
    it('ignores the default message: a new credit memo starts with an empty message', () => {
        const values = CREDIT_MEMO_DOCUMENT.values.new({
            today: TODAY,
            party: null,
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
            message: 'Thank you',
            start: undefined,
        })
        expect(values.message).toBe('')
        expect(values.date).toBe(TODAY)
    })
})

describe('copyCreditMemoValues', () => {
    it('keeps the customer, the lines (new ids), the tax and the message', () => {
        const { memo, lines } = posted1001()
        const values = copyCreditMemoValues(memo, lines, COPY_DAY, harborview())
        expect(values.customer).toBe(memo.customer)
        expect(values.tax_rate).toBe(memo.tax_rate)
        expect(values.message).toBe(memo.message)
        expect(values.message).not.toBe('')
        expectSameCellsWithNewIds(values.lines, lines)
    })

    it('is dated the day given, with no memo, no invoice, and replaces nothing', () => {
        const { memo, lines } = posted1001()
        expect(memo.invoice).not.toBe('')
        expect(memo.memo).not.toBe('')
        const values = copyCreditMemoValues(memo, lines, COPY_DAY, harborview())
        expect(values.date).toBe(COPY_DAY)
        expect(values.memo).toBe('')
        expect((values as { invoice?: string }).invoice ?? '').toBe('')
        expect((values as { replaces?: string }).replaces ?? '').toBe('')
    })
})

describe('creditMemoCorrectionValues', () => {
    it('keeps every value of the posted memo, its invoice included, and names it in replaces', () => {
        const { memo, lines } = posted1001()
        const values = creditMemoCorrectionValues(memo, lines)
        expect(values.replaces).toBe(memo.id)
        expect(values.customer).toBe(memo.customer)
        expect(values.bill_to).toEqual(memo.bill_to)
        expect(values.email).toBe(memo.email)
        expect(values.date).toBe(memo.date)
        expect(values.tax_rate).toBe(memo.tax_rate)
        expect(values.message).toBe(memo.message)
        expect(values.memo).toBe(memo.memo)
        expect(values.memo).not.toBe('')
        expect(values.invoice).toBe(memo.invoice)
        expect(values.invoice).not.toBe('')
        expectSameCellsWithNewIds(values.lines, lines)
    })

    it('keeps a customer that has become inactive since the memo was posted', () => {
        const { memo, lines } = posted1001()
        const oldMill = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.oldMill)
        expect(oldMill?.inactive).toBe(true)
        const values = creditMemoCorrectionValues(
            { ...memo, customer: CUSTOMER_IDS.oldMill },
            lines
        )
        expect(values.customer).toBe(CUSTOMER_IDS.oldMill)
    })
})

import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import { type CustomerFill, customerFills } from '../tinycld/books/lib/document-fills'
import { DOCUMENT_LINE_MAPPER } from '../tinycld/books/lib/document-line-columns'
import {
    DEPOSIT_ACCOUNT_IDS,
    SALES_RECEIPT_IDS,
    SALES_RECEIPT_LINES,
    SALES_RECEIPTS,
} from '../tinycld/books/lib/sales-receipt-form-fixture'
import {
    copySalesReceiptValues,
    newSalesReceiptValues,
    salesReceiptCorrectionValues,
} from '../tinycld/books/lib/sales-receipt-values'
import { TAX_IDS, TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'

const TODAY = '2026-11-11'
const COPY_DAY = '2026-11-12'

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

// Posted 1004 (Harborview, Check 43567 to Undeposited funds, every line kind) and its
// lines in position order.
function posted1004() {
    const receipt = SALES_RECEIPTS.find(r => r.id === SALES_RECEIPT_IDS.posted)
    if (!receipt) throw new Error('no posted 1004 in the sales receipt fixture')
    const lines = SALES_RECEIPT_LINES.filter(l => l.sales_receipt === receipt.id).sort(
        (a, b) => a.position - b.position
    )
    if (lines.length === 0) throw new Error('posted 1004 has no lines in the fixture')
    return { receipt, lines }
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
    lines: ReturnType<typeof posted1004>['lines']
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

describe('newSalesReceiptValues', () => {
    it('with no customer starts empty, on the default rate and deposit account, with one empty Item line', () => {
        const values = newSalesReceiptValues({
            today: TODAY,
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
            depositDefault: DEPOSIT_ACCOUNT_IDS.undeposited,
        })
        expect(values.customer).toBe('')
        expect(values.bill_to).toBeNull()
        expect(values.email).toBe('')
        expect(values.date).toBe(TODAY)
        expect(values.tax_rate).toBe(DEFAULT_RATE)
        expect(values.deposit_to).toBe(DEPOSIT_ACCOUNT_IDS.undeposited)
        expect(values.payment_method).toBe('')
        expect(values.reference_no).toBe('')
        const lines = values.lines as TableRow[]
        expect(lines).toHaveLength(1)
        expect(lines[0]).toMatchObject({ kind: 'item', quantity: 1 })
        expect(lines[0].product ?? '').toBe('')
        expect(lines[0].description ?? '').toBe('')
        expect(String(lines[0].id)).not.toBe('')
    })

    it('has no terms and no due date: a receipt has neither', () => {
        const values = newSalesReceiptValues({
            today: TODAY,
            customer: harborview(),
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
            depositDefault: DEPOSIT_ACCOUNT_IDS.undeposited,
        })
        expect(values).not.toHaveProperty('terms')
        expect(values).not.toHaveProperty('due_date')
    })

    it('with a customer (`?customer=`) fills the header as a customer pick does', () => {
        const customer = harborview()
        const values = newSalesReceiptValues({
            today: TODAY,
            customer,
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
            depositDefault: DEPOSIT_ACCOUNT_IDS.undeposited,
        })
        const fills = customerFills(customer, RATES, TODAY, null)
        expect(values.customer).toBe(customer.id)
        expect(values.bill_to).toEqual(fills.bill_to)
        expect(values.email).toBe(fills.email)
        expect(values.tax_rate).toBe(fills.tax_rate)
        expect(values.tax_rate).toBe(TAX_IDS.adamsCombined)
        expect(values.deposit_to).toBe(DEPOSIT_ACCOUNT_IDS.undeposited)
    })

    it('with an exempt customer turns every line taxable off and takes the tax from the fill', () => {
        const customer = exemptHarborview()
        const values = newSalesReceiptValues({
            today: TODAY,
            customer,
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
            depositDefault: DEPOSIT_ACCOUNT_IDS.undeposited,
        })
        const fills = customerFills(customer, RATES, TODAY, null)
        expect(values.tax_rate).toBe(fills.tax_rate)
        // Exempt: the customer's own default rate is not used.
        expect(values.tax_rate).not.toBe(TAX_IDS.adamsCombined)
        const lines = values.lines as TableRow[]
        expect(lines.length).toBeGreaterThan(0)
        for (const line of lines) expect(line.taxable).toBe(false)
    })
})

describe('copySalesReceiptValues', () => {
    const ACTIVE = new Set<string>([
        DEPOSIT_ACCOUNT_IDS.checking,
        DEPOSIT_ACCOUNT_IDS.savings,
        DEPOSIT_ACCOUNT_IDS.undeposited,
    ])
    const ASK = { setAccount: '', activeIds: ACTIVE, defaultId: DEPOSIT_ACCOUNT_IDS.checking }

    it('keeps the customer, the lines (new ids), the tax, the payment method and the message', () => {
        const { receipt, lines } = posted1004()
        const values = copySalesReceiptValues(receipt, lines, COPY_DAY, harborview(), ASK)
        expect(values.customer).toBe(receipt.customer)
        expect(values.tax_rate).toBe(receipt.tax_rate)
        expect(values.payment_method).toBe('check')
        expect(values.payment_method).toBe(receipt.payment_method)
        expect(values.message).toBe(receipt.message)
        expect(values.message).not.toBe('')
        expectSameCellsWithNewIds(values.lines, lines)
    })

    it('is dated the day given, with no reference no., no memo, and replaces nothing', () => {
        const { receipt, lines } = posted1004()
        expect(receipt.reference_no).not.toBe('')
        expect(receipt.memo).not.toBe('')
        const values = copySalesReceiptValues(receipt, lines, COPY_DAY, harborview(), ASK)
        expect(values.date).toBe(COPY_DAY)
        expect(values.reference_no).toBe('')
        expect(values.memo).toBe('')
        expect(values.replaces ?? '').toBe('')
    })

    it("with Ask keeps the source's deposit account while it is still active", () => {
        const { receipt, lines } = posted1004()
        expect(receipt.deposit_to).toBe(DEPOSIT_ACCOUNT_IDS.undeposited)
        const values = copySalesReceiptValues(receipt, lines, COPY_DAY, harborview(), ASK)
        expect(values.deposit_to).toBe(DEPOSIT_ACCOUNT_IDS.undeposited)
    })

    it("with Ask takes the default account when the source's is no longer active", () => {
        const { receipt, lines } = posted1004()
        const active = new Set([DEPOSIT_ACCOUNT_IDS.checking, DEPOSIT_ACCOUNT_IDS.savings])
        const values = copySalesReceiptValues(receipt, lines, COPY_DAY, harborview(), {
            setAccount: '',
            activeIds: active,
            defaultId: DEPOSIT_ACCOUNT_IDS.savings,
        })
        expect(values.deposit_to).toBe(DEPOSIT_ACCOUNT_IDS.savings)
    })

    it('with an account set in "Sales deposited to" takes that account', () => {
        const { receipt, lines } = posted1004()
        const values = copySalesReceiptValues(receipt, lines, COPY_DAY, harborview(), {
            setAccount: DEPOSIT_ACCOUNT_IDS.checking,
            activeIds: ACTIVE,
            defaultId: DEPOSIT_ACCOUNT_IDS.savings,
        })
        expect(values.deposit_to).toBe(DEPOSIT_ACCOUNT_IDS.checking)
    })
})

describe('salesReceiptCorrectionValues', () => {
    it('keeps every value of the posted receipt and names it in replaces', () => {
        const { receipt, lines } = posted1004()
        const values = salesReceiptCorrectionValues(receipt, lines)
        expect(values.replaces).toBe(receipt.id)
        expect(values.customer).toBe(receipt.customer)
        expect(values.bill_to).toEqual(receipt.bill_to)
        expect(values.email).toBe(receipt.email)
        expect(values.date).toBe(receipt.date)
        expect(values.tax_rate).toBe(receipt.tax_rate)
        expect(values.payment_method).toBe(receipt.payment_method)
        expect(values.reference_no).toBe('43567')
        expect(values.deposit_to).toBe(DEPOSIT_ACCOUNT_IDS.undeposited)
        expect(values.message).toBe(receipt.message)
        expect(values.memo).toBe(receipt.memo)
        expect(values.memo).not.toBe('')
        expectSameCellsWithNewIds(values.lines, lines)
    })

    it('keeps a customer that has become inactive since the receipt was posted', () => {
        const { receipt, lines } = posted1004()
        const oldMill = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.oldMill)
        expect(oldMill?.inactive).toBe(true)
        const values = salesReceiptCorrectionValues(
            { ...receipt, customer: CUSTOMER_IDS.oldMill },
            lines
        )
        expect(values.customer).toBe(CUSTOMER_IDS.oldMill)
    })
})

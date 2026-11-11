// @vitest-environment happy-dom
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { evaluate } from '@tinycld/core/lib/forms/logic'
import { tableRowsOf } from '@tinycld/core/lib/forms/table-rows'
import { buildSchema, type TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import type { ZodTypeAny } from 'zod'
import hosts, { INVOICE_HOST_KEY } from '../tinycld/books/forms/hosts'
import ui from '../tinycld/books/forms/ui'
import type { DocumentTax } from '../tinycld/books/lib/document-lines'
import {
    INVOICE_CURRENCY,
    INVOICE_IDS,
    INVOICE_LINES,
    INVOICE_TODAY,
    INVOICES,
} from '../tinycld/books/lib/invoice-form-fixture'
import { INVOICE_LINE_MAPPER } from '../tinycld/books/lib/invoice-lines'
import { INVOICE_MESSAGES } from '../tinycld/books/lib/invoice-messages'
import { invoiceSchema } from '../tinycld/books/lib/invoice-schema'
import { type InvoiceFormValues, newInvoiceValues } from '../tinycld/books/lib/invoice-values'
import { TAX_IDS, TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'

const RATES = TAX_RATE_ROWS.map(rate => ({
    id: rate.id,
    inactive: rate.inactive,
    is_default: rate.is_default,
}))

const MESSAGES = INVOICE_MESSAGES

let nextId = 0
function rowId() {
    nextId += 1
    return `row${String(nextId).padStart(12, '0')}`
}

function item(cells: Partial<TableRow> = {}): TableRow {
    return {
        id: rowId(),
        kind: 'item',
        product: 'prodbookkeep001',
        description: '',
        quantity: 1,
        rate: '100.00',
        amount: null,
        taxable: false,
        ...cells,
    }
}

function percent(text: string, cells: Partial<TableRow> = {}): TableRow {
    return {
        id: rowId(),
        kind: 'percent',
        product: 'proddiscount001',
        description: '',
        percent: text,
        amount: null,
        taxable: false,
        ...cells,
    }
}

function description(text: string): TableRow {
    return { id: rowId(), kind: 'description', description: text }
}

function subtotal(): TableRow {
    return { id: rowId(), kind: 'subtotal', amount: null }
}

// A new form's values (newInvoiceValues) with a customer and the given lines.
function valuesWith(lines: TableRow[], overrides: Partial<InvoiceFormValues> = {}) {
    const base = newInvoiceValues({
        today: INVOICE_TODAY,
        rates: RATES,
        defaultRateId: TAX_IDS.denverCombined,
    })
    return { ...base, customer: 'cust_harbor_001', lines, ...overrides } as InvoiceFormValues
}

type Issue = { path: PropertyKey[]; message: string }

function issuesOf(schema: ZodTypeAny, values: unknown): Issue[] {
    const result = schema.safeParse(values)
    return result.success ? [] : result.error.issues
}

function messagesAt(issues: Issue[], path: (string | number)[]): string[] {
    const key = path.join('.')
    return issues.filter(issue => issue.path.join('.') === key).map(issue => issue.message)
}

function draftIssues(values: unknown) {
    return issuesOf(invoiceSchema(INVOICE_CURRENCY, 'draft'), values)
}

function postIssues(values: unknown) {
    return issuesOf(invoiceSchema(INVOICE_CURRENCY, 'post'), values)
}

function fixtureDraftValues(): InvoiceFormValues {
    const draft = INVOICES.find(row => row.id === INVOICE_IDS.draft)
    if (!draft) throw new Error('no draft invoice in the fixture')
    const lines = tableRowsOf(
        INVOICE_LINES.filter(line => line.invoice === draft.id),
        INVOICE_LINE_MAPPER
    )
    return valuesWith(lines, {
        customer: draft.customer,
        bill_to: draft.bill_to,
        email: draft.email,
        terms: draft.terms,
        date: draft.date,
        due_date: draft.due_date,
        tax_rate: draft.tax_rate,
        message: draft.message,
        memo: draft.memo,
    } as Partial<InvoiceFormValues>)
}

describe("invoiceSchema('USD', 'draft')", () => {
    it('accepts the fixture draft, every line kind included', () => {
        expect(draftIssues(fixtureDraftValues())).toEqual([])
    })

    it('refuses a due date before the invoice date at due_date', () => {
        const issues = draftIssues(
            valuesWith([item()], { date: '2026-11-04', due_date: '2026-11-03' })
        )
        expect(messagesAt(issues, ['due_date'])).toEqual([MESSAGES.dueBeforeDate])
    })

    it('accepts a due date on the invoice date', () => {
        const issues = draftIssues(
            valuesWith([item()], { date: '2026-11-04', due_date: '2026-11-04' })
        )
        expect(messagesAt(issues, ['due_date'])).toEqual([])
    })

    it('refuses a quantity of 0 and one with 3 decimals at the cell', () => {
        const zero = draftIssues(valuesWith([item(), item({ quantity: 0 })]))
        expect(messagesAt(zero, ['lines', 1, 'quantity'])).toEqual([MESSAGES.quantityNotPositive])
        const decimals = draftIssues(valuesWith([item({ quantity: 1.234 })]))
        expect(messagesAt(decimals, ['lines', 0, 'quantity'])).toEqual([MESSAGES.quantityDecimals])
    })

    it('refuses a rate that is not money and one over 10^15 cents at the cell', () => {
        const malformed = draftIssues(valuesWith([item({ rate: 'abc' })]))
        expect(messagesAt(malformed, ['lines', 0, 'rate'])).toEqual([MESSAGES.rateMalformed])
        // 10 000 000 000 000.01 dollars = 10^15 + 1 cents.
        const large = draftIssues(valuesWith([item({ rate: '10,000,000,000,000.01' })]))
        expect(messagesAt(large, ['lines', 0, 'rate'])).toEqual([MESSAGES.rateTooLarge])
    })

    it('accepts a negative rate and a rate of 0', () => {
        const negative = draftIssues(valuesWith([item({ rate: '10.00' }), item({ rate: '-5.00' })]))
        expect(negative).toEqual([])
        const zero = draftIssues(valuesWith([item({ rate: '0' })]))
        expect(zero).toEqual([])
    })

    it('refuses a percent outside -100..1000 and one with 5 decimals at the cell', () => {
        for (const text of ['-100.0001', '1000.5']) {
            const issues = draftIssues(valuesWith([item(), percent(text)]))
            expect(messagesAt(issues, ['lines', 1, 'percent'])).toEqual([MESSAGES.percentRange])
        }
        const decimals = draftIssues(valuesWith([item(), percent('1.23456')]))
        expect(messagesAt(decimals, ['lines', 1, 'percent'])).toEqual([MESSAGES.percentDecimals])
    })

    it('accepts -100 and 1000 percent', () => {
        expect(draftIssues(valuesWith([item(), percent('-100')]))).toEqual([])
        expect(draftIssues(valuesWith([item(), percent('1000')]))).toEqual([])
    })

    it('refuses a percent line under a description line at its percent cell', () => {
        const issues = draftIssues(valuesWith([item(), description('Notes'), percent('-10')]))
        expect(messagesAt(issues, ['lines', 2, 'percent'])).toEqual([MESSAGES.percentTarget])
    })

    it('accepts a percent line under a subtotal', () => {
        expect(draftIssues(valuesWith([item(), subtotal(), percent('-10')]))).toEqual([])
    })

    // The total rules report at `lines`, so the message shows under the table.
    it('refuses lines that sum below zero at lines', () => {
        const issues = draftIssues(valuesWith([item({ rate: '10.00' }), item({ rate: '-20.00' })]))
        expect(messagesAt(issues, ['lines'])).toEqual([MESSAGES.totalNegative])
    })

    it('refuses a line amount over maxLineAmount at lines', () => {
        // 2 x 9 000 000 000 000.00 dollars = 1.8 x 10^15 cents, over 10^15.
        const issues = draftIssues(
            valuesWith([item({ quantity: 2, rate: '9,000,000,000,000.00' })])
        )
        expect(messagesAt(issues, ['lines'])).toEqual([MESSAGES.totalTooLarge])
    })

    it('refuses a total over maxStoredAmount at lines', () => {
        // Ten lines of 10^15 cents each: every line is at its limit, the total 10^16 is
        // past 2^53 - 1.
        const lines = Array.from({ length: 10 }, () => item({ rate: '10,000,000,000,000.00' }))
        const issues = draftIssues(valuesWith(lines))
        expect(messagesAt(issues, ['lines'])).toEqual([MESSAGES.totalTooLarge])
        expect(issues.flatMap(issue => issue.path.slice(2))).not.toContain('rate')
    })

    it('refuses 251 lines and accepts 250', () => {
        const many = (count: number) => Array.from({ length: count }, () => item({ rate: '1.00' }))
        const over = draftIssues(valuesWith(many(251)))
        expect(over.map(issue => issue.message)).toContain(MESSAGES.tooManyLines)
        const at = draftIssues(valuesWith(many(250)))
        expect(at.map(issue => issue.message)).not.toContain(MESSAGES.tooManyLines)
    })

    it('refuses a description longer than 4000 code points, counting code points', () => {
        const long = draftIssues(valuesWith([item(), description('a'.repeat(4001))]))
        expect(messagesAt(long, ['lines', 1, 'description'])).toHaveLength(1)
        // 4000 emoji are 8000 UTF-16 units but 4000 code points, as the server counts.
        const astral = draftIssues(valuesWith([item(), description('😀'.repeat(4000))]))
        expect(messagesAt(astral, ['lines', 1, 'description'])).toEqual([])
    })

    it('accepts a draft with no item line and one description line', () => {
        expect(draftIssues(valuesWith([description('Retainer, billed later')]))).toEqual([])
    })
})

describe("invoiceSchema('USD', 'post')", () => {
    it('refuses a form with no item line at lines with needItemLine', () => {
        const issues = postIssues(valuesWith([description('Retainer, billed later')]))
        expect(messagesAt(issues, ['lines'])).toEqual([MESSAGES.needItemLine])
    })

    it('refuses a form whose only item line has no product', () => {
        const issues = postIssues(valuesWith([item({ product: '' }), description('Notes')]))
        expect(messagesAt(issues, ['lines'])).toContain(MESSAGES.needItemLine)
    })

    it('accepts the fixture draft', () => {
        expect(postIssues(fixtureDraftValues())).toEqual([])
    })
})

// The invoice form's whole schema path: the host's field and row schemas (core, per row
// kind) with invoiceSchema as the record schema, as the engine builds it.
describe('the books:invoice form schema', () => {
    function formIssues(values: InvoiceFormValues) {
        const found = hosts.find(h => h.key === INVOICE_HOST_KEY)
        if (!found) throw new Error('no books:invoice host in forms/hosts.ts')
        const host = hostDefSchema.parse(found)
        const definition = defaultDefinitionFor(host)
        const state = evaluate(definition, values, { today: INVOICE_TODAY, userId: 'u' })
        const schema = buildSchema(
            definition,
            host,
            state,
            ui.schemas,
            invoiceSchema(INVOICE_CURRENCY, 'draft')
        )
        return issuesOf(schema, values)
    }

    it('accepts the fixture draft', () => {
        expect(formIssues(fixtureDraftValues())).toEqual([])
    })

    it('refuses a description line with no description at its cell', () => {
        const issues = formIssues(valuesWith([item(), description('')]))
        expect(messagesAt(issues, ['lines', 1, 'description'])).toEqual(['Description is required'])
    })

    it('refuses an item line with no product at its cell', () => {
        const issues = formIssues(valuesWith([item({ product: '', description: 'Visit' })]))
        expect(messagesAt(issues, ['lines', 0, 'product'])).toEqual([
            'Product or service is required',
        ])
    })

    it('accepts an item line with no description', () => {
        expect(formIssues(valuesWith([item({ description: '' })]))).toEqual([])
    })

    // invoiceSchema owns the quantity and description bounds: the host's columns carry
    // none, so no zod default text shows before (or beside) the invoice's own.
    it('refuses a quantity of 0 with the invoice text alone', () => {
        const issues = formIssues(valuesWith([item(), item({ quantity: 0 })]))
        expect(messagesAt(issues, ['lines', 1, 'quantity'])).toEqual([MESSAGES.quantityNotPositive])
    })

    it('refuses a quantity over 1,000,000 with quantityTooLarge alone', () => {
        const issues = formIssues(valuesWith([item({ quantity: 1_000_000.01 })]))
        expect(messagesAt(issues, ['lines', 0, 'quantity'])).toEqual([MESSAGES.quantityTooLarge])
        expect(MESSAGES.quantityTooLarge).toBe('A quantity can be at most 1,000,000')
    })

    it('accepts a quantity of exactly 1,000,000', () => {
        const issues = formIssues(valuesWith([item({ quantity: 1_000_000, rate: '1.00' })]))
        expect(messagesAt(issues, ['lines', 0, 'quantity'])).toEqual([])
    })

    it('accepts a description of 4000 emoji, 8000 UTF-16 units but 4000 code points', () => {
        const issues = formIssues(valuesWith([item({ description: '😀'.repeat(4000) })]))
        expect(issues).toEqual([])
    })

    it('refuses a description of 4001 code points with the invoice text alone', () => {
        const issues = formIssues(valuesWith([item(), description('😀'.repeat(4001))]))
        expect(messagesAt(issues, ['lines', 1, 'description'])).toEqual(['Description is too long'])
    })
})

describe('invoiceSchema with the header tax', () => {
    const DENVER: DocumentTax = {
        components: [TAX_IDS.state, TAX_IDS.rtd, TAX_IDS.denverCity].map(id => {
            const rate = TAX_RATE_ROWS.find(r => r.id === id)
            if (!rate) throw new Error(`no tax rate ${id}`)
            return { id, ppm: rate.rate_ppm }
        }),
    }

    // Nine taxable lines of 10^15 cents: 9 x 10^15 is under 2^53 - 1 (about 9.007 x 10^15),
    // and Denver combined's 8.71% pushes the total past it.
    function taxedLines() {
        return Array.from({ length: 9 }, () =>
            item({ rate: '10,000,000,000,000.00', taxable: true })
        )
    }

    it('refuses at lines a total that only the tax pushes over maxStoredAmount', () => {
        const issues = issuesOf(
            invoiceSchema(INVOICE_CURRENCY, 'draft', DENVER),
            valuesWith(taxedLines())
        )
        expect(messagesAt(issues, ['lines'])).toEqual([MESSAGES.totalTooLarge])
    })

    it('without a tax, the same lines pass', () => {
        expect(draftIssues(valuesWith(taxedLines()))).toEqual([])
        const issues = issuesOf(
            invoiceSchema(INVOICE_CURRENCY, 'draft', null),
            valuesWith(taxedLines())
        )
        expect(issues).toEqual([])
    })
})

import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import type { ZodTypeAny } from 'zod'
import { CUSTOMER_IDS } from '../tinycld/books/lib/customer-form-fixture'
import { documentRefusalTarget } from '../tinycld/books/lib/document-messages'
import { documentSchema } from '../tinycld/books/lib/document-schema'
import { ESTIMATE_KIND } from '../tinycld/books/lib/sales-document-kinds'

// The estimate's record rules (spec §3.3, §3.8 "Engine reach"): Expiration date not
// before the estimate date, Accepted date required while Status is Accepted, Accepted by
// at most 200 characters, and the estimate's own total texts. An estimate has no due date.

const EXPIRATION_BEFORE_DATE = "Expiration date can't be before the estimate date"
const ACCEPTED_DATE_REQUIRED = 'Enter the accepted date'
const ACCEPTED_BY_TOO_LONG = 'Accepted by can be at most 200 characters'
const TOTAL_NEGATIVE = 'An estimate total cannot be below zero.'
const TOTAL_TOO_LARGE = 'The estimate total is more than Books can store.'

const DATE = '2026-11-12'

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

// A Pending estimate for Harborview dated DATE with one line.
function valuesWith(overrides: Record<string, unknown> = {}, lines: TableRow[] = [item()]) {
    return {
        customer: CUSTOMER_IDS.harborview,
        bill_to: null,
        email: '',
        date: DATE,
        expiration_date: '',
        tax_rate: '',
        status: 'pending',
        accepted_by: '',
        accepted_date: '',
        lines,
        message: '',
        memo: '',
        ...overrides,
    }
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

function estimateIssues(values: unknown) {
    return issuesOf(documentSchema(ESTIMATE_KIND, 'USD', 'draft'), values)
}

describe("documentSchema(ESTIMATE_KIND, 'USD', 'draft')", () => {
    it('accepts a Pending estimate with one line', () => {
        expect(estimateIssues(valuesWith())).toEqual([])
    })

    it('refuses an expiration date before the estimate date at expiration_date', () => {
        const issues = estimateIssues(valuesWith({ expiration_date: '2026-11-01' }))
        expect(messagesAt(issues, ['expiration_date'])).toEqual([EXPIRATION_BEFORE_DATE])
    })

    it('accepts an expiration date equal to the estimate date, and none', () => {
        expect(estimateIssues(valuesWith({ expiration_date: DATE }))).toEqual([])
        expect(estimateIssues(valuesWith({ expiration_date: '' }))).toEqual([])
    })

    it('refuses an Accepted estimate with no accepted date at accepted_date', () => {
        const issues = estimateIssues(valuesWith({ status: 'accepted', accepted_date: '' }))
        expect(messagesAt(issues, ['accepted_date'])).toEqual([ACCEPTED_DATE_REQUIRED])
    })

    it('accepts an empty accepted date while Status is not Accepted', () => {
        expect(estimateIssues(valuesWith({ status: 'pending', accepted_date: '' }))).toEqual([])
    })

    it('refuses an Accepted by of 201 characters at accepted_by', () => {
        const accepted = { status: 'accepted', accepted_date: DATE }
        const twoHundred = 'A'.repeat(200)
        expect(
            messagesAt(estimateIssues(valuesWith({ ...accepted, accepted_by: twoHundred })), [
                'accepted_by',
            ])
        ).toEqual([])
        const issues = estimateIssues(valuesWith({ ...accepted, accepted_by: `${twoHundred}B` }))
        expect(messagesAt(issues, ['accepted_by'])).toEqual([ACCEPTED_BY_TOO_LONG])
    })

    it('refuses lines that sum below zero at lines with the estimate text', () => {
        const issues = estimateIssues(
            valuesWith({}, [item({ rate: '10.00' }), item({ rate: '-20.00' })])
        )
        expect(messagesAt(issues, ['lines'])).toEqual([TOTAL_NEGATIVE])
    })

    it('refuses a total over the stored-amount limit at lines with the estimate text', () => {
        // Ten lines of 10^15 cents each: every line is at its limit, the total is past
        // 2^53 - 1.
        const lines = Array.from({ length: 10 }, () => item({ rate: '10,000,000,000,000.00' }))
        const issues = estimateIssues(valuesWith({}, lines))
        expect(messagesAt(issues, ['lines'])).toEqual([TOTAL_TOO_LARGE])
    })

    it('has no due-date rule: a due date before the estimate date is not checked', () => {
        const issues = estimateIssues(valuesWith({ due_date: '2026-11-01' }))
        expect(messagesAt(issues, ['due_date'])).toEqual([])
        expect(issues).toEqual([])
    })
})

// Server refusals carry PocketBase's final period.
describe('documentRefusalTarget(message, ESTIMATE_KIND)', () => {
    const target = (message: string) => documentRefusalTarget(message, ESTIMATE_KIND)

    it('sends the expiration refusal to Expiration date', () => {
        expect(target("Expiration date can't be before the estimate date.")).toBe('expiration_date')
    })

    it('sends the accepted date refusal to Accepted date', () => {
        expect(target('Enter the accepted date.')).toBe('accepted_date')
    })

    it('sends an inactive customer refusal to Customer', () => {
        expect(target('Harborview Dental is inactive. Choose an active customer.')).toBe('customer')
    })
})

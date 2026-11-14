// @vitest-environment happy-dom
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { evaluate } from '@tinycld/core/lib/forms/logic'
import { buildSchema, type TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import type { ZodTypeAny } from 'zod'
import hosts, { BILL_HOST_KEY } from '../tinycld/books/forms/hosts'
import ui from '../tinycld/books/forms/ui'
import { BILL_TODAY } from '../tinycld/books/lib/bill-form-fixture'
import { type DocumentSaveMode, documentSchema } from '../tinycld/books/lib/document-schema'
import { noLinesText } from '../tinycld/books/lib/purchase-lines'
import { BILL_KIND } from '../tinycld/books/lib/sales-document-kinds'
import { VENDOR_IDS } from '../tinycld/books/lib/vendor-form-fixture'

// The bill kind's rules (spec §3.4, §3.5): Due date not before the bill date, Vendor's
// bill no. at most 40 characters, an account line's account and non-zero amount, a
// product line's quantity and rate, Post's line-count rule by the shown tables, and the
// bill's total texts.

const DUE_BEFORE_DATE = "Due date can't be before the bill date"
const REF_TOO_LONG = "Vendor's bill no. can be at most 40 characters"
const AMOUNT_ZERO = 'Enter an amount other than 0'
const QUANTITY_NOT_POSITIVE = 'Enter a quantity more than 0'
const QUANTITY_DECIMALS = 'A quantity can have at most 2 decimals'
const TOTAL_NEGATIVE = 'A bill total cannot be below zero. Use a vendor credit.'

const DATE = BILL_TODAY
const ACCOUNT_6200 = 'acc6200software'
const ACCESS_POINT = 'prodwifiap00001'

let nextId = 0
function rowId() {
    nextId += 1
    return `row${String(nextId).padStart(12, '0')}`
}

function accountLine(cells: Partial<TableRow> = {}): TableRow {
    return {
        id: rowId(),
        kind: 'account',
        account: ACCOUNT_6200,
        description: '',
        amount: '100.00',
        ...cells,
    }
}

function productLine(cells: Partial<TableRow> = {}): TableRow {
    return {
        id: rowId(),
        kind: 'item',
        product: ACCESS_POINT,
        description: '',
        quantity: 1,
        rate: '121.40',
        amount: null,
        ...cells,
    }
}

// A bill for Summit IT Services dated DATE, due the same day.
function valuesWith(
    overrides: Record<string, unknown> = {},
    tables: { account_lines?: TableRow[]; item_lines?: TableRow[] } = {}
) {
    return {
        vendor: VENDOR_IDS.summit,
        mailing_address: null,
        terms: '',
        date: DATE,
        due_date: DATE,
        ref_no: '',
        account_lines: tables.account_lines ?? [accountLine()],
        item_lines: tables.item_lines ?? [],
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

const BOTH = ['account_lines', 'item_lines'] as const

function billSchema(mode: DocumentSaveMode, shown: readonly string[] = BOTH) {
    return documentSchema(BILL_KIND, 'USD', mode, null, undefined, {
        message: noLinesText(shown),
        tableKey: shown[0] ?? 'account_lines',
    })
}

// The bill form's whole schema path: the host's field and row schemas with the bill's
// record schema, as the engine builds it.
function formIssues(values: Record<string, unknown>, mode: DocumentSaveMode = 'draft') {
    const found = hosts.find(h => h.key === BILL_HOST_KEY)
    if (!found) throw new Error('no books:bill host in forms/hosts.ts')
    const host = hostDefSchema.parse(found)
    const definition = defaultDefinitionFor(host)
    const state = evaluate(definition, values, { today: DATE, userId: 'u' })
    const schema = buildSchema(definition, host, state, ui.schemas, billSchema(mode))
    return issuesOf(schema, values)
}

describe('the books:bill form schema', () => {
    it('accepts a bill with one account line', () => {
        expect(formIssues(valuesWith())).toEqual([])
    })

    it('refuses a due date before the bill date at due_date', () => {
        const issues = formIssues(valuesWith({ due_date: '2026-11-12' }))
        expect(messagesAt(issues, ['due_date'])).toEqual([DUE_BEFORE_DATE])
    })

    it("refuses a vendor's bill no. of 41 characters at ref_no", () => {
        const forty = 'R'.repeat(40)
        expect(messagesAt(formIssues(valuesWith({ ref_no: forty })), ['ref_no'])).toEqual([])
        const issues = formIssues(valuesWith({ ref_no: `${forty}X` }))
        expect(messagesAt(issues, ['ref_no'])).toEqual([REF_TOO_LONG])
    })

    it("refuses an account line with no account with core's required text at its Account cell", () => {
        const issues = formIssues(
            valuesWith({}, { account_lines: [accountLine({ account: '', description: 'Rent' })] })
        )
        expect(messagesAt(issues, ['account_lines', 0, 'account'])).toEqual(['Account is required'])
    })

    it('refuses an account line amount of 0 at its Amount cell', () => {
        const issues = formIssues(valuesWith({}, { account_lines: [accountLine({ amount: '0' })] }))
        expect(messagesAt(issues, ['account_lines', 0, 'amount'])).toEqual([AMOUNT_ZERO])
    })

    it('accepts a negative account line amount', () => {
        const lines = [accountLine({ amount: '125.00' }), accountLine({ amount: '-25.00' })]
        expect(formIssues(valuesWith({}, { account_lines: lines }))).toEqual([])
    })

    it('refuses a product line quantity of 0 at its Qty cell', () => {
        const issues = formIssues(valuesWith({}, { item_lines: [productLine({ quantity: 0 })] }))
        expect(messagesAt(issues, ['item_lines', 0, 'quantity'])).toEqual([QUANTITY_NOT_POSITIVE])
    })

    it('refuses a product line quantity with more than 2 decimals at its Qty cell', () => {
        const issues = formIssues(
            valuesWith({}, { item_lines: [productLine({ quantity: 1.234 })] })
        )
        expect(messagesAt(issues, ['item_lines', 0, 'quantity'])).toEqual([QUANTITY_DECIMALS])
    })

    it('refuses a negative product line rate at its Rate cell', () => {
        const issues = formIssues(valuesWith({}, { item_lines: [productLine({ rate: '-1.00' })] }))
        expect(messagesAt(issues, ['item_lines', 0, 'rate'])).toEqual(['Enter a rate of 0 or more'])
    })
})

describe('documentSchema(BILL_KIND): Post and the totals', () => {
    const empty = { account_lines: [], item_lines: [] }

    it('refuses Post with no lines under the first shown table, by the shown tables', () => {
        const both = issuesOf(billSchema('post', BOTH), valuesWith({}, empty))
        expect(messagesAt(both, ['account_lines'])).toEqual([
            'Add at least one account or product line',
        ])
        const accounts = issuesOf(billSchema('post', ['account_lines']), valuesWith({}, empty))
        expect(messagesAt(accounts, ['account_lines'])).toEqual(['Add at least one account line'])
        const products = issuesOf(billSchema('post', ['item_lines']), valuesWith({}, empty))
        expect(messagesAt(products, ['item_lines'])).toEqual(['Add at least one product line'])
    })

    it('posts a bill whose only line is a product line', () => {
        const values = valuesWith({}, { account_lines: [], item_lines: [productLine()] })
        expect(issuesOf(billSchema('post'), values)).toEqual([])
    })

    it('saves a draft with no lines', () => {
        expect(issuesOf(billSchema('draft'), valuesWith({}, empty))).toEqual([])
    })

    it('refuses lines that sum below zero with the bill text', () => {
        const lines = [accountLine({ amount: '10.00' }), accountLine({ amount: '-20.00' })]
        const issues = issuesOf(billSchema('draft'), valuesWith({}, { account_lines: lines }))
        expect(messagesAt(issues, ['account_lines'])).toEqual([TOTAL_NEGATIVE])
    })

    it('sums both tables: a credit on the account lines covered by a product line passes', () => {
        const values = valuesWith(
            {},
            {
                account_lines: [accountLine({ amount: '-20.00' })],
                item_lines: [productLine({ rate: '121.40' })],
            }
        )
        expect(issuesOf(billSchema('draft'), values)).toEqual([])
    })
})

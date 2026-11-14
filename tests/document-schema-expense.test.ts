// @vitest-environment happy-dom
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { evaluate } from '@tinycld/core/lib/forms/logic'
import { buildSchema, type TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import type { ZodTypeAny } from 'zod'
import hosts, { EXPENSE_HOST_KEY } from '../tinycld/books/forms/hosts'
import ui from '../tinycld/books/forms/ui'
import { type DocumentSaveMode, documentSchema } from '../tinycld/books/lib/document-schema'
import { EXPENSE_TODAY } from '../tinycld/books/lib/expense-form-fixture'
import { noLinesText } from '../tinycld/books/lib/purchase-lines'
import { EXPENSE_KIND } from '../tinycld/books/lib/sales-document-kinds'
import { VENDOR_IDS } from '../tinycld/books/lib/vendor-form-fixture'

// The expense kind's rules (spec §3.3-§3.6): Paid from and Payment method required, Ref
// no. at most 40 characters, the vendor optional, an account line's account and non-zero
// amount, a product line's quantity and rate, Post's line-count rule by the shown tables,
// and the expense's total and line-count texts. A zero total on Post is a server-only
// rule (server/expense_posting_test.go).

const REF_TOO_LONG = 'Ref no. can be at most 40 characters'
const AMOUNT_ZERO = 'Enter an amount other than 0'
const QUANTITY_NOT_POSITIVE = 'Enter a quantity more than 0'
const RATE_NEGATIVE = 'Enter a rate of 0 or more'
const TOTAL_NEGATIVE = 'An expense total cannot be below zero.'
const TOTAL_TOO_LARGE = 'The expense total is more than Books can store.'
const TOO_MANY_LINES = 'An expense holds at most 250 lines.'

const DATE = EXPENSE_TODAY
const CHECKING = 'acc1000checking'
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

// An expense to Summit IT Services by check from 1000 Business Checking.
function valuesWith(
    overrides: Record<string, unknown> = {},
    tables: { account_lines?: TableRow[]; item_lines?: TableRow[] } = {}
) {
    return {
        vendor: VENDOR_IDS.summit,
        paid_from: CHECKING,
        date: DATE,
        payment_method: 'check',
        reference_no: '1042',
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

function expenseSchema(mode: DocumentSaveMode, shown: readonly string[] = BOTH) {
    return documentSchema(EXPENSE_KIND, 'USD', mode, null, undefined, {
        message: noLinesText(shown),
        tableKey: shown[0] ?? 'account_lines',
    })
}

// The expense form's whole schema path: the host's field and row schemas with the
// expense's record schema, as the engine builds it.
function formIssues(values: Record<string, unknown>, mode: DocumentSaveMode = 'draft') {
    const found = hosts.find(h => h.key === EXPENSE_HOST_KEY)
    if (!found) throw new Error('no books:expense host in forms/hosts.ts')
    const host = hostDefSchema.parse(found)
    const definition = defaultDefinitionFor(host)
    const state = evaluate(definition, values, { today: DATE, userId: 'u' })
    const schema = buildSchema(definition, host, state, ui.schemas, expenseSchema(mode))
    return issuesOf(schema, values)
}

describe('the books:expense form schema', () => {
    it('accepts an expense with one account line', () => {
        expect(formIssues(valuesWith())).toEqual([])
    })

    it("refuses no Paid from with core's required text at paid_from", () => {
        const issues = formIssues(valuesWith({ paid_from: '' }))
        expect(messagesAt(issues, ['paid_from'])).toEqual(['Paid from is required'])
    })

    it("refuses no Payment method with core's required text at payment_method", () => {
        const issues = formIssues(valuesWith({ payment_method: '' }))
        expect(messagesAt(issues, ['payment_method'])).toEqual(['Payment method is required'])
    })

    it('refuses a Ref no. of 41 characters at reference_no', () => {
        const forty = 'R'.repeat(40)
        expect(
            messagesAt(formIssues(valuesWith({ reference_no: forty })), ['reference_no'])
        ).toEqual([])
        const issues = formIssues(valuesWith({ reference_no: `${forty}X` }))
        expect(messagesAt(issues, ['reference_no'])).toEqual([REF_TOO_LONG])
    })

    it('accepts an expense with no vendor', () => {
        expect(formIssues(valuesWith({ vendor: '' }))).toEqual([])
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

    it('refuses a product line quantity of 0 at its Qty cell', () => {
        const issues = formIssues(valuesWith({}, { item_lines: [productLine({ quantity: 0 })] }))
        expect(messagesAt(issues, ['item_lines', 0, 'quantity'])).toEqual([QUANTITY_NOT_POSITIVE])
    })

    it('refuses a product line rate of -1 at its Rate cell', () => {
        const issues = formIssues(valuesWith({}, { item_lines: [productLine({ rate: '-1.00' })] }))
        expect(messagesAt(issues, ['item_lines', 0, 'rate'])).toEqual([RATE_NEGATIVE])
    })
})

describe('documentSchema(EXPENSE_KIND): Post, the totals and the line count', () => {
    const empty = { account_lines: [], item_lines: [] }

    it('refuses Post with no lines under the first shown table, by the shown tables', () => {
        const both = issuesOf(expenseSchema('post', BOTH), valuesWith({}, empty))
        expect(messagesAt(both, ['account_lines'])).toEqual([noLinesText(BOTH)])
        const accounts = issuesOf(expenseSchema('post', ['account_lines']), valuesWith({}, empty))
        expect(messagesAt(accounts, ['account_lines'])).toEqual([noLinesText(['account_lines'])])
        const products = issuesOf(expenseSchema('post', ['item_lines']), valuesWith({}, empty))
        expect(messagesAt(products, ['item_lines'])).toEqual([noLinesText(['item_lines'])])
    })

    it('saves a draft with no lines', () => {
        expect(issuesOf(expenseSchema('draft'), valuesWith({}, empty))).toEqual([])
    })

    it('refuses lines that sum below zero with the expense text', () => {
        const lines = [accountLine({ amount: '10.00' }), accountLine({ amount: '-20.00' })]
        const issues = issuesOf(expenseSchema('draft'), valuesWith({}, { account_lines: lines }))
        expect(messagesAt(issues, ['account_lines'])).toEqual([TOTAL_NEGATIVE])
    })

    it('refuses a total over the stored-amount limit with the expense text', () => {
        // Ten lines of 10^15 cents each: every line is at its limit, the total is past
        // 2^53 - 1.
        const lines = Array.from({ length: 10 }, () =>
            accountLine({ amount: '10,000,000,000,000.00' })
        )
        const issues = issuesOf(expenseSchema('draft'), valuesWith({}, { account_lines: lines }))
        expect(messagesAt(issues, ['account_lines'])).toEqual([TOTAL_TOO_LARGE])
    })

    it('refuses 251 lines across the two tables and accepts 250', () => {
        const many = (accounts: number, products: number) =>
            valuesWith(
                {},
                {
                    account_lines: Array.from({ length: accounts }, () =>
                        accountLine({ amount: '1.00' })
                    ),
                    item_lines: Array.from({ length: products }, () =>
                        productLine({ rate: '1.00' })
                    ),
                }
            )
        const over = issuesOf(expenseSchema('draft'), many(200, 51))
        expect(messagesAt(over, ['account_lines'])).toEqual([TOO_MANY_LINES])
        expect(issuesOf(expenseSchema('draft'), many(200, 50))).toEqual([])
    })
})

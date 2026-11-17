// @vitest-environment happy-dom
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { evaluate } from '@tinycld/core/lib/forms/logic'
import { buildSchema, type TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import type { ZodTypeAny } from 'zod'
import hosts, { VENDOR_CREDIT_HOST_KEY } from '../tinycld/books/forms/hosts'
import ui from '../tinycld/books/forms/ui'
import { type DocumentSaveMode, documentSchema } from '../tinycld/books/lib/document-schema'
import { documentLinesForSave } from '../tinycld/books/lib/document-values'
import { noLinesText } from '../tinycld/books/lib/purchase-lines'
import { VENDOR_CREDIT_KIND } from '../tinycld/books/lib/sales-document-kinds'
import { VENDOR_CREDIT_TODAY } from '../tinycld/books/lib/vendor-credit-form-fixture'
import { VENDOR_IDS } from '../tinycld/books/lib/vendor-form-fixture'

// The vendor credit kind's rules (vendor credit spec §3.3-§3.6): Vendor's credit no. at
// most 40 characters, an account line's non-zero amount, a product line's quantity, the
// total at or above zero, at most 250 lines, and Post's line-count rule by the shown
// tables, with the vendor credit's texts. A zero total on Post is a server-only rule.

const REF_TOO_LONG = "Vendor's credit no. can be at most 40 characters"
const AMOUNT_ZERO = 'Enter an amount other than 0'
const QUANTITY_NOT_POSITIVE = 'Enter a quantity more than 0'
const TOTAL_NEGATIVE = 'A vendor credit total cannot be below zero. Use a bill.'
const TOO_MANY_LINES = 'A vendor credit holds at most 250 lines.'

const DATE = VENDOR_CREDIT_TODAY
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

// A vendor credit from Pacific Power dated DATE.
function valuesWith(
    overrides: Record<string, unknown> = {},
    tables: { account_lines?: TableRow[]; item_lines?: TableRow[] } = {}
) {
    return {
        vendor: VENDOR_IDS.pacificPower,
        date: DATE,
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

function vendorCreditSchema(mode: DocumentSaveMode, shown: readonly string[] = BOTH) {
    return documentSchema(VENDOR_CREDIT_KIND, 'USD', mode, null, undefined, {
        message: noLinesText(shown),
        tableKey: shown[0] ?? 'account_lines',
    })
}

// The vendor credit form's whole schema path: the host's field and row schemas with the
// kind's record schema, as the engine builds it.
function formIssues(values: Record<string, unknown>, mode: DocumentSaveMode = 'draft') {
    const found = hosts.find(h => h.key === VENDOR_CREDIT_HOST_KEY)
    if (!found) throw new Error('no books:vendor_credit host in forms/hosts.ts')
    const host = hostDefSchema.parse(found)
    const definition = defaultDefinitionFor(host)
    const state = evaluate(definition, values, { today: DATE, userId: 'u' })
    const schema = buildSchema(definition, host, state, ui.schemas, vendorCreditSchema(mode))
    return issuesOf(schema, values)
}

describe('the books:vendor_credit form schema', () => {
    it('accepts a vendor credit with one account line', () => {
        expect(formIssues(valuesWith())).toEqual([])
        expect(formIssues(valuesWith(), 'post')).toEqual([])
    })

    it("refuses a vendor's credit no. of 41 characters at ref_no", () => {
        const forty = 'R'.repeat(40)
        expect(messagesAt(formIssues(valuesWith({ ref_no: forty })), ['ref_no'])).toEqual([])
        const issues = formIssues(valuesWith({ ref_no: `${forty}X` }))
        expect(messagesAt(issues, ['ref_no'])).toEqual([REF_TOO_LONG])
    })

    it('refuses an account line amount of 0 under its row', () => {
        const issues = formIssues(valuesWith({}, { account_lines: [accountLine({ amount: '0' })] }))
        expect(messagesAt(issues, ['account_lines', 0, 'amount'])).toEqual([AMOUNT_ZERO])
    })

    it('refuses a product line quantity of 0 under its row', () => {
        const issues = formIssues(valuesWith({}, { item_lines: [productLine({ quantity: 0 })] }))
        expect(messagesAt(issues, ['item_lines', 0, 'quantity'])).toEqual([QUANTITY_NOT_POSITIVE])
    })

    it('passes with an empty trailing line, which the save drops', () => {
        const lines = [accountLine(), accountLine({ account: '', amount: '' })]
        const items = [productLine(), productLine({ product: '', rate: '' })]
        const values = valuesWith(
            {},
            {
                account_lines: documentLinesForSave(lines),
                item_lines: documentLinesForSave(items),
            }
        )
        expect(formIssues(values, 'post')).toEqual([])
    })
})

describe('documentSchema(VENDOR_CREDIT_KIND): Post, the total and the line count', () => {
    const empty = { account_lines: [], item_lines: [] }

    it('refuses Post with no lines under the first shown table, by the shown tables', () => {
        const both = issuesOf(vendorCreditSchema('post', BOTH), valuesWith({}, empty))
        expect(messagesAt(both, ['account_lines'])).toEqual([noLinesText(BOTH)])
        const accounts = issuesOf(
            vendorCreditSchema('post', ['account_lines']),
            valuesWith({}, empty)
        )
        expect(messagesAt(accounts, ['account_lines'])).toEqual([noLinesText(['account_lines'])])
        const products = issuesOf(vendorCreditSchema('post', ['item_lines']), valuesWith({}, empty))
        expect(messagesAt(products, ['item_lines'])).toEqual([noLinesText(['item_lines'])])
    })

    it('saves a draft with no lines', () => {
        expect(issuesOf(vendorCreditSchema('draft'), valuesWith({}, empty))).toEqual([])
    })

    it('refuses lines that sum below zero with the vendor credit text', () => {
        const lines = [accountLine({ amount: '10.00' }), accountLine({ amount: '-20.00' })]
        const issues = issuesOf(
            vendorCreditSchema('draft'),
            valuesWith({}, { account_lines: lines })
        )
        expect(messagesAt(issues, ['account_lines'])).toEqual([TOTAL_NEGATIVE])
    })

    it('accepts a negative account line when the total stays above zero', () => {
        const lines = [accountLine({ amount: '50.00' }), accountLine({ amount: '-10.00' })]
        expect(
            issuesOf(vendorCreditSchema('post'), valuesWith({}, { account_lines: lines }))
        ).toEqual([])
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
        const over = issuesOf(vendorCreditSchema('draft'), many(200, 51))
        expect(messagesAt(over, ['account_lines'])).toEqual([TOO_MANY_LINES])
        expect(issuesOf(vendorCreditSchema('draft'), many(200, 50))).toEqual([])
    })
})

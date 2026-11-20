import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    type CreateStatementsValues,
    createStatementsSchema,
    defaultStatementOptions,
    MAX_STATEMENT_CUSTOMERS,
    statementOptionsSchema,
} from '../tinycld/books/lib/statement-schema'

// The create screen's one zod schema (statements spec §3.2, §3.3, §4.6; plan notes 9, 11,
// 12): the options' date rules from the case table the Go create guard runs too, the
// address of a ticked row, the 200-customer limit and "no tick" at the root, and the
// default options of a day.

type StatementDateCase = {
    name: string
    type: 'balance_forward' | 'open_items'
    statementDate: string
    startDate: string
    endDate: string
    field: '' | 'statement_date' | 'start_date' | 'end_date'
    message: string
    go?: boolean
}

const CASES: StatementDateCase[] = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'statement_date_cases.json'), 'utf8')
)

const FORM_PATH: Record<Exclude<StatementDateCase['field'], ''>, string> = {
    statement_date: 'statementDate',
    start_date: 'startDate',
    end_date: 'endDate',
}

type Issue = { path: string; message: string }

function issuesOf(result: {
    success: boolean
    error?: { issues: { path: PropertyKey[]; message: string }[] }
}): Issue[] {
    if (result.success || !result.error) return []
    return result.error.issues.map(issue => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
    }))
}

function messagesAt(issues: Issue[], path: string) {
    return issues.filter(issue => issue.path === path).map(issue => issue.message)
}

describe('statementOptionsSchema: the shared date case table', () => {
    const tsCases = CASES.filter(c => c.go !== true)

    it('reads taken and refused TypeScript cases', () => {
        expect(tsCases.some(c => c.field === '')).toBe(true)
        expect(tsCases.some(c => c.field !== '')).toBe(true)
    })

    for (const c of tsCases) {
        it(c.name, () => {
            const result = statementOptionsSchema.safeParse({
                type: c.type,
                statementDate: c.statementDate,
                startDate: c.startDate,
                endDate: c.endDate,
                balanceFilter: 'open',
            })
            if (c.field === '') {
                expect(issuesOf(result)).toEqual([])
                expect(result.success).toBe(true)
                return
            }
            expect(result.success).toBe(false)
            expect(messagesAt(issuesOf(result), FORM_PATH[c.field])).toEqual([c.message])
        })
    }
})

// --- createStatementsSchema ---

const CUSTOMER_A = 'custstatement01'
const CUSTOMER_B = 'custstatement02'
const TOO_MANY = 'Select at most 200 customers. Narrow the list with Customer balance.'
const INVALID_ADDRESS = 'Enter a valid email address.'

function values(
    recipients: CreateStatementsValues['recipients'],
    intent: CreateStatementsValues['intent'] = 'save'
): CreateStatementsValues {
    return {
        type: 'balance_forward',
        statementDate: '2026-11-20',
        startDate: '2026-10-20',
        endDate: '2026-11-20',
        balanceFilter: 'open',
        intent,
        recipients,
    }
}

function ticked(count: number): CreateStatementsValues['recipients'] {
    return Array.from({ length: count }, (_, index) => ({
        customer: `cust${String(index).padStart(11, '0')}`,
        ticked: true,
        email: `customer${index}@example.com`,
    }))
}

function createIssues(input: CreateStatementsValues) {
    return issuesOf(createStatementsSchema.safeParse(input))
}

describe('createStatementsSchema', () => {
    it('refuses an invalid address on a ticked row under that row', () => {
        const issues = createIssues(
            values([
                { customer: CUSTOMER_A, ticked: true, email: 'a@example.com' },
                { customer: CUSTOMER_B, ticked: true, email: 'x@' },
            ])
        )
        expect(messagesAt(issues, 'recipients.1.email')).toEqual([INVALID_ADDRESS])
        expect(messagesAt(issues, 'recipients.0.email')).toEqual([])
    })

    it('takes the same invalid address on an unticked row', () => {
        const input = values([
            { customer: CUSTOMER_A, ticked: true, email: 'a@example.com' },
            { customer: CUSTOMER_B, ticked: false, email: 'x@' },
        ])
        expect(createIssues(input)).toEqual([])
    })

    it('takes an empty address on a ticked row on Save', () => {
        const input = values([{ customer: CUSTOMER_A, ticked: true, email: '' }], 'save')
        expect(createIssues(input)).toEqual([])
    })

    it('refuses 201 ticked rows at the root with the 200 text and takes 200', () => {
        expect(MAX_STATEMENT_CUSTOMERS).toBe(200)
        expect(messagesAt(createIssues(values(ticked(201))), 'root')).toEqual([TOO_MANY])
        expect(createIssues(values(ticked(200)))).toEqual([])
    })

    it('refuses a run with no ticked row at the root', () => {
        const issues = createIssues(
            values([
                { customer: CUSTOMER_A, ticked: false, email: 'a@example.com' },
                { customer: CUSTOMER_B, ticked: false, email: 'b@example.com' },
            ])
        )
        const root = messagesAt(issues, 'root')
        expect(root).toHaveLength(1)
        expect(root[0]).not.toBe('')
    })
})

// The address cases the Go send route runs too (server/testdata/statement_email_cases.json).
type StatementEmailCase = { to: string; ok: boolean }

const EMAIL_CASES: StatementEmailCase[] = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'statement_email_cases.json'), 'utf8')
)

const MISSING_ADDRESS = 'Enter an email address or clear the tick.'

describe('createStatementsSchema: the shared address case table', () => {
    const cases = EMAIL_CASES.filter(c => c.to !== '')

    it('reads taken and refused cases with an address', () => {
        expect(cases.some(c => c.ok)).toBe(true)
        expect(cases.some(c => !c.ok)).toBe(true)
    })

    for (const c of cases) {
        for (const intent of ['save', 'send'] as const) {
            it(`${intent}: ${JSON.stringify(c.to)} ${c.ok ? 'parses' : 'is refused'}`, () => {
                const result = createStatementsSchema.safeParse(
                    values([{ customer: CUSTOMER_A, ticked: true, email: c.to }], intent)
                )
                const issues = issuesOf(result)
                if (c.ok) {
                    expect(issues).toEqual([])
                    expect(result.success).toBe(true)
                    return
                }
                expect(messagesAt(issues, 'recipients.0.email')).toEqual([INVALID_ADDRESS])
            })
        }
    }
})

describe('createStatementsSchema: Save and send needs an address on every ticked row', () => {
    const blankSecond: CreateStatementsValues['recipients'] = [
        { customer: CUSTOMER_A, ticked: true, email: 'a@example.com' },
        { customer: CUSTOMER_B, ticked: true, email: '' },
    ]

    it('refuses a ticked row with an empty address under that row on send', () => {
        const issues = createIssues(values(blankSecond, 'send'))
        expect(messagesAt(issues, 'recipients.1.email')).toEqual([MISSING_ADDRESS])
        expect(messagesAt(issues, 'recipients.0.email')).toEqual([])
    })

    it('takes the same values on save', () => {
        expect(createIssues(values(blankSecond, 'save'))).toEqual([])
    })

    it('takes an unticked row with an empty address on send', () => {
        const input = values(
            [
                { customer: CUSTOMER_A, ticked: true, email: 'a@example.com' },
                { customer: CUSTOMER_B, ticked: false, email: '' },
            ],
            'send'
        )
        expect(createIssues(input)).toEqual([])
    })
})

describe('defaultStatementOptions', () => {
    it('gives today as Statement date and End date, and the same day of the month before as Start date', () => {
        expect(defaultStatementOptions('2026-11-20')).toMatchObject({
            type: 'balance_forward',
            statementDate: '2026-11-20',
            endDate: '2026-11-20',
            startDate: '2026-10-20',
        })
    })

    it('gives the last day of the month before when that month has no such day', () => {
        expect(defaultStatementOptions('2026-03-31')).toMatchObject({
            statementDate: '2026-03-31',
            endDate: '2026-03-31',
            startDate: '2026-02-28',
        })
    })
})

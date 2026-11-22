import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { depositSchema } from '../tinycld/books/lib/deposit-schema'
import { centsToText, maxStoredAmount } from '../tinycld/books/lib/money-text'

// The deposit form's one zod schema, for Save draft and Post alike (bank deposit spec §3.6).
// The validity cases are shared with the Go guards (server/testdata/deposit_cases.json);
// each rule and message of the schema has a failing case of its own below. A refusal key is
// `deposit_to`, `date`, `memo`, `items.<n>` (the row's rank), `lines.<n>.<field>`, or ''
// for a form-level message (Decisions, Refusal keys).
//
// The schema's context names the bank account options, the listed items by line id (their
// amount, date and noun), and the accounts by id that an other funds line may name, so the
// line-account cases of the shared table (Accounts receivable, Accounts payable, inactive,
// the Deposit to) run on the client too.

type CaseItem = { amount: number; date: string; docType?: string; number?: string }
type CaseLine = { account: string; amount: number }

type DepositCase = {
    name: string
    at: string
    date: string
    items: CaseItem[]
    itemCount?: number
    lines: CaseLine[]
    lineCount?: number
    key: string
    message: string
    clientMessage?: string
}

const CASES: { validity: DepositCase[] } = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'deposit_cases.json'), 'utf8')
)

const CURRENCY = 'USD'

const ACCOUNT = {
    deposit_to: 'acctcheck000001',
    savings: 'acctsaving00001',
    income: 'acctincome00001',
    expense: 'acctexpense0001',
    accounts_receivable: 'acctreceivabl01',
    accounts_payable: 'acctpayable0001',
    inactive: 'acctoldfees0001',
} as const

type AccountKind = keyof typeof ACCOUNT

const ACCOUNTS = {
    [ACCOUNT.deposit_to]: {
        number: '1000',
        name: 'Business Checking',
        type: 'bank',
        inactive: false,
    },
    [ACCOUNT.savings]: { number: '1010', name: 'Business Savings', type: 'bank', inactive: false },
    [ACCOUNT.income]: {
        number: '4900',
        name: 'Interest earned',
        type: 'other_income',
        inactive: false,
    },
    [ACCOUNT.expense]: {
        number: '6300',
        name: 'Bank charges and fees',
        type: 'expense',
        inactive: false,
    },
    [ACCOUNT.accounts_receivable]: {
        number: '1100',
        name: 'Accounts receivable',
        type: 'accounts_receivable',
        inactive: false,
    },
    [ACCOUNT.accounts_payable]: {
        number: '2000',
        name: 'Accounts payable',
        type: 'accounts_payable',
        inactive: false,
    },
    [ACCOUNT.inactive]: { number: '6900', name: 'Old fees', type: 'expense', inactive: true },
}

const BANK_OPTIONS = [ACCOUNT.deposit_to, ACCOUNT.savings]

type ListedItem = { amount: number; date: string; doc_type: string; number: string }

function lineId(index: number) {
    return `jlcase${String(index).padStart(9, '0')}`
}

// The typed text of an amount in cents, as the Amount cell holds it.
function amountText(cents: number) {
    return cents === 0 ? '0' : centsToText(cents)
}

function line(account: string, amount: string, fields: Partial<Record<string, string>> = {}) {
    return { customer: '', vendor: '', account, description: '', amount, ...fields }
}

type Built = {
    values: {
        deposit_to: string
        date: string
        memo: string
        items: { line: string }[]
        lines: ReturnType<typeof line>[]
    }
    listed: Record<string, ListedItem>
}

function build(input: {
    date: string
    items: CaseItem[]
    itemCount?: number
    lines: { account: string; amount: string }[]
    lineCount?: number
    memo?: string
    depositTo?: string
}): Built {
    const itemSeeds = input.itemCount
        ? Array.from({ length: input.itemCount }, () => input.items[0] as CaseItem)
        : input.items
    const lineSeeds = input.lineCount
        ? Array.from(
              { length: input.lineCount },
              () => input.lines[0] as { account: string; amount: string }
          )
        : input.lines
    const listed: Record<string, ListedItem> = {}
    const items = itemSeeds.map((seed, index) => {
        const id = lineId(index)
        listed[id] = {
            amount: seed.amount,
            date: seed.date,
            doc_type: seed.docType ?? 'payment',
            number: seed.number ?? String(1000 + index),
        }
        return { line: id }
    })
    return {
        values: {
            deposit_to: input.depositTo ?? ACCOUNT.deposit_to,
            date: input.date,
            memo: input.memo ?? '',
            items,
            lines: lineSeeds.map(seed => line(seed.account, seed.amount)),
        },
        listed,
    }
}

// An issue's refusal key: the path joined with '.', where a row's or the form's own root
// error (`items.1.root`, `root`) is keyed by the row (`items.1`) or '' for the form.
function keyOf(path: readonly PropertyKey[]): string {
    const joined = path.map(String).join('.')
    if (joined === 'root' || joined === '') return ''
    return joined.endsWith('.root') ? joined.slice(0, -'.root'.length) : joined
}

function issuesOf(built: Built) {
    const result = depositSchema(CURRENCY, {
        bankOptions: BANK_OPTIONS,
        items: built.listed,
        accounts: ACCOUNTS,
    }).safeParse(built.values)
    if (result.success) return []
    return result.error.issues.map(issue => ({ key: keyOf(issue.path), message: issue.message }))
}

function caseIssues(c: DepositCase) {
    return issuesOf(
        build({
            date: c.date,
            items: c.items,
            itemCount: c.itemCount,
            lines: c.lines.map(seed => ({
                account: ACCOUNT[seed.account as AccountKind],
                amount: amountText(seed.amount),
            })),
            lineCount: c.lineCount,
        })
    )
}

describe('depositSchema: the shared cases (server/testdata/deposit_cases.json)', () => {
    it('runs every validity case of the table', () => {
        expect(CASES.validity.length).toBeGreaterThanOrEqual(12)
        for (const c of CASES.validity) {
            for (const seed of c.lines) expect(Object.keys(ACCOUNT)).toContain(seed.account)
        }
    })

    it.each(CASES.validity.map(c => [c.name, c] as const))('%s', (_name, c) => {
        const issues = caseIssues(c)
        if (c.key === '' && c.message === '') {
            expect(issues).toEqual([])
            return
        }
        expect(issues).toEqual([{ key: c.key, message: c.clientMessage ?? c.message }])
    })
})

// A valid new deposit: one listed payment of $50.00 dated before the deposit date.
const VALID = () =>
    build({ date: '2026-11-16', items: [{ amount: 5_000, date: '2026-11-10' }], lines: [] })

function withValues(built: Built, values: Partial<Built['values']>): Built {
    return { ...built, values: { ...built.values, ...values } }
}

describe('depositSchema: each rule', () => {
    it('takes a valid deposit of one item', () => {
        expect(issuesOf(VALID())).toEqual([])
    })

    it('refuses a Deposit to that is not a listed option', () => {
        const issues = issuesOf(withValues(VALID(), { deposit_to: 'acctnotlisted01' }))
        expect(issues.map(issue => issue.key)).toEqual(['deposit_to'])
    })

    it('refuses an empty Deposit to (no bank account in the chart)', () => {
        const issues = issuesOf(withValues(VALID(), { deposit_to: '' }))
        expect(issues.map(issue => issue.key)).toEqual(['deposit_to'])
    })

    it('refuses a date that is not a day', () => {
        const issues = issuesOf(withValues(VALID(), { date: '2026-02-30' }))
        expect(issues.map(issue => issue.key)).toEqual(['date'])
    })

    it('refuses nothing ticked and no line', () => {
        const built = build({ date: '2026-11-16', items: [], lines: [] })
        expect(issuesOf(built)).toEqual([
            { key: '', message: 'Select an item or add a line to deposit.' },
        ])
    })

    it('refuses a total of zero', () => {
        const built = build({
            date: '2026-11-16',
            items: [{ amount: -5_000, date: '2026-11-10', docType: 'refund_receipt' }],
            lines: [{ account: ACCOUNT.income, amount: '50.00' }],
        })
        expect(issuesOf(built)).toEqual([
            { key: '', message: 'The deposit total must be above $0.00.' },
        ])
    })

    it('refuses a total below zero from a money-out item', () => {
        const built = build({
            date: '2026-11-16',
            items: [{ amount: -2_000, date: '2026-11-10', docType: 'refund_receipt' }],
            lines: [],
        })
        expect(issuesOf(built)).toEqual([
            { key: '', message: 'The deposit total must be above $0.00.' },
        ])
    })

    it('refuses a total over the stored-amount limit', () => {
        const built = build({
            date: '2026-11-16',
            items: [
                { amount: maxStoredAmount, date: '2026-11-10' },
                { amount: maxStoredAmount, date: '2026-11-10' },
            ],
            lines: [],
        })
        expect(issuesOf(built)).toEqual([
            { key: '', message: 'The amount is more than Books can store' },
        ])
    })

    it('refuses a ticked item dated after the deposit date, under that row, with the client text', () => {
        const built = build({
            date: '2026-10-10',
            items: [
                { amount: 5_000, date: '2026-10-01', docType: 'payment', number: '1001' },
                { amount: 3_000, date: '2026-10-12', docType: 'payment', number: '1004' },
            ],
            lines: [],
        })
        expect(issuesOf(built)).toEqual([
            {
                key: 'items.1',
                message: 'Payment 1004 is dated Oct 12, 2026, after the deposit date.',
            },
        ])
    })

    it('takes an item dated on the deposit date', () => {
        const built = build({
            date: '2026-11-10',
            items: [{ amount: 5_000, date: '2026-11-10' }],
            lines: [],
        })
        expect(issuesOf(built)).toEqual([])
    })

    it('refuses an other funds line with no account', () => {
        const built = withValues(VALID(), { lines: [line('', '12.40')] })
        expect(issuesOf(built)).toEqual([{ key: 'lines.0.account', message: 'Choose an account' }])
    })

    it('refuses a description of 1001 characters', () => {
        const built = withValues(VALID(), {
            lines: [line(ACCOUNT.income, '12.40', { description: 'd'.repeat(1001) })],
        })
        expect(issuesOf(built).map(issue => issue.key)).toEqual(['lines.0.description'])
    })

    it('takes a description of 1000 characters', () => {
        const built = withValues(VALID(), {
            lines: [line(ACCOUNT.income, '12.40', { description: 'd'.repeat(1000) })],
        })
        expect(issuesOf(built)).toEqual([])
    })

    it('refuses an amount of 0 with "Enter an amount other than 0"', () => {
        const built = withValues(VALID(), { lines: [line(ACCOUNT.income, '0.00')] })
        expect(issuesOf(built)).toEqual([
            { key: 'lines.0.amount', message: 'Enter an amount other than 0' },
        ])
    })

    it('refuses a malformed amount', () => {
        const built = withValues(VALID(), { lines: [line(ACCOUNT.income, '12.3.4')] })
        expect(issuesOf(built).map(issue => issue.key)).toEqual(['lines.0.amount'])
    })

    it('refuses an amount over the stored-amount limit', () => {
        const built = withValues(VALID(), {
            lines: [line(ACCOUNT.income, centsToText(maxStoredAmount + 1))],
        })
        expect(issuesOf(built)).toEqual([
            { key: 'lines.0.amount', message: 'The amount is more than Books can store' },
        ])
    })

    it('refuses a memo of 4001 characters', () => {
        const issues = issuesOf(withValues(VALID(), { memo: 'm'.repeat(4001) }))
        expect(issues.map(issue => issue.key)).toEqual(['memo'])
    })

    it('takes a memo of 4000 characters', () => {
        expect(issuesOf(withValues(VALID(), { memo: 'm'.repeat(4000) }))).toEqual([])
    })

    it('refuses 501 items', () => {
        const built = build({
            date: '2026-11-16',
            items: [{ amount: 100, date: '2026-11-10' }],
            itemCount: 501,
            lines: [],
        })
        expect(issuesOf(built)).toEqual([
            { key: '', message: 'A deposit holds at most 500 items.' },
        ])
    })

    it('takes 500 items', () => {
        const built = build({
            date: '2026-11-16',
            items: [{ amount: 100, date: '2026-11-10' }],
            itemCount: 500,
            lines: [],
        })
        expect(issuesOf(built)).toEqual([])
    })

    it('refuses 101 lines', () => {
        const built = build({
            date: '2026-11-16',
            items: [],
            lines: [{ account: ACCOUNT.income, amount: '1.00' }],
            lineCount: 101,
        })
        expect(issuesOf(built)).toEqual([
            { key: '', message: 'A deposit holds at most 100 other funds lines.' },
        ])
    })

    it('takes a negative line that leaves the total above zero', () => {
        const built = withValues(VALID(), { lines: [line(ACCOUNT.expense, '-15.00')] })
        expect(issuesOf(built)).toEqual([])
    })

    it('takes no item, one line', () => {
        const built = build({
            date: '2026-11-16',
            items: [],
            lines: [{ account: ACCOUNT.income, amount: '12.40' }],
        })
        expect(issuesOf(built)).toEqual([])
    })
})

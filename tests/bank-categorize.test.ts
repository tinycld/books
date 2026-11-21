import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { accountTypeDef } from '../tinycld/books/lib/account-types'
import {
    addedResultText,
    bankTransferRefusalField,
    bankTransferSchema,
    CATEGORIZE_MAX_LINES,
    categorizeAccountOptions,
    categorizeLines,
    categorizeRefusalField,
    categorizeSchema,
    categorizeSubmitState,
    defaultWay,
    nextTxnId,
    pickerOptionsMatching,
    pickerStateOf,
    SEND_FAILED_TEXT,
    transferLine,
    transferPickerOptions,
    transferSummaryText,
    wayViewOf,
} from '../tinycld/books/lib/bank-categorize'
import { transferAccountOptions } from '../tinycld/books/lib/transfer'

// The cases the Go test of the create hook also runs
// (server/testdata/bank_categorize_cases.json).
type AccountKind =
    | 'connection'
    | 'bank'
    | 'credit_card'
    | 'expense'
    | 'income'
    | 'accounts_receivable'
    | 'accounts_payable'

type CategorizeCase = {
    name: string
    bankAmount: number
    kind: 'categorize' | 'transfer'
    lines: { amount: number; memo: string }[]
    accountKinds: AccountKind[]
    valid: boolean
    message: string
}

const cases: CategorizeCase[] = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'bank_categorize_cases.json'), 'utf8')
)

type Account = {
    id: string
    name: string
    number: string
    type: string
    parent: string
    inactive: boolean
}

function account(
    id: string,
    number: string,
    name: string,
    type: string,
    extra: Partial<Account> = {}
): Account {
    return { id, number, name, type, parent: '', inactive: false, ...extra }
}

const CONNECTION_ID = 'acctchecking100'

// A small chart in number order: the connection's own account, one account of each other
// kind the cases name, a sub-account, an inactive account and one of each type the
// Categorize picker groups under.
const CHART: Account[] = [
    account(CONNECTION_ID, '1000', 'Business Checking', 'bank'),
    account('acctsavings1010', '1010', 'Business Savings', 'bank'),
    account('acctreceivable1', '1100', 'Accounts receivable', 'accounts_receivable'),
    account('acctundeposited', '1200', 'Undeposited Funds', 'other_current_asset'),
    account('acctpayable2000', '2000', 'Accounts payable', 'accounts_payable'),
    account('acctcard2100000', '2100', 'Company Card', 'credit_card'),
    account('acctequity30000', '3000', "Owner's Equity", 'equity'),
    account('acctconsult4000', '4000', 'Consulting Income', 'income'),
    account('acctrent6100000', '6100', 'Rent', 'expense'),
    account('acctsoftware620', '6200', 'Software Subscriptions', 'expense'),
    account('acctdesign62100', '6210', 'Design Tools', 'expense', { parent: 'acctsoftware620' }),
    account('acctpetty690000', '6900', 'Old Petty Cash', 'other_expense', { inactive: true }),
]

const KIND_ACCOUNT_IDS: Record<AccountKind, string> = {
    connection: CONNECTION_ID,
    bank: 'acctsavings1010',
    credit_card: 'acctcard2100000',
    expense: 'acctrent6100000',
    income: 'acctconsult4000',
    accounts_receivable: 'acctreceivable1',
    accounts_payable: 'acctpayable2000',
}

const RENT = 'acctrent6100000'

function oneLine(accountId: string, memo = 'Card purchase - Office Depot #2231') {
    return { payee: '', memo, lines: [{ account: accountId, amount: '', memo: '' }] }
}

function issueAt(result: { success: boolean; error?: unknown }, path: string): string | undefined {
    if (result.success) return undefined
    const issues = (result.error as { issues: { path: PropertyKey[]; message: string }[] }).issues
    return issues.find(issue => issue.path.join('.') === path)?.message
}

describe('the constants', () => {
    it('holds the line limit and the transport text', () => {
        expect(CATEGORIZE_MAX_LINES).toBe(50)
        expect(SEND_FAILED_TEXT).toBe(
            'The transaction could not be sent. Check your connection and try again.'
        )
    })
})

describe('defaultWay', () => {
    it('opens on Categorize with no suggestion and on Match with one or more', () => {
        expect(defaultWay(0)).toBe('categorize')
        expect(defaultWay(1)).toBe('match')
        expect(defaultWay(3)).toBe('match')
    })
})

describe('categorizeAccountOptions', () => {
    const options = categorizeAccountOptions(CHART, CONNECTION_ID)
    const ids = options.map(option => option.id)

    it("leaves out the connection's account, A/R, A/P and an inactive account", () => {
        expect(ids).not.toContain(CONNECTION_ID)
        expect(ids).not.toContain('acctreceivable1')
        expect(ids).not.toContain('acctpayable2000')
        expect(ids).not.toContain('acctpetty690000')
        expect(ids).toEqual([
            'acctsavings1010',
            'acctundeposited',
            'acctcard2100000',
            'acctequity30000',
            'acctconsult4000',
            'acctrent6100000',
            'acctsoftware620',
            'acctdesign62100',
        ])
    })

    it('labels an account "<number> <name>" and indents a sub-account', () => {
        const software = options.find(option => option.id === 'acctsoftware620')
        const design = options.find(option => option.id === 'acctdesign62100')
        expect(software?.label).toBe('6200 Software Subscriptions')
        expect(software?.indent ?? 0).toBe(0)
        expect(design?.label).toBe('6210 Design Tools')
        expect(design?.indent).toBe(1)
    })

    it('groups the options by account type, in chart order', () => {
        const groups = options.map(option => option.group)
        const runs = groups.filter((group, index) => group !== groups[index - 1])
        const typeLabel = (type: string) => accountTypeDef(type)?.label
        expect(runs).toEqual([
            typeLabel('bank'),
            typeLabel('other_current_asset'),
            typeLabel('credit_card'),
            typeLabel('equity'),
            typeLabel('income'),
            typeLabel('expense'),
        ])
        expect(runs).toEqual([
            'Bank',
            'Other current asset',
            'Credit card',
            'Equity',
            'Income',
            'Expense',
        ])
    })

    it('offers nothing in a book with only the three left-out kinds', () => {
        const onlyLeftOut = CHART.filter(row =>
            [CONNECTION_ID, 'acctreceivable1', 'acctpayable2000'].includes(row.id)
        )
        expect(categorizeAccountOptions(onlyLeftOut, CONNECTION_ID)).toEqual([])
    })
})

describe('transferPickerOptions', () => {
    // The chart plus an inactive account of a transfer type.
    const chart = [
        ...CHART,
        account('acctoldbank1020', '1020', 'Old Savings', 'bank', { inactive: true }),
    ]
    const options = transferPickerOptions(chart, CONNECTION_ID)

    it("lists the active transfer-type accounts but the connection's own, in chart order", () => {
        expect(options.map(option => option.id)).toEqual([
            'acctsavings1010',
            'acctundeposited',
            'acctcard2100000',
            'acctequity30000',
        ])
    })

    it('labels each option "<number> <name>" and groups it under its account type', () => {
        expect(options.map(option => [option.label, option.group])).toEqual([
            ['1010 Business Savings', 'Bank'],
            ['1200 Undeposited Funds', 'Other current asset'],
            ['2100 Company Card', 'Credit card'],
            ["3000 Owner's Equity", 'Equity'],
        ])
    })

    it("keeps the connection's account when the connection is another account", () => {
        const ids = transferPickerOptions(chart, 'acctsavings1010').map(option => option.id)
        expect(ids).toContain(CONNECTION_ID)
        expect(ids).not.toContain('acctsavings1010')
    })
})

describe('pickerOptionsMatching', () => {
    const options = categorizeAccountOptions(CHART, CONNECTION_ID)

    it('keeps the options whose label holds the search, in any case, in their order', () => {
        expect(pickerOptionsMatching(options, 'SOFT').map(option => option.label)).toEqual([
            '6200 Software Subscriptions',
        ])
        expect(pickerOptionsMatching(options, 'business').map(option => option.label)).toEqual([
            '1010 Business Savings',
        ])
        expect(pickerOptionsMatching(options, 'iN').map(option => option.label)).toEqual([
            '1010 Business Savings',
            '4000 Consulting Income',
        ])
    })

    it('matches the account number in the label and ignores spaces around the search', () => {
        expect(pickerOptionsMatching(options, '  6100 ').map(option => option.id)).toEqual([RENT])
    })

    it('keeps every option for an empty search and none for a search no label holds', () => {
        expect(pickerOptionsMatching(options, '')).toEqual(options)
        expect(pickerOptionsMatching(options, 'zzz')).toEqual([])
    })
})

describe('categorizeSubmitState', () => {
    const ready = {
        isValid: true,
        invalidHint: 'Choose an account.',
        loadFailed: false,
        payeeLoadFailed: false,
        isAdding: false,
        isBatchPending: false,
        writesDisabled: false,
        writesHint: undefined,
    }

    it('is enabled with no hint for a valid form', () => {
        expect(categorizeSubmitState(ready)).toEqual({ isDisabled: false, hint: undefined })
    })

    it("is disabled with the form's hint while the form is invalid", () => {
        expect(categorizeSubmitState({ ...ready, isValid: false })).toEqual({
            isDisabled: true,
            hint: 'Choose an account.',
        })
        expect(
            categorizeSubmitState({
                ...ready,
                isValid: false,
                invalidHint: 'Choose the other account.',
            })
        ).toEqual({ isDisabled: true, hint: 'Choose the other account.' })
    })

    it('is disabled while the accounts failed to load, a write is sent, or the batch runs', () => {
        expect(categorizeSubmitState({ ...ready, loadFailed: true }).isDisabled).toBe(true)
        expect(categorizeSubmitState({ ...ready, isAdding: true }).isDisabled).toBe(true)
        expect(categorizeSubmitState({ ...ready, isBatchPending: true }).isDisabled).toBe(true)
    })

    it('stays disabled while the payees failed to load', () => {
        expect(categorizeSubmitState({ ...ready, payeeLoadFailed: true }).isDisabled).toBe(true)
    })

    it("is disabled with the server's hint while the server takes no writes", () => {
        const hint = 'The server is read-only right now.'
        expect(categorizeSubmitState({ ...ready, writesDisabled: true, writesHint: hint })).toEqual(
            { isDisabled: true, hint }
        )
        expect(
            categorizeSubmitState({
                ...ready,
                isValid: false,
                writesDisabled: true,
                writesHint: hint,
            })
        ).toEqual({ isDisabled: true, hint })
    })
})

describe('categorizeSchema, one line', () => {
    const schema = categorizeSchema(-8647, 'USD')

    it('is valid with an account', () => {
        expect(schema.safeParse(oneLine(RENT)).success).toBe(true)
    })

    it('asks for an account on line 1', () => {
        const result = schema.safeParse(oneLine(''))
        expect(result.success).toBe(false)
        expect(issueAt(result, 'lines.0.account')).toBe('Choose an account.')
    })

    it('refuses a memo of 4001 characters and takes one of 4000', () => {
        expect(schema.safeParse(oneLine(RENT, 'm'.repeat(4001))).success).toBe(false)
        expect(schema.safeParse(oneLine(RENT, 'm'.repeat(4000))).success).toBe(true)
    })
})

describe('bankTransferSchema', () => {
    it('asks for the other account', () => {
        const result = bankTransferSchema.safeParse({ account: '', memo: 'Payment' })
        expect(result.success).toBe(false)
        expect(issueAt(result, 'account')).toBe('Choose the other account.')
        expect(
            bankTransferSchema.safeParse({ account: 'acctcard2100000', memo: 'Payment' }).success
        ).toBe(true)
    })

    it('refuses a memo of 4001 characters', () => {
        const result = bankTransferSchema.safeParse({
            account: 'acctcard2100000',
            memo: 'm'.repeat(4001),
        })
        expect(result.success).toBe(false)
    })
})

describe('categorizeLines', () => {
    it('writes one line for the bank amount without its sign', () => {
        expect(categorizeLines(oneLine(RENT), -8647)).toEqual([
            { account: RENT, amount: 8647, memo: '' },
        ])
        expect(categorizeLines(oneLine(RENT), 8647)).toEqual([
            { account: RENT, amount: 8647, memo: '' },
        ])
    })
})

describe('transferLine', () => {
    it('writes the other account for the bank amount without its sign', () => {
        const id = 'acctcard2100000'
        expect(transferLine(-50000, id)).toEqual([{ account: id, amount: 50000, memo: '' }])
        expect(transferLine(50000, id)).toEqual([{ account: id, amount: 50000, memo: '' }])
    })
})

describe('transferSummaryText', () => {
    it('says from for money out and into for money in', () => {
        expect(transferSummaryText(-50000, '1010 Business Savings', 'USD')).toBe(
            'A transfer of $500.00 from 1010 Business Savings.'
        )
        expect(transferSummaryText(50000, '1010 Business Savings', 'USD')).toBe(
            'A transfer of $500.00 into 1010 Business Savings.'
        )
    })
})

describe('addedResultText', () => {
    it('names the posted entry', () => {
        expect(addedResultText({ number: '1042', doc_type: 'journal', origin: 'manual' })).toBe(
            'Added Journal entry 1042.'
        )
        expect(addedResultText({ number: '1008', doc_type: 'transfer', origin: 'manual' })).toBe(
            'Added Transfer 1008.'
        )
    })

    it('is empty while the entry is not there', () => {
        expect(addedResultText(undefined)).toBe('')
    })
})

describe('categorizeRefusalField', () => {
    it("puts a line's refusal under that line's field", () => {
        expect(categorizeRefusalField('Line 2: choose an account.')).toBe('lines.1.account')
        expect(categorizeRefusalField('Line 1: enter an amount other than 0.')).toBe(
            'lines.0.amount'
        )
        expect(categorizeRefusalField('Line 1: account Old Petty Cash is inactive.')).toBe(
            'lines.0.account'
        )
    })

    it('names no field for a refusal of the whole transaction', () => {
        expect(categorizeRefusalField('This transaction is already reviewed.')).toBeNull()
    })
})

describe('bankTransferRefusalField', () => {
    it('puts every line refusal under the one account field', () => {
        expect(
            bankTransferRefusalField(
                'Line 1: Rent cannot be used in a transfer. Choose a bank, credit card, asset, liability or equity account.'
            )
        ).toBe('account')
        expect(bankTransferRefusalField('Line 2: account Old Petty Cash is inactive.')).toBe(
            'account'
        )
        expect(bankTransferRefusalField('This transaction is already reviewed.')).toBeNull()
    })
})

describe('nextTxnId', () => {
    const rows = ['a', 'b', 'c']

    it('goes to the row under, or above the last one', () => {
        expect(nextTxnId(rows, 'b')).toBe('c')
        expect(nextTxnId(rows, 'c')).toBe('b')
    })

    it('has no next row for the only row or a row not listed', () => {
        expect(nextTxnId(['a'], 'a')).toBeNull()
        expect(nextTxnId(rows, 'z')).toBeNull()
    })
})

describe('pickerStateOf', () => {
    const someOptions = [{ id: RENT, label: '6100 Rent' }]

    it('shows the loading row while the accounts load', () => {
        expect(pickerStateOf({ isLoading: true, isError: false, options: [] })).toMatchObject({
            isLoading: true,
            loadFailed: false,
        })
    })

    it('marks a failed read as failed', () => {
        expect(pickerStateOf({ isLoading: false, isError: true, options: [] })).toMatchObject({
            isLoading: false,
            loadFailed: true,
        })
    })

    it('says how to add an account when there is none to choose', () => {
        expect(pickerStateOf({ isLoading: false, isError: false, options: [] })).toEqual({
            isLoading: false,
            loadFailed: false,
            emptyText: 'No account to choose. Add one in Chart of Accounts.',
        })
        expect(
            pickerStateOf({ isLoading: false, isError: false, options: someOptions })
        ).toMatchObject({ isLoading: false, loadFailed: false })
    })
})

describe('wayViewOf', () => {
    it('shows the switch to a writer on a For review row once the suggestions loaded', () => {
        expect(wayViewOf({ canWrite: true, status: 'for_review', suggestionsReady: true })).toBe(
            'switch'
        )
        expect(wayViewOf({ canWrite: true, status: 'for_review', suggestionsReady: false })).toBe(
            'loading'
        )
    })

    it('shows a reader the Match list only', () => {
        expect(wayViewOf({ canWrite: false, status: 'for_review', suggestionsReady: true })).toBe(
            'reader'
        )
    })

    it('shows no switch on a Reviewed or Excluded row', () => {
        for (const status of ['reviewed', 'excluded'] as const) {
            for (const canWrite of [true, false]) {
                expect(wayViewOf({ canWrite, status, suggestionsReady: true }), status).toBe('none')
            }
        }
    })
})

// A case this checkpoint can judge: one line for the whole bank amount, so only the
// account's kind (and, for Categorize, the one-line schema) decides it. The split rules
// (several lines, a 0 amount, the sum, the 50-line limit) are checkpoint 4's.
function isJudged(testCase: CategorizeCase): boolean {
    const [line] = testCase.lines
    return testCase.lines.length === 1 && line?.amount === Math.abs(testCase.bankAmount)
}

function judge(testCase: CategorizeCase): boolean {
    const id = KIND_ACCOUNT_IDS[testCase.accountKinds[0] ?? 'expense']
    if (testCase.kind === 'transfer') {
        const offered = transferAccountOptions(CHART, '').options.map(option => option.value)
        return id !== CONNECTION_ID && offered.includes(id)
    }
    const offered = categorizeAccountOptions(CHART, CONNECTION_ID).map(option => option.id)
    const values = oneLine(id, testCase.lines[0]?.memo ?? '')
    const parsed = categorizeSchema(testCase.bankAmount, 'USD').safeParse(values)
    return offered.includes(id) && parsed.success
}

describe('the shared cases (server/testdata/bank_categorize_cases.json)', () => {
    const judged = cases.filter(isJudged)

    it('judges the one-line cases of both kinds', () => {
        expect(judged.map(testCase => testCase.name)).toEqual([
            'one expense line for money out',
            "the connection's own account",
            'an Accounts receivable account',
            'an Accounts payable account',
            'a transfer to a bank account',
            'a transfer from a credit card account',
            'a transfer to an expense account',
            'a transfer from an income account',
        ])
    })

    for (const testCase of judged) {
        it(testCase.name, () => {
            expect(judge(testCase)).toBe(testCase.valid)
        })
    }

    it("maps each case's line refusal to its field", () => {
        for (const testCase of cases) {
            const match = /^Line (\d+): (.*)$/.exec(testCase.message)
            if (!match) continue
            const index = Number(match[1]) - 1
            if (testCase.kind === 'transfer') {
                expect(bankTransferRefusalField(testCase.message), testCase.name).toBe('account')
                continue
            }
            const field = /amount/.test(match[2] ?? '') ? 'amount' : 'account'
            expect(categorizeRefusalField(testCase.message), testCase.name).toBe(
                `lines.${index}.${field}`
            )
        }
    })
})

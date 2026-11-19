import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { closedThroughMessage } from '../tinycld/books/lib/opening-balances-messages'
import {
    WRITE_OFF_MESSAGES,
    type WriteOffValues,
    writeOffDefaultAccount,
    writeOffDefaultDate,
    writeOffDialogState,
    writeOffRefusalErrors,
    writeOffRefusalTarget,
    writeOffSchema,
} from '../tinycld/books/lib/write-off-schema'

// The write-off dialog's pure rules (write-off spec §3.2, §3.3): one zod schema shared in
// cases with the Go create guard (server/testdata/write_off_cases.json), the default date
// and account, the body the dialog draws, and where a server refusal shows.

type WriteOffCase = {
    name: string
    invoiceDate: string
    closeDate: string
    hasOverride: boolean
    date: string
    account: '' | 'expense' | 'other_expense' | 'income' | 'inactive'
    memoLength: number
    field: string
    message: string
    go?: boolean
}

const CASES: WriteOffCase[] = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'write_off_cases.json'), 'utf8')
)

// The client's account list offers only active expense and other expense accounts, so a
// case names its account by type; the schema sees the chosen id.
const ACCOUNT_IDS: Record<WriteOffCase['account'], string> = {
    '': '',
    expense: 'acct_expense001',
    other_expense: 'acct_otherexp01',
    income: 'acct_income0001',
    inactive: 'acct_inactive01',
}

function issuesOf(c: WriteOffCase) {
    const values: WriteOffValues = {
        date: c.date,
        account: ACCOUNT_IDS[c.account],
        memo: 'x'.repeat(c.memoLength),
    }
    const result = writeOffSchema({
        invoiceDate: c.invoiceDate,
        closeDate: c.closeDate,
        hasOverride: c.hasOverride,
    }).safeParse(values)
    if (result.success) return []
    return result.error.issues.map(issue => ({
        field: issue.path.map(String).join('.'),
        message: issue.message,
    }))
}

describe('writeOffSchema: the shared cases (server/testdata/write_off_cases.json)', () => {
    const clientCases = CASES.filter(c => c.go !== true)

    it('runs every case that is not Go only', () => {
        expect(clientCases.length).toBeGreaterThanOrEqual(10)
        expect(clientCases.map(c => c.name)).toContain('a memo of 4001 characters')
    })

    it.each(clientCases.map(c => [c.name, c] as const))('%s', (_name, c) => {
        const issues = issuesOf(c)
        if (c.field === '') {
            expect(issues).toEqual([])
            return
        }
        expect(issues.map(issue => issue.field)).toEqual([c.field])
        if (c.message !== '') {
            expect(issues[0]?.message).toBe(c.message)
        }
    })
})

describe('writeOffSchema: the date rules', () => {
    const base = { invoiceDate: '2026-09-14', closeDate: '', hasOverride: false }
    const valid: WriteOffValues = { date: '2026-11-10', account: 'acct_expense001', memo: '' }

    it('refuses a date that is no day with "Enter a date"', () => {
        const result = writeOffSchema(base).safeParse({ ...valid, date: '2026-02-30' })
        expect(result.success).toBe(false)
        expect(result.error?.issues.map(i => i.message)).toEqual([WRITE_OFF_MESSAGES.dateInvalid])
        expect(WRITE_OFF_MESSAGES.dateInvalid).toBe('Enter a date')
    })

    it('refuses an empty date with "Enter a date"', () => {
        const result = writeOffSchema(base).safeParse({ ...valid, date: '' })
        expect(result.error?.issues.map(i => i.message)).toEqual(['Enter a date'])
    })

    it('refuses a day before the invoice date with the invoice date in words', () => {
        const result = writeOffSchema(base).safeParse({ ...valid, date: '2026-09-13' })
        expect(result.error?.issues.map(i => i.message)).toEqual([
            'Date the write-off on or after the invoice date, Sep 14, 2026.',
        ])
        expect(WRITE_OFF_MESSAGES.dateBeforeInvoice('Sep 14, 2026')).toBe(
            'Date the write-off on or after the invoice date, Sep 14, 2026.'
        )
    })

    it('refuses a day on the close date with the close-date text, and takes it with an override', () => {
        const closed = { ...base, closeDate: '2026-09-30' }
        const refused = writeOffSchema(closed).safeParse({ ...valid, date: '2026-09-30' })
        expect(refused.error?.issues).toEqual([
            expect.objectContaining({
                path: ['date'],
                message: closedThroughMessage('2026-09-30'),
            }),
        ])
        const taken = writeOffSchema({ ...closed, hasOverride: true }).safeParse({
            ...valid,
            date: '2026-09-30',
        })
        expect(taken.success).toBe(true)
    })

    it('refuses no account with "Choose an account"', () => {
        const result = writeOffSchema(base).safeParse({ ...valid, account: '' })
        expect(result.error?.issues).toEqual([
            expect.objectContaining({ path: ['account'], message: 'Choose an account' }),
        ])
        expect(WRITE_OFF_MESSAGES.accountRequired).toBe('Choose an account')
    })

    it('names the dialog texts the spec gives', () => {
        expect(WRITE_OFF_MESSAGES.noExpenseAccount).toBe(
            'Add an expense account to the chart of accounts'
        )
        expect(WRITE_OFF_MESSAGES.loadError).toBe(
            'Books could not load the accounts for the write-off.'
        )
    })
})

describe('writeOffDefaultDate', () => {
    it('is today when the invoice date is earlier', () => {
        expect(writeOffDefaultDate('2026-11-18', '2026-09-14')).toBe('2026-11-18')
    })

    it('is the invoice date when that is later than today', () => {
        expect(writeOffDefaultDate('2026-11-18', '2026-12-01')).toBe('2026-12-01')
    })

    it('is today when the invoice is dated today', () => {
        expect(writeOffDefaultDate('2026-11-18', '2026-11-18')).toBe('2026-11-18')
    })
})

describe('writeOffDefaultAccount', () => {
    const options = [
        { id: 'acct_office0001', detail_type: 'office_expenses' },
        { id: 'acct_baddebt001', detail_type: 'bad_debts' },
        { id: 'acct_baddebt002', detail_type: 'bad_debts' },
        { id: 'acct_interest01', detail_type: 'interest_paid' },
    ]

    it("gives the newest write-off's account when the options hold it", () => {
        expect(writeOffDefaultAccount(options, 'acct_interest01')).toBe('acct_interest01')
    })

    it('gives the first bad_debts option in chart order when there is no newest write-off', () => {
        expect(writeOffDefaultAccount(options, '')).toBe('acct_baddebt001')
    })

    it('gives the first bad_debts option when the newest account is no longer offered', () => {
        expect(writeOffDefaultAccount(options, 'acct_gone000001')).toBe('acct_baddebt001')
    })

    it("gives '' when there is no newest write-off and no bad_debts option", () => {
        const plain = options.filter(o => o.detail_type !== 'bad_debts')
        expect(writeOffDefaultAccount(plain, '')).toBe('')
    })

    it("gives '' when the newest account is no longer offered and no bad_debts option exists", () => {
        const plain = options.filter(o => o.detail_type !== 'bad_debts')
        expect(writeOffDefaultAccount(plain, 'acct_gone000001')).toBe('')
    })

    it("gives '' with no options", () => {
        expect(writeOffDefaultAccount([], 'acct_interest01')).toBe('')
    })
})

describe('writeOffDialogState', () => {
    const ready = {
        isLoading: false,
        hasLoadError: false,
        isInvoiceLoaded: true,
        isInvoiceOpen: true,
        optionCount: 3,
        writesAvailable: true,
        isHeld: false,
    }

    it('shows the skeleton and cannot submit while the invoice row has not landed', () => {
        // The other reads are ready; only the invoice is missing (spec §3.2: the figure is the
        // invoice's open balance, so no figure, title number or button amount before it).
        expect(
            writeOffDialogState({ ...ready, isInvoiceLoaded: false, isInvoiceOpen: false })
        ).toEqual({ body: 'loading', canSubmit: false, fieldsDisabled: true, noBalance: false })
    })

    it('shows the load error, not the skeleton, when a read failed before the invoice landed', () => {
        expect(
            writeOffDialogState({
                ...ready,
                hasLoadError: true,
                isInvoiceLoaded: false,
                isInvoiceOpen: false,
            })
        ).toMatchObject({ body: 'load-error', canSubmit: false })
    })

    it('shows the no-balance notice and cannot submit when the loaded invoice is no longer open', () => {
        // A payment took the balance to 0 while the dialog was open (spec §3.3).
        expect(writeOffDialogState({ ...ready, isInvoiceOpen: false })).toEqual({
            body: 'form',
            canSubmit: false,
            fieldsDisabled: false,
            noBalance: true,
        })
    })

    it('shows the no-balance notice and cannot submit even while online and not held', () => {
        const state = writeOffDialogState({
            ...ready,
            isInvoiceOpen: false,
            writesAvailable: true,
            isHeld: false,
        })
        expect(state.canSubmit).toBe(false)
        expect(state.noBalance).toBe(true)
    })

    it('shows no no-balance notice while the invoice is open', () => {
        expect(writeOffDialogState(ready).noBalance).toBe(false)
        expect(writeOffDialogState({ ...ready, writesAvailable: false }).noBalance).toBe(false)
    })

    it('shows the skeleton and cannot submit while a read loads', () => {
        expect(writeOffDialogState({ ...ready, isLoading: true })).toMatchObject({
            body: 'loading',
            canSubmit: false,
        })
    })

    it('shows the load error and cannot submit after a failed read', () => {
        expect(writeOffDialogState({ ...ready, hasLoadError: true })).toMatchObject({
            body: 'load-error',
            canSubmit: false,
        })
    })

    it('shows the load error, not the skeleton, while another read still loads', () => {
        expect(
            writeOffDialogState({ ...ready, isLoading: true, hasLoadError: true })
        ).toMatchObject({ body: 'load-error', canSubmit: false })
    })

    it('shows the no-account error and cannot submit when no expense account is offered', () => {
        expect(writeOffDialogState({ ...ready, optionCount: 0 })).toMatchObject({
            body: 'no-account',
            canSubmit: false,
        })
    })

    it('shows the form and can submit when ready with options', () => {
        expect(writeOffDialogState(ready)).toEqual({
            body: 'form',
            canSubmit: true,
            fieldsDisabled: false,
            noBalance: false,
        })
    })

    it('shows the form but cannot submit while offline', () => {
        expect(writeOffDialogState({ ...ready, writesAvailable: false })).toMatchObject({
            body: 'form',
            canSubmit: false,
        })
    })

    it('shows the form with its fields disabled and cannot submit while the write is held', () => {
        expect(writeOffDialogState({ ...ready, isHeld: true })).toEqual({
            body: 'form',
            canSubmit: false,
            fieldsDisabled: true,
            noBalance: false,
        })
    })
})

describe('writeOffRefusalErrors', () => {
    it('joins every root-mapped refusal into one root message', () => {
        expect(
            writeOffRefusalErrors({
                invoice: 'Invoice 1009 has no open balance.',
                amount: 'The open balance of invoice 1009 is now $300.00. Check it and write it off again.',
            })
        ).toEqual([
            {
                target: 'root',
                message:
                    'Invoice 1009 has no open balance. The open balance of invoice 1009 is now $300.00. Check it and write it off again.',
            },
        ])
    })

    it('keeps field refusals under their fields and gives one root entry after them', () => {
        expect(
            writeOffRefusalErrors({
                invoice: 'Invoice 1009 has no open balance.',
                date: 'Date the write-off on or after the invoice date, Sep 14, 2026.',
                number: 'The sequence is used up.',
                account: 'Choose an active expense account.',
            })
        ).toEqual([
            {
                target: 'date',
                message: 'Date the write-off on or after the invoice date, Sep 14, 2026.',
            },
            { target: 'account', message: 'Choose an active expense account.' },
            {
                target: 'root',
                message: 'Invoice 1009 has no open balance. The sequence is used up.',
            },
        ])
    })

    it('gives no root entry when every refusal is a field refusal', () => {
        expect(writeOffRefusalErrors({ memo: 'Too long.' })).toEqual([
            { target: 'memo', message: 'Too long.' },
        ])
    })

    it('gives one root entry for a single root refusal', () => {
        expect(writeOffRefusalErrors({ '': 'Something failed.' })).toEqual([
            { target: 'root', message: 'Something failed.' },
        ])
    })

    it('gives nothing for no refusal', () => {
        expect(writeOffRefusalErrors({})).toEqual([])
    })
})

describe('writeOffRefusalTarget', () => {
    it('puts a date, account or memo refusal under its field', () => {
        expect(writeOffRefusalTarget('date')).toBe('date')
        expect(writeOffRefusalTarget('account')).toBe('account')
        expect(writeOffRefusalTarget('memo')).toBe('memo')
    })

    it('puts every other refusal, and one with no key, in the root error', () => {
        expect(writeOffRefusalTarget('invoice')).toBe('root')
        expect(writeOffRefusalTarget('amount')).toBe('root')
        expect(writeOffRefusalTarget('number')).toBe('root')
        expect(writeOffRefusalTarget('')).toBe('root')
    })
})

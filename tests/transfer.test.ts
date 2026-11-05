import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_TYPES } from '../tinycld/books/lib/account-types'
import { parseLineRefusal } from '../tinycld/books/lib/entry-messages'
import { parseMoney } from '../tinycld/books/lib/money'
import {
    EMPTY_LINE_IDS,
    isTransferAccount,
    MAX_TRANSFER_AMOUNT,
    newTransferValues,
    TRANSFER_ACCOUNT_TYPES,
    TRANSFER_ERRORS,
    type TransferFormValues,
    transferAccountOptions,
    transferAmountText,
    transferBalanceLine,
    transferEntryValues,
    transferFromLines,
    transferLines,
    transferRefusalField,
    transferSchema,
} from '../tinycld/books/lib/transfer'
import {
    CLOSED_REFUSAL,
    FILLED_FORM,
    LINE_TYPE_REFUSAL,
    TRANSFER_ACCOUNT_IDS,
    TRANSFER_ACCOUNTS,
    TRANSFER_IDS,
    TRANSFER_LINES,
    TRANSFER_MESSAGES,
} from '../tinycld/books/lib/transfer-fixture'

const serverFile = (name: string) => readFileSync(join(__dirname, '..', 'server', name), 'utf8')

// The schema's issues grouped by field path, so a test names every message a field holds.
function issuesByField(values: TransferFormValues): Record<string, string[]> {
    const result = transferSchema('USD').safeParse(values)
    const grouped: Record<string, string[]> = {}
    if (result.success) return grouped
    for (const issue of result.error.issues) {
        const path = issue.path.map(String).join('.')
        grouped[path] = [...(grouped[path] ?? []), issue.message]
    }
    return grouped
}

const NOT_TRANSFER_TYPES = [
    'accounts_receivable',
    'accounts_payable',
    'income',
    'other_income',
    'cost_of_goods_sold',
    'expense',
    'other_expense',
]

describe('transfer account types', () => {
    it('match server/transfer_account_types.json exactly', () => {
        const server = JSON.parse(serverFile('transfer_account_types.json'))
        expect(TRANSFER_ACCOUNT_TYPES).toEqual(server)
    })

    it('are all account type keys', () => {
        const keys = new Set(ACCOUNT_TYPES.map(type => type.key))
        for (const type of TRANSFER_ACCOUNT_TYPES) expect(keys.has(type), type).toBe(true)
    })

    it('decide which accounts a transfer may use', () => {
        for (const type of TRANSFER_ACCOUNT_TYPES) {
            expect(isTransferAccount({ type }), type).toBe(true)
        }
        for (const type of NOT_TRANSFER_TYPES) {
            expect(isTransferAccount({ type }), type).toBe(false)
        }
    })
})

describe('transfer limits and server wording', () => {
    it('MAX_TRANSFER_AMOUNT equals maxAmount in server/posting.go', () => {
        const match = /const maxAmount = ([\d_]+)/.exec(serverFile('posting.go'))
        expect(match).not.toBeNull()
        expect(MAX_TRANSFER_AMOUNT).toBe(Number(match?.[1].replace(/_/g, '')))
    })

    it('every "Line" refusal in server/transfers.go parses to a line number', () => {
        const literals = [...serverFile('transfers.go').matchAll(/"(Line [^"]*)"/g)].map(
            match => match[1]
        )
        expect(literals.length).toBeGreaterThanOrEqual(4)
        for (const literal of literals) {
            expect(literal).toMatch(/^Line (\d+|%d)[:\s]/)
            const message = literal.replace('%d', '2')
            expect(parseLineRefusal(message).lineNumber, message).not.toBeNull()
        }
    })
})

describe('TRANSFER_ERRORS', () => {
    it('equals the fixture messages key by key', () => {
        expect(TRANSFER_ERRORS).toEqual(TRANSFER_MESSAGES)
    })
})

describe('transferSchema', () => {
    const blank: TransferFormValues = {
        from: '',
        to: '',
        amount: '',
        date: '2026-11-04',
        memo: '',
    }

    it('refuses a blank form on From, To and Amount, with no same-account issue', () => {
        expect(issuesByField(blank)).toEqual({
            from: [TRANSFER_MESSAGES.fromEmpty],
            to: [TRANSFER_MESSAGES.toEmpty],
            amount: [TRANSFER_MESSAGES.amountNotNumber],
        })
    })

    it('puts the same-account refusal on To only', () => {
        expect(issuesByField({ ...FILLED_FORM, to: FILLED_FORM.from })).toEqual({
            to: [TRANSFER_MESSAGES.sameAccount],
        })
    })

    it('refuses an amount that is not a number', () => {
        for (const amount of ['abc', '1,23']) {
            expect(issuesByField({ ...FILLED_FORM, amount }), amount).toEqual({
                amount: [TRANSFER_MESSAGES.amountNotNumber],
            })
        }
    })

    it('refuses zero and a negative amount', () => {
        for (const amount of ['0', '-5']) {
            expect(issuesByField({ ...FILLED_FORM, amount }), amount).toEqual({
                amount: [TRANSFER_MESSAGES.amountNotPositive],
            })
        }
    })

    it('refuses an amount over 10^15 cents and one too large to store', () => {
        for (const amount of ['20,000,000,000,000.00', '100,000,000,000,000.00']) {
            expect(issuesByField({ ...FILLED_FORM, amount }), amount).toEqual({
                amount: [TRANSFER_MESSAGES.amountTooLarge],
            })
        }
    })

    it('accepts exactly 10^15 cents and an amount with the currency symbol', () => {
        for (const amount of ['10,000,000,000,000.00', '$1,234.50']) {
            expect(issuesByField({ ...FILLED_FORM, amount }), amount).toEqual({})
        }
    })

    it('refuses a day that does not exist and a year before 1900', () => {
        for (const date of ['2026-11-31', '1899-12-31']) {
            expect(issuesByField({ ...FILLED_FORM, date }), date).toEqual({
                date: [TRANSFER_MESSAGES.dateInvalid],
            })
        }
    })

    it('counts the memo in code points, not UTF-16 units', () => {
        expect(issuesByField({ ...FILLED_FORM, memo: 'a'.repeat(4001) })).toEqual({
            memo: [TRANSFER_MESSAGES.memoTooLong],
        })
        expect(issuesByField({ ...FILLED_FORM, memo: '😀'.repeat(4000) })).toEqual({})
    })

    it('passes a complete form and returns it unchanged', () => {
        const result = transferSchema('USD').safeParse(FILLED_FORM)
        expect(result.success).toBe(true)
        expect(result.data).toEqual(FILLED_FORM)
    })
})

describe('transferAmountText', () => {
    it('shows a dash for blank, malformed or zero text', () => {
        for (const text of ['', 'abc', '0']) {
            expect(transferAmountText(text, 'USD'), text).toBe('—')
        }
    })

    it('formats a valid amount in the currency', () => {
        expect(transferAmountText('1234.5', 'USD')).toBe('$1,234.50')
    })

    it('shows Too large over the limit', () => {
        expect(transferAmountText('20,000,000,000,000.00', 'USD')).toBe('Too large')
    })
})

describe('newTransferValues', () => {
    it('starts blank on the given day', () => {
        expect(newTransferValues('2026-11-04')).toEqual({
            from: '',
            to: '',
            amount: '',
            date: '2026-11-04',
            memo: '',
        })
    })

    it('starts with the From account it is given', () => {
        expect(newTransferValues('2026-11-04', 'acct_x')).toEqual({
            from: 'acct_x',
            to: '',
            amount: '',
            date: '2026-11-04',
            memo: '',
        })
    })
})

describe('transferLines and transferEntryValues', () => {
    it('credits From on the first line and debits To on the second', () => {
        expect(transferLines(FILLED_FORM, { from: 'l0', to: 'l1' })).toEqual([
            {
                id: 'l0',
                account: FILLED_FORM.from,
                debit: '',
                credit: FILLED_FORM.amount,
                memo: '',
            },
            { id: 'l1', account: FILLED_FORM.to, debit: FILLED_FORM.amount, credit: '', memo: '' },
        ])
    })

    it('builds the entry values with the form date and memo and no auto-reverse', () => {
        expect(transferEntryValues(FILLED_FORM, EMPTY_LINE_IDS)).toEqual({
            date: FILLED_FORM.date,
            memo: FILLED_FORM.memo,
            autoReverseOn: '',
            lines: [
                {
                    id: '',
                    account: FILLED_FORM.from,
                    debit: '',
                    credit: FILLED_FORM.amount,
                    memo: '',
                },
                {
                    id: '',
                    account: FILLED_FORM.to,
                    debit: FILLED_FORM.amount,
                    credit: '',
                    memo: '',
                },
            ],
        })
    })
})

describe('transferFromLines', () => {
    it('reads From from the credit line and To from the debit line, not by position', () => {
        const [creditLine, debitLine] = TRANSFER_LINES[TRANSFER_IDS.posted]
        const reversed = [debitLine, creditLine]
        expect(transferFromLines(reversed, 'USD')).toEqual({
            from: TRANSFER_ACCOUNT_IDS.checking,
            to: TRANSFER_ACCOUNT_IDS.savings,
            amount: '$500.00',
            ids: { from: creditLine.id, to: debitLine.id },
        })
    })

    it('gives back the form accounts and amount from the lines transferLines builds', () => {
        const stored = transferLines(FILLED_FORM, { from: 'a', to: 'b' }).map(line => ({
            id: line.id,
            account: line.account,
            debit: parseMoney(line.debit, 'USD') ?? 0,
            credit: parseMoney(line.credit, 'USD') ?? 0,
        }))
        const back = transferFromLines(stored, 'USD')
        expect(back.from).toBe(FILLED_FORM.from)
        expect(back.to).toBe(FILLED_FORM.to)
        expect(back.ids).toEqual({ from: 'a', to: 'b' })
        expect(parseMoney(back.amount, 'USD')).toBe(parseMoney(FILLED_FORM.amount, 'USD'))
        expect(parseMoney(back.amount, 'USD')).toBe(150_000)
    })
})

describe('transferRefusalField', () => {
    it('puts a Line 2 refusal on To, without the line prefix', () => {
        expect(transferRefusalField(LINE_TYPE_REFUSAL)).toEqual({
            field: 'to',
            text: 'Old Petty Cash cannot be used in a transfer. Choose a bank, credit card, asset, liability or equity account.',
        })
    })

    it('puts a Line 1 refusal on From', () => {
        const message = 'Line 1: a transfer moves money out of this account, so it takes a credit.'
        expect(transferRefusalField(message).field).toBe('from')
    })

    it('keeps another line number for the summary, with the whole message', () => {
        expect(transferRefusalField('Line 3: x.')).toEqual({ field: null, text: 'Line 3: x.' })
    })

    it('keeps a refusal with no line for the summary, unchanged', () => {
        expect(transferRefusalField(CLOSED_REFUSAL)).toEqual({ field: null, text: CLOSED_REFUSAL })
    })
})

describe('transferAccountOptions', () => {
    it('offers only active accounts of the transfer types, in chart order', () => {
        const { options, triggerLabel } = transferAccountOptions(TRANSFER_ACCOUNTS, '')
        expect(options.map(option => option.label)).toEqual([
            '1000 Business Checking',
            '1010 Business Savings',
            '1500 Office Equipment',
            '2100 Company Card',
            "3000 Owner's Equity",
        ])
        expect(options.map(option => option.indent)).toEqual([0, 0, 0, 0, 0])
        expect(triggerLabel).toBe('')
    })

    it('names a stored inactive account in the trigger', () => {
        const { triggerLabel } = transferAccountOptions(
            TRANSFER_ACCOUNTS,
            TRANSFER_ACCOUNT_IDS.petty
        )
        expect(triggerLabel).toBe('6900 Old Petty Cash')
    })

    it('names a stored account of a type a transfer cannot use in the trigger', () => {
        const { triggerLabel } = transferAccountOptions(
            TRANSFER_ACCOUNTS,
            TRANSFER_ACCOUNT_IDS.receivable
        )
        expect(triggerLabel).toBe('1100 Accounts receivable')
    })
})

describe('transferBalanceLine', () => {
    it('shows a positive balance as normal', () => {
        expect(transferBalanceLine(120_100, 'USD')).toEqual({
            text: 'Balance $1,201.00',
            isNegative: false,
        })
    })

    it('marks a negative balance', () => {
        expect(transferBalanceLine(-21_540, 'USD')).toEqual({
            text: 'Balance -$215.40',
            isNegative: true,
        })
    })
})

import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import {
    EXPENSE_IDS,
    EXPENSE_LINES,
    EXPENSE_TODAY,
    EXPENSES,
} from '../tinycld/books/lib/expense-form-fixture'
import {
    copyExpenseValues,
    expenseCorrectionValues,
    expenseVendorFills,
    newExpenseValues,
} from '../tinycld/books/lib/expense-values'
import type { PurchaseLineRow } from '../tinycld/books/lib/purchase-line-columns'
import { purchaseAccountOptions } from '../tinycld/books/lib/purchase-pickers'
import { purchaseLinesWithNewIds } from '../tinycld/books/lib/purchase-values'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import { VENDOR_IDS, VENDORS } from '../tinycld/books/lib/vendor-form-fixture'

// An expense form's start values (spec §3.3, §3.4, §3.8): a new form's by the Purchase
// lines setting, what a vendor pick fills, a copy's and a correction's.

const idOf = (number: string) => `acc-${number}`

function seedParentId(key: string | undefined) {
    if (key === undefined) return ''
    const parent = SEED_ACCOUNTS.find(account => account.key === key)
    if (!parent) throw new Error(`no seed account ${key}`)
    return idOf(parent.number)
}

const ACCOUNTS = SEED_ACCOUNTS.map(account => ({
    id: idOf(account.number),
    name: account.name,
    number: account.number,
    type: account.type,
    parent: seedParentId(account.parent),
    inactive: account.inactive ?? false,
}))

// Whether the Account picker lists the vendor's default expense account (spec §3.3).
function isListed(accountId: string): boolean {
    return purchaseAccountOptions(ACCOUNTS, '').some(option => option.id === accountId)
}

function vendorOf(id: string) {
    const row = VENDORS.find(vendor => vendor.id === id)
    if (!row) throw new Error(`no vendor ${id}`)
    const { expense_account_number, ...rest } = row
    return {
        ...rest,
        expense_account: expense_account_number ? idOf(expense_account_number) : '',
        name_key: '',
        sort_key: '',
    }
}

const SUMMIT = vendorOf(VENDOR_IDS.summit)
const PACIFIC_POWER = vendorOf(VENDOR_IDS.pacificPower)

const BAND_KEYS = ['paid_from', 'payment_method', 'date', 'reference_no'] as const

const accountLines = (values: Record<string, unknown>) => values.account_lines as TableRow[]
const itemLines = (values: Record<string, unknown>) => values.item_lines as TableRow[]

// A fixture expense as the expense's read gives it: Paid from by account id.
function expenseOf(id: string) {
    const row = EXPENSES.find(expense => expense.id === id)
    if (!row) throw new Error(`no expense ${id}`)
    const { paid_from_number, ...rest } = row
    return { ...rest, paid_from: idOf(paid_from_number) }
}

// The fixture's lines as the expense's lines query reads them: the account by id.
function linesOf(expenseId: string): PurchaseLineRow[] {
    return EXPENSE_LINES.filter(line => line.expense === expenseId).map(line => ({
        id: line.id,
        kind: line.kind,
        account: line.account_number ? idOf(line.account_number) : '',
        product: line.product,
        description: line.description,
        quantity: line.quantity,
        rate: line.rate,
        amount: line.amount,
        position: line.position,
        po_line: '',
    }))
}

describe('newExpenseValues', () => {
    it('starts Accounts and products with an empty band, today, one empty account line and no product line', () => {
        const values = newExpenseValues({ today: EXPENSE_TODAY, purchaseLines: 'both' })
        expect(values.vendor).toBe('')
        expect(values.paid_from).toBe('')
        expect(values.payment_method).toBe('')
        expect(values.reference_no).toBe('')
        expect(values.date).toBe(EXPENSE_TODAY)
        expect(values.memo).toBe('')
        expect(accountLines(values)).toHaveLength(1)
        expect(accountLines(values)[0]).toMatchObject({ kind: 'account', account: '' })
        expect(itemLines(values)).toEqual([])
    })

    it('starts Products only with one empty product line and no account line', () => {
        const values = newExpenseValues({ today: EXPENSE_TODAY, purchaseLines: 'products' })
        expect(accountLines(values)).toEqual([])
        expect(itemLines(values)).toHaveLength(1)
        expect(itemLines(values)[0]).toMatchObject({ kind: 'item', product: '' })
    })

    it('puts the ?vendor vendor and its listed 6200 on the first account line, and nothing else', () => {
        const blank = newExpenseValues({ today: EXPENSE_TODAY, purchaseLines: 'both' })
        const values = newExpenseValues({
            today: EXPENSE_TODAY,
            purchaseLines: 'both',
            vendor: SUMMIT,
            accountIsListed: isListed(SUMMIT.expense_account),
        })
        expect(values.vendor).toBe(VENDOR_IDS.summit)
        expect(accountLines(values)).toHaveLength(1)
        expect(accountLines(values)[0]?.account).toBe(idOf('6200'))
        for (const key of [...BAND_KEYS, 'memo'] as const) {
            expect(values[key], key).toEqual(blank[key])
        }
        expect(itemLines(values)).toEqual([])
        expect(Object.keys(values).sort()).toEqual(Object.keys(blank).sort())
    })
})

describe('expenseVendorFills', () => {
    const blank = () => newExpenseValues({ today: EXPENSE_TODAY, purchaseLines: 'both' })

    it('fills the first account line with Summit IT Services’ listed 6200', () => {
        const fills = expenseVendorFills(SUMMIT, isListed(SUMMIT.expense_account), blank())
        expect((fills.account_lines as TableRow[] | undefined)?.[0]?.account).toBe(idOf('6200'))
    })

    it('returns no account_lines for Pacific Power, whose 6900 is inactive and not listed', () => {
        expect(isListed(PACIFIC_POWER.expense_account)).toBe(false)
        const fills = expenseVendorFills(PACIFIC_POWER, false, blank())
        expect(fills).not.toHaveProperty('account_lines')
    })

    it('returns no account_lines when the first line already has an account', () => {
        const values = blank()
        const current = {
            ...values,
            account_lines: [{ ...accountLines(values)[0], account: idOf('6100') }],
        }
        const fills = expenseVendorFills(SUMMIT, true, current)
        expect(fills).not.toHaveProperty('account_lines')
    })

    it('never returns a band key', () => {
        const values = blank()
        for (const [vendor, listed] of [
            [SUMMIT, true],
            [PACIFIC_POWER, false],
        ] as const) {
            const fills = expenseVendorFills(vendor, listed, values)
            for (const key of [...BAND_KEYS, 'mailing_address', 'terms', 'due_date']) {
                expect(fills, `${vendor.display_name} ${key}`).not.toHaveProperty(key)
            }
        }
    })
})

describe('copyExpenseValues', () => {
    const SOURCE = expenseOf(EXPENSE_IDS.officeSupply)
    const SOURCE_LINES = linesOf(EXPENSE_IDS.officeSupply)
    const CARD = idOf('2100')

    it('keeps vendor, Paid from 2100, Credit card and memo, dated today with an empty Ref no.', () => {
        const values = copyExpenseValues(SOURCE, SOURCE_LINES, EXPENSE_TODAY, new Set([CARD]))
        expect(values.vendor).toBe(VENDOR_IDS.officeSupply)
        expect(values.paid_from).toBe(CARD)
        expect(values.payment_method).toBe('credit_card')
        expect(values.memo).toBe('Design desk supplies and cables for the new conference room')
        expect(values.date).toBe(EXPENSE_TODAY)
        expect(values.reference_no).toBe('')
        expect(values.replaces ?? '').toBe('')
    })

    it("keeps both tables' lines in order, each with a new id", () => {
        const values = copyExpenseValues(SOURCE, SOURCE_LINES, EXPENSE_TODAY, new Set([CARD]))
        const accounts = accountLines(values)
        const items = itemLines(values)
        expect(accounts.map(row => row.description)).toEqual([
            'Drawing tablet nibs and a replacement stylus',
        ])
        expect(accounts.map(row => row.account)).toEqual([idOf('6210')])
        expect(items.map(row => row.product)).toEqual(
            SOURCE_LINES.filter(line => line.kind === 'item').map(line => line.product)
        )
        expect(items.map(row => row.quantity)).toEqual([15])
        const sourceIds = new Set(SOURCE_LINES.map(line => line.id))
        for (const row of [...accounts, ...items]) expect(sourceIds.has(row.id)).toBe(false)
    })

    it('clears Paid from, and keeps the payment method, when the account is no longer active', () => {
        const values = copyExpenseValues(
            SOURCE,
            SOURCE_LINES,
            EXPENSE_TODAY,
            new Set([idOf('1000'), idOf('1010')])
        )
        expect(values.paid_from).toBe('')
        expect(values.payment_method).toBe('credit_card')
    })
})

describe('expenseCorrectionValues', () => {
    const SOURCE = expenseOf(EXPENSE_IDS.pacificPower)
    const SOURCE_LINES = linesOf(EXPENSE_IDS.pacificPower)

    it('keeps every field of the original, its Ref no. included, and names it', () => {
        const values = expenseCorrectionValues(SOURCE, SOURCE_LINES)
        expect(values).toMatchObject({
            vendor: VENDOR_IDS.pacificPower,
            paid_from: idOf('1000'),
            payment_method: 'check',
            reference_no: '1042',
            date: '2026-10-05',
            memo: 'Autopay failed; paid by check at the counter.',
            replaces: EXPENSE_IDS.pacificPower,
        })
    })

    it('keeps every line in order with new ids', () => {
        const values = expenseCorrectionValues(SOURCE, SOURCE_LINES)
        const stored = purchaseLinesWithNewIds(SOURCE_LINES).account_lines
        expect(accountLines(values).map(({ id: _id, ...cells }) => cells)).toEqual(
            stored.map(({ id: _id, ...cells }) => cells)
        )
        expect(accountLines(values).map(row => row.description)).toEqual(
            SOURCE_LINES.map(line => line.description)
        )
        expect(itemLines(values)).toEqual([])
        const sourceIds = new Set(SOURCE_LINES.map(line => line.id))
        for (const row of accountLines(values)) expect(sourceIds.has(row.id)).toBe(false)
    })
})

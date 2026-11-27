import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import type { PurchaseLineRow } from '../tinycld/books/lib/purchase-line-columns'
import type { PurchaseLines } from '../tinycld/books/lib/purchase-lines'
import { purchaseAccountOptions } from '../tinycld/books/lib/purchase-pickers'
import { purchaseStartLines } from '../tinycld/books/lib/purchase-values'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import {
    VENDOR_CREDIT_IDS,
    VENDOR_CREDIT_LINES,
    VENDOR_CREDIT_TODAY,
    VENDOR_CREDITS,
} from '../tinycld/books/lib/vendor-credit-form-fixture'
import {
    copyVendorCreditValues,
    newVendorCreditValues,
    vendorCreditCorrectionValues,
    vendorCreditVendorFills,
} from '../tinycld/books/lib/vendor-credit-values'
import { VENDOR_IDS, VENDORS } from '../tinycld/books/lib/vendor-form-fixture'

// A vendor credit form's start values (vendor credit spec §3.3, §3.4, §3.7, §3.8): a new
// form's by the Purchase lines setting, what a vendor pick fills, a copy's and a
// correction's. No terms, no due date, no mailing address.

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

// Default expense account 6200, which the Account picker lists.
const SUMMIT = vendorOf(VENDOR_IDS.summit)
// Default expense account 6900, inactive, so the picker does not list it.
const PACIFIC_POWER = vendorOf(VENDOR_IDS.pacificPower)

const BAND_KEYS = ['vendor', 'date', 'ref_no'] as const
const BILL_ONLY_KEYS = ['terms', 'due_date', 'mailing_address'] as const

const accountLines = (values: Record<string, unknown>) => values.account_lines as TableRow[]
const itemLines = (values: Record<string, unknown>) => values.item_lines as TableRow[]
const withoutId = (rows: readonly TableRow[]) => rows.map(({ id: _id, ...cells }) => cells)

function creditOf(id: string) {
    const row = VENDOR_CREDITS.find(credit => credit.id === id)
    if (!row) throw new Error(`no vendor credit ${id}`)
    return row
}

// The fixture's lines as the credit's lines query reads them: the account by id.
function linesOf(creditId: string): PurchaseLineRow[] {
    return VENDOR_CREDIT_LINES.filter(line => line.vendor_credit === creditId).map(line => ({
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

describe('newVendorCreditValues', () => {
    const SETTINGS: PurchaseLines[] = ['both', 'accounts', 'products']

    it.each(SETTINGS)('starts %s with the start lines of purchaseStartLines', setting => {
        const values = newVendorCreditValues({ today: VENDOR_CREDIT_TODAY, purchaseLines: setting })
        const start = purchaseStartLines(setting)
        expect(withoutId(accountLines(values))).toEqual(withoutId(start.account_lines))
        expect(withoutId(itemLines(values))).toEqual(withoutId(start.item_lines))
    })

    it('starts dated today with no vendor, an empty ref_no and memo, and no bill-only field', () => {
        const values = newVendorCreditValues({ today: VENDOR_CREDIT_TODAY, purchaseLines: 'both' })
        expect(values.vendor).toBe('')
        expect(values.date).toBe(VENDOR_CREDIT_TODAY)
        expect(values.ref_no).toBe('')
        expect(values.memo).toBe('')
        for (const key of BILL_ONLY_KEYS) expect(values, key).not.toHaveProperty(key)
    })

    it('puts the ?vendor vendor and its listed 6200 on the first account line, and nothing else', () => {
        const blank = newVendorCreditValues({ today: VENDOR_CREDIT_TODAY, purchaseLines: 'both' })
        const values = newVendorCreditValues({
            today: VENDOR_CREDIT_TODAY,
            purchaseLines: 'both',
            vendor: SUMMIT,
            accountIsListed: isListed(SUMMIT.expense_account),
        })
        expect(values.vendor).toBe(VENDOR_IDS.summit)
        expect(accountLines(values)).toHaveLength(1)
        expect(accountLines(values)[0]?.account).toBe(idOf('6200'))
        expect(values.date).toBe(blank.date)
        expect(values.ref_no).toBe('')
        expect(itemLines(values)).toEqual([])
        expect(Object.keys(values).sort()).toEqual(Object.keys(blank).sort())
    })

    it('leaves the first account line empty for a ?vendor whose account is not listed', () => {
        expect(isListed(PACIFIC_POWER.expense_account)).toBe(false)
        const values = newVendorCreditValues({
            today: VENDOR_CREDIT_TODAY,
            purchaseLines: 'both',
            vendor: PACIFIC_POWER,
            accountIsListed: false,
        })
        expect(values.vendor).toBe(VENDOR_IDS.pacificPower)
        expect(accountLines(values)[0]?.account).toBe('')
    })
})

describe('vendorCreditVendorFills', () => {
    const blank = () => newVendorCreditValues({ today: VENDOR_CREDIT_TODAY, purchaseLines: 'both' })

    it('returns only account_lines, with the listed 6200 on the empty first line', () => {
        const values = blank()
        const fills = vendorCreditVendorFills(SUMMIT, isListed(SUMMIT.expense_account), values)
        expect(Object.keys(fills ?? {})).toEqual(['account_lines'])
        const filled = fills?.account_lines as TableRow[] | undefined
        expect(filled?.[0]?.account).toBe(idOf('6200'))
        expect(filled?.[0]?.id).toBe(accountLines(values)[0]?.id)
    })

    it('fills no account line when the vendor account is not listed', () => {
        const fills = vendorCreditVendorFills(PACIFIC_POWER, false, blank())
        expect(fills?.account_lines ?? null).toBeNull()
        for (const key of [...BAND_KEYS, ...BILL_ONLY_KEYS]) {
            expect(fills ?? {}, key).not.toHaveProperty(key)
        }
    })

    it('fills no account line when the first line already has an account', () => {
        const values = blank()
        const current = {
            ...values,
            account_lines: [{ ...accountLines(values)[0], account: idOf('6100') }],
        }
        const fills = vendorCreditVendorFills(SUMMIT, true, current)
        expect(fills?.account_lines ?? null).toBeNull()
    })
})

describe('copyVendorCreditValues', () => {
    // Posted 1002: two account lines and one product line.
    const SOURCE = creditOf(VENDOR_CREDIT_IDS.partly)
    const SOURCE_LINES = linesOf(VENDOR_CREDIT_IDS.partly)
    const copy = () => copyVendorCreditValues(SOURCE, SOURCE_LINES, VENDOR_CREDIT_TODAY)

    it('keeps the vendor and memo, dated today, with an empty ref_no, replacing nothing', () => {
        const values = copy()
        expect(values.vendor).toBe(VENDOR_IDS.ironclad)
        expect(values.memo).toBe('Return authorised by Dana, RMA 5521')
        expect(values.date).toBe(VENDOR_CREDIT_TODAY)
        expect(SOURCE.date).not.toBe(VENDOR_CREDIT_TODAY)
        expect(values.ref_no).toBe('')
        expect(values.replaces ?? '').toBe('')
    })

    it("keeps both tables' lines in order, each with a new id", () => {
        const values = copy()
        const accounts = accountLines(values)
        const items = itemLines(values)
        expect(accounts.map(row => row.description)).toEqual([
            'Overcharge on the October rental plan',
            'Restocking fee the vendor kept',
        ])
        expect(accounts.map(row => row.account)).toEqual([idOf('6200'), idOf('6200')])
        expect(items.map(row => row.product)).toEqual(
            SOURCE_LINES.filter(line => line.kind === 'item').map(line => line.product)
        )
        expect(items.map(row => row.quantity)).toEqual([2])
        const sourceIds = new Set(SOURCE_LINES.map(line => line.id))
        for (const row of [...accounts, ...items]) expect(sourceIds.has(row.id)).toBe(false)
    })
})

describe('vendorCreditCorrectionValues', () => {
    const SOURCE = creditOf(VENDOR_CREDIT_IDS.unapplied)
    const SOURCE_LINES = linesOf(VENDOR_CREDIT_IDS.unapplied)

    it('keeps the vendor, credit date, ref_no and memo of the original, and names it', () => {
        const values = vendorCreditCorrectionValues(SOURCE, SOURCE_LINES)
        expect(values).toMatchObject({
            vendor: VENDOR_IDS.pacificPower,
            date: '2026-11-12',
            ref_no: 'CM-8841',
            memo: 'Meter 4471 was read twice in October',
            replaces: VENDOR_CREDIT_IDS.unapplied,
        })
    })

    it('keeps every line in order with new ids', () => {
        const values = vendorCreditCorrectionValues(SOURCE, SOURCE_LINES)
        expect(accountLines(values).map(row => [row.account, row.description])).toEqual([
            [idOf('6100'), 'Electricity, meter 4471: the October reading was billed twice'],
        ])
        expect(itemLines(values)).toEqual([])
        const sourceIds = new Set(SOURCE_LINES.map(line => line.id))
        for (const row of accountLines(values)) expect(sourceIds.has(row.id)).toBe(false)
    })
})

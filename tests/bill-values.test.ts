import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import {
    BILL_IDS,
    BILL_LINES,
    BILL_TODAY,
    BILLS,
    type BillLineFixtureRecord,
} from '../tinycld/books/lib/bill-form-fixture'
import { billAccountOptions } from '../tinycld/books/lib/bill-pickers'
import {
    billCorrectionValues,
    copyBillValues,
    newBillValues,
    vendorBillFills,
} from '../tinycld/books/lib/bill-values'
import { lineTableSubtotals } from '../tinycld/books/lib/document-values'
import type { PurchaseLineRow } from '../tinycld/books/lib/purchase-line-columns'
import { BILL_KIND } from '../tinycld/books/lib/sales-document-kinds'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import { VENDOR_IDS, VENDORS } from '../tinycld/books/lib/vendor-form-fixture'

// A bill form's start values (spec §3.3, §3.4, §3.6): a new form's by the Bill lines
// setting, what a vendor pick fills, a copy's and a correction's.

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
    return billAccountOptions(ACCOUNTS, '').some(option => option.id === accountId)
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

const OFFICE_SUPPLY = vendorOf(VENDOR_IDS.officeSupply)
const SUMMIT = vendorOf(VENDOR_IDS.summit)
const PACIFIC_POWER = vendorOf(VENDOR_IDS.pacificPower)
// No terms; default expense account 6210.
const OKAFOR = vendorOf(VENDOR_IDS.okafor)

const fillsOf = (vendor: ReturnType<typeof vendorOf>, values: Record<string, unknown>) =>
    vendorBillFills(vendor, isListed(vendor.expense_account), {
        date: values.date as string,
        account_lines: values.account_lines as TableRow[],
    })

const accountLines = (values: Record<string, unknown>) => values.account_lines as TableRow[]
const itemLines = (values: Record<string, unknown>) => values.item_lines as TableRow[]

describe('newBillValues', () => {
    it('starts Accounts and products with one empty account line and no product line', () => {
        const values = newBillValues({ today: BILL_TODAY, purchaseLines: 'both' })
        expect(accountLines(values)).toHaveLength(1)
        expect(accountLines(values)[0]).toMatchObject({ kind: 'account', account: '' })
        expect(itemLines(values)).toEqual([])
        expect(values.vendor).toBe('')
        expect(values.date).toBe(BILL_TODAY)
    })

    it('starts Accounts only with one empty account line', () => {
        const values = newBillValues({ today: BILL_TODAY, purchaseLines: 'accounts' })
        expect(accountLines(values)).toHaveLength(1)
        expect(accountLines(values)[0]).toMatchObject({ kind: 'account', account: '' })
        expect(itemLines(values)).toEqual([])
    })

    it('starts Products only with one empty product line', () => {
        const values = newBillValues({ today: BILL_TODAY, purchaseLines: 'products' })
        expect(accountLines(values)).toEqual([])
        expect(itemLines(values)).toHaveLength(1)
        expect(itemLines(values)[0]).toMatchObject({ kind: 'item', product: '' })
    })

    it('fills the header from the ?vendor vendor as a pick does', () => {
        const values = newBillValues({
            today: BILL_TODAY,
            purchaseLines: 'both',
            vendor: OFFICE_SUPPLY,
            accountIsListed: isListed(OFFICE_SUPPLY.expense_account),
        })
        expect(values.vendor).toBe(VENDOR_IDS.officeSupply)
        expect(values.mailing_address).toMatchObject({
            line1: '4120 Commerce Boulevard',
            city: 'Los Angeles',
            region: 'CA',
            postal_code: '90040',
        })
        expect(values.terms).toBe('net_15')
        expect(values.due_date).toBe('2026-11-28')
        expect(accountLines(values)[0]?.account).toBe(idOf('6210'))
    })
})

describe('vendorBillFills', () => {
    const blank = () => newBillValues({ today: BILL_TODAY, purchaseLines: 'both' })

    it('fills Office Supply World: its address, Net 15, the due date and 6210 on the first line', () => {
        const values = blank()
        const next = { ...values, ...fillsOf(OFFICE_SUPPLY, values) }
        expect(next.mailing_address).toMatchObject({
            line1: '4120 Commerce Boulevard',
            city: 'Los Angeles',
            region: 'CA',
            postal_code: '90040',
        })
        expect(next.terms).toBe('net_15')
        expect(next.due_date).toBe('2026-11-28')
        expect(accountLines(next)[0]?.account).toBe(idOf('6210'))
    })

    it('fills Summit IT Services: Net 30, the due date 30 days on and 6200', () => {
        const values = blank()
        const next = { ...values, ...fillsOf(SUMMIT, values) }
        expect(next.terms).toBe('net_30')
        expect(next.due_date).toBe('2026-12-13')
        expect(accountLines(next)[0]?.account).toBe(idOf('6200'))
    })

    it('leaves the first line empty for Pacific Power, whose 6900 the picker does not list', () => {
        expect(isListed(PACIFIC_POWER.expense_account)).toBe(false)
        const values = blank()
        const next = { ...values, ...fillsOf(PACIFIC_POWER, values) }
        expect(next.terms).toBe('due_on_receipt')
        expect(accountLines(next)[0]?.account).toBe('')
    })

    it('on a second pick changes only the address, terms and due date', () => {
        const values = blank()
        const first = { ...values, ...fillsOf(OFFICE_SUPPLY, values) }
        const second = { ...first, ...fillsOf(SUMMIT, first) }
        expect(second.terms).toBe('net_30')
        expect(second.due_date).toBe('2026-12-13')
        expect(second.mailing_address ?? null).toEqual(SUMMIT.address ?? null)
        expect(accountLines(second)).toEqual(accountLines(first))
        expect(accountLines(second)[0]?.account).toBe(idOf('6210'))
    })

    it('gives a vendor with no terms a due date equal to the bill date', () => {
        const values = { ...blank(), date: '2026-11-20', due_date: '2026-11-25' }
        const next = { ...values, ...fillsOf(OKAFOR, values) }
        expect(next.terms).toBe('')
        expect(next.due_date).toBe('2026-11-20')
    })
})

function billOf(id: string) {
    const bill = BILLS.find(row => row.id === id)
    if (!bill) throw new Error(`no bill ${id}`)
    return bill
}

// The fixture's lines as the bill's lines query reads them: the account by id.
function linesOf(billId: string): PurchaseLineRow[] {
    return BILL_LINES.filter((line: BillLineFixtureRecord) => line.bill === billId).map(line => ({
        id: line.id,
        kind: line.kind,
        account: line.account_number ? idOf(line.account_number) : '',
        product: line.product,
        description: line.description,
        quantity: line.quantity,
        rate: line.rate,
        amount: line.amount,
        position: line.position,
    }))
}

const POSTED = billOf(BILL_IDS.posted)
const POSTED_LINES = linesOf(BILL_IDS.posted)

describe('copyBillValues', () => {
    const copy = () => copyBillValues(POSTED, POSTED_LINES, BILL_TODAY, OFFICE_SUPPLY)

    it('keeps the vendor, mailing address, terms and memo, dated today and due by its terms', () => {
        const values = copy()
        expect(values.vendor).toBe(VENDOR_IDS.officeSupply)
        expect(values.mailing_address).toEqual(POSTED.mailing_address)
        expect(values.terms).toBe('net_15')
        expect(values.memo).toBe('Q4 supplies and the back-office access points')
        expect(values.date).toBe(BILL_TODAY)
        expect(values.due_date).toBe('2026-11-28')
    })

    it("has an empty vendor's bill no. and replaces nothing", () => {
        const values = copy()
        expect(values.ref_no).toBe('')
        expect(values.replaces ?? '').toBe('')
    })

    it("keeps both tables' lines in order, each with a new id", () => {
        const values = copy()
        const accounts = accountLines(values)
        const items = itemLines(values)
        expect(accounts.map(row => row.description)).toEqual([
            'Toner, paper and desk supplies for the quarter',
            'Credit for two damaged toner cartridges, returned',
        ])
        expect(accounts.map(row => row.account)).toEqual([idOf('6210'), idOf('6210')])
        expect(items.map(row => row.product)).toEqual(
            POSTED_LINES.filter(line => line.kind === 'item').map(line => line.product)
        )
        expect(items.map(row => row.quantity)).toEqual([3, 12, 1])
        const sourceIds = new Set(POSTED_LINES.map(line => line.id))
        for (const row of [...accounts, ...items]) expect(sourceIds.has(row.id)).toBe(false)
        expect(lineTableSubtotals(values, BILL_KIND.lineTables)).toEqual([
            { subtotal: BILL_KIND.lineTables[0]?.subtotal, cents: 14_855 },
            { subtotal: BILL_KIND.lineTables[1]?.subtotal, cents: 76_140 },
        ])
    })
})

describe('billCorrectionValues', () => {
    it('keeps every field of the original, its bill no. included, and names it', () => {
        const values = billCorrectionValues(POSTED, POSTED_LINES)
        expect(values).toMatchObject({
            vendor: VENDOR_IDS.officeSupply,
            terms: 'net_15',
            date: '2026-10-16',
            due_date: '2026-10-31',
            ref_no: 'OSW-INV-558213',
            memo: 'Q4 supplies and the back-office access points',
            replaces: BILL_IDS.posted,
        })
        expect(values.mailing_address).toEqual(POSTED.mailing_address)
    })

    it('keeps every line of both tables in order with new ids', () => {
        const values = billCorrectionValues(POSTED, POSTED_LINES)
        expect(accountLines(values)).toHaveLength(2)
        expect(itemLines(values).map(row => row.product)).toEqual(
            POSTED_LINES.filter(line => line.kind === 'item').map(line => line.product)
        )
        const sourceIds = new Set(POSTED_LINES.map(line => line.id))
        for (const row of [...accountLines(values), ...itemLines(values)]) {
            expect(sourceIds.has(row.id)).toBe(false)
        }
        expect(lineTableSubtotals(values, BILL_KIND.lineTables)).toEqual([
            { subtotal: BILL_KIND.lineTables[0]?.subtotal, cents: 14_855 },
            { subtotal: BILL_KIND.lineTables[1]?.subtotal, cents: 76_140 },
        ])
    })
})

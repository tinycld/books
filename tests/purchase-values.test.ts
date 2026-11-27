import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import {
    EXPENSE_IDS,
    EXPENSE_LINES,
    type ExpenseLineFixtureRecord,
} from '../tinycld/books/lib/expense-form-fixture'
import { PRODUCT_IDS } from '../tinycld/books/lib/products-services-fixture'
import type { PurchaseLineRow } from '../tinycld/books/lib/purchase-line-columns'
import {
    emptyAccountLine,
    emptyPurchaseItemLine,
    purchaseLinesWithNewIds,
    purchaseStartLines,
    vendorAccountFill,
} from '../tinycld/books/lib/purchase-values'

// The start values a purchase kind (the bill, the expense) shares (spec §3.1, §3.3, §3.4):
// the starting lines by the Purchase lines setting, the vendor pick's first-account-line
// fill, and a stored document's lines as new rows of its two tables.

const ACCOUNT_CELLS = { kind: 'account', account: '', description: '', amount: '' }
const ITEM_CELLS = {
    kind: 'item',
    product: '',
    description: '',
    quantity: 1,
    rate: '',
    amount: null,
}

function expectNewId(row: TableRow | undefined) {
    expect(typeof row?.id).toBe('string')
    expect(row?.id).toHaveLength(15)
}

describe('emptyAccountLine and emptyPurchaseItemLine', () => {
    it("give a new 15-character id and the account kind's cells", () => {
        const row = emptyAccountLine()
        expectNewId(row)
        expect(row).toEqual({ id: row.id, ...ACCOUNT_CELLS })
        expect(emptyAccountLine().id).not.toBe(row.id)
    })

    it("give a new 15-character id and the product kind's cells", () => {
        const row = emptyPurchaseItemLine()
        expectNewId(row)
        expect(row).toEqual({ id: row.id, ...ITEM_CELLS })
        expect(emptyPurchaseItemLine().id).not.toBe(row.id)
    })
})

describe('purchaseStartLines', () => {
    it('starts Accounts and products with one empty account line and no product line', () => {
        const { account_lines, item_lines } = purchaseStartLines('both')
        expect(account_lines).toHaveLength(1)
        expectNewId(account_lines[0])
        expect(account_lines[0]).toEqual({ id: account_lines[0]?.id, ...ACCOUNT_CELLS })
        expect(item_lines).toEqual([])
    })

    it('starts Accounts only with one empty account line', () => {
        const { account_lines, item_lines } = purchaseStartLines('accounts')
        expect(account_lines).toHaveLength(1)
        expectNewId(account_lines[0])
        expect(account_lines[0]).toEqual({ id: account_lines[0]?.id, ...ACCOUNT_CELLS })
        expect(item_lines).toEqual([])
    })

    it('starts Products only with one empty product line and no account line', () => {
        const { account_lines, item_lines } = purchaseStartLines('products')
        expect(account_lines).toEqual([])
        expect(item_lines).toHaveLength(1)
        expectNewId(item_lines[0])
        expect(item_lines[0]).toEqual({ id: item_lines[0]?.id, ...ITEM_CELLS })
    })
})

describe('vendorAccountFill', () => {
    const emptyLine: TableRow = { id: 'line00000000001', ...ACCOUNT_CELLS }

    it("puts the vendor's listed expense account on an empty first line, keeping its id", () => {
        const filled = vendorAccountFill({ expense_account: 'a6200' }, true, [emptyLine])
        expect(filled).toEqual([{ ...emptyLine, account: 'a6200' }])
        expect(filled?.[0]?.id).toBe('line00000000001')
    })

    it('keeps the lines after the first as they are', () => {
        const second: TableRow = {
            id: 'line00000000002',
            ...ACCOUNT_CELLS,
            account: 'a6100',
            amount: '12.00',
        }
        const filled = vendorAccountFill({ expense_account: 'a6200' }, true, [emptyLine, second])
        expect(filled).toEqual([{ ...emptyLine, account: 'a6200' }, second])
    })

    it('changes nothing when the Account picker does not list the account', () => {
        expect(vendorAccountFill({ expense_account: 'a6900' }, false, [emptyLine])).toBeNull()
    })

    it('changes nothing for a vendor with no default expense account', () => {
        expect(vendorAccountFill({ expense_account: '' }, true, [emptyLine])).toBeNull()
    })

    it('changes nothing when the first line already has an account', () => {
        const picked: TableRow = { ...emptyLine, account: 'a6210' }
        expect(vendorAccountFill({ expense_account: 'a6200' }, true, [picked])).toBeNull()
    })

    it('changes nothing with no account line', () => {
        expect(vendorAccountFill({ expense_account: 'a6200' }, true, [])).toBeNull()
    })
})

const idOf = (number: string) => `acc-${number}`

// The fixture's lines as a lines query reads them: the account by id.
function linesOf(expenseId: string): PurchaseLineRow[] {
    return EXPENSE_LINES.filter((line: ExpenseLineFixtureRecord) => line.expense === expenseId).map(
        line => ({
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
        })
    )
}

describe('purchaseLinesWithNewIds', () => {
    // Expense 1003: account line 6210 for $64.18, product line 15 x $3.10.
    const LINES = linesOf(EXPENSE_IDS.officeSupply)

    it('gives one account row and one product row, in position order, with the same cells', () => {
        const { account_lines, item_lines } = purchaseLinesWithNewIds([...LINES].reverse())
        expect(account_lines).toEqual([
            {
                id: account_lines[0]?.id,
                kind: 'account',
                account: idOf('6210'),
                description: 'Drawing tablet nibs and a replacement stylus',
                amount: '64.18',
            },
        ])
        expect(item_lines).toEqual([
            {
                id: item_lines[0]?.id,
                kind: 'item',
                product: PRODUCT_IDS.patchCable,
                description: 'Cat6 patch cable, 10 ft',
                quantity: 15,
                rate: '3.10',
                amount: 4_650,
            },
        ])
    })

    it('gives each row a new 15-character id, never a source id', () => {
        const { account_lines, item_lines } = purchaseLinesWithNewIds(LINES)
        const sourceIds = new Set(LINES.map(line => line.id))
        for (const row of [...account_lines, ...item_lines]) {
            expectNewId(row)
            expect(sourceIds.has(row.id as string)).toBe(false)
        }
    })

    it('keeps several rows of one table in position order', () => {
        const pacific = linesOf(EXPENSE_IDS.pacificPower)
        const { account_lines, item_lines } = purchaseLinesWithNewIds([...pacific].reverse())
        expect(account_lines.map(row => row.amount)).toEqual(['148.37', '-10.00'])
        expect(item_lines).toEqual([])
    })
})

import { describe, expect, expectTypeOf, it } from 'vitest'
import { EXPENSE_REF_HINT as HOST_REF_HINT } from '../tinycld/books/lib/document-texts'
import {
    EXPENSE_LINES,
    EXPENSE_REF_HINT,
    EXPENSE_SEED_IDS,
    EXPENSES,
    type ExpenseFixtureRecord,
    type ExpenseLineFixtureRecord,
    type ExpenseLineRecord,
    type ExpenseRecord,
} from '../tinycld/books/lib/expense-form-fixture'
import { PRODUCTS } from '../tinycld/books/lib/products-services-fixture'
import { PURCHASE_ACCOUNT_TYPES } from '../tinycld/books/lib/purchase-line-columns'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import type { BooksExpenseLines, BooksExpenses } from '../tinycld/books/types'

function linesOf(expenseId: string) {
    return EXPENSE_LINES.filter(line => line.expense === expenseId)
}

const accountByNumber = new Map(SEED_ACCOUNTS.map(account => [account.number, account]))

describe('generated expense types', () => {
    it('the fixture types are the generated types', () => {
        // tsc fails here until the migration and the generated types exist.
        expectTypeOf<ExpenseRecord>().toEqualTypeOf<BooksExpenses>()
        expectTypeOf<ExpenseLineRecord>().toEqualTypeOf<BooksExpenseLines>()
        expectTypeOf<ExpenseFixtureRecord>().toEqualTypeOf<
            Omit<BooksExpenses, 'paid_from'> & { paid_from_number: string }
        >()
        expectTypeOf<ExpenseLineFixtureRecord>().toEqualTypeOf<
            Omit<BooksExpenseLines, 'account'> & { account_number: string }
        >()
    })

    // The host reads the hint from lib/document-texts; the fixture re-exports it, so the
    // reference and the form show one text.
    it('re-exports the Ref no. hint the host uses', () => {
        expect(HOST_REF_HINT).toBe('Check number or card reference')
        expect(EXPENSE_REF_HINT).toBe(HOST_REF_HINT)
    })
})

describe('EXPENSES', () => {
    it('gives every expense a total equal to the sum of its lines, with no tax', () => {
        for (const row of EXPENSES) {
            const sum = linesOf(row.id).reduce((total, line) => total + line.amount, 0)
            expect({ subtotal: row.subtotal, total: row.total }, row.id).toEqual({
                subtotal: sum,
                total: sum,
            })
        }
    })

    it('every id is 15 characters', () => {
        const ids = [...EXPENSES.map(row => row.id), ...EXPENSE_LINES.map(row => row.id)]
        expect(ids.filter(id => id.length !== 15)).toEqual([])
    })

    it('dates every expense the seed posts after 2026-06-30', () => {
        const posted = EXPENSE_SEED_IDS.map(id => EXPENSES.find(row => row.id === id)).filter(
            row => row !== undefined && row.status !== 'draft'
        )
        expect(posted.length).toBe(3)
        expect(posted.filter(row => !(row && row.date > '2026-06-30')).map(row => row?.id)).toEqual(
            []
        )
    })

    it('pays every expense from a seed account of type bank or credit card', () => {
        const wrong = EXPENSES.filter(row => {
            const type = accountByNumber.get(row.paid_from_number)?.type
            return type !== 'bank' && type !== 'credit_card'
        }).map(row => `${row.id} ${row.paid_from_number}`)
        expect(wrong).toEqual([])
    })

    it('puts every account line on a seed account the Account picker lists', () => {
        const wrong = EXPENSE_LINES.filter(line => line.kind === 'account')
            .filter(
                line =>
                    !PURCHASE_ACCOUNT_TYPES.has(
                        accountByNumber.get(line.account_number)?.type ?? ''
                    )
            )
            .map(line => `${line.id} ${line.account_number}`)
        expect(wrong).toEqual([])
    })

    it('names on every product line a product with purchasing on', () => {
        const purchased = new Set(PRODUCTS.filter(row => row.purchases).map(row => row.id))
        const wrong = EXPENSE_LINES.filter(line => line.kind === 'item')
            .filter(line => !purchased.has(line.product))
            .map(line => line.id)
        expect(wrong).toEqual([])
    })

    it('holds each case of spec §4', () => {
        const cashDraft = EXPENSES.find(
            row =>
                row.status === 'draft' &&
                row.vendor === '' &&
                row.payment_method === 'cash' &&
                row.paid_from_number === '1000' &&
                linesOf(row.id).some(
                    line => line.kind === 'account' && line.account_number === '6100'
                )
        )
        expect(cashDraft, 'a draft with no vendor on 6100 paid in cash from 1000').toBeDefined()

        const check1042 = EXPENSES.find(row => {
            const lines = linesOf(row.id)
            return (
                row.status === 'posted' &&
                row.payment_method === 'check' &&
                row.reference_no === '1042' &&
                row.paid_from_number === '1000' &&
                lines.length === 2 &&
                lines.every(line => line.kind === 'account') &&
                lines.some(line => line.amount < 0)
            )
        })
        expect(
            check1042,
            'a posted Check 1042 from 1000 with two account lines, one negative'
        ).toBeDefined()

        const card = EXPENSES.find(row => {
            const lines = linesOf(row.id)
            return (
                row.status === 'posted' &&
                row.payment_method === 'credit_card' &&
                row.paid_from_number === '2100' &&
                lines.some(line => line.kind === 'account') &&
                lines.some(line => line.kind === 'item')
            )
        })
        expect(
            card,
            'a posted Credit card expense from 2100 with an account and a product line'
        ).toBeDefined()

        expect(
            EXPENSES.some(row => row.status === 'void'),
            'a void expense'
        ).toBe(true)
    })
})

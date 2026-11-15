import { describe, expect, it } from 'vitest'
import type { DepositAccountRow } from '../tinycld/books/lib/deposit-accounts'
import { centsToText } from '../tinycld/books/lib/money-text'
import type { OutstandingRow } from '../tinycld/books/lib/payment-allocation'
import { paymentDefaultDeposit } from '../tinycld/books/lib/payment-deposit'
import {
    draftPaymentValues,
    newPaymentValues,
    paymentWriteRows,
} from '../tinycld/books/lib/payment-values'
import {
    applicationsOf,
    DEPOSIT_ACCOUNTS,
    DEPOSIT_ACCOUNTS_NO_UNDEPOSITED,
    PAYMENT_IDS,
    PAYMENT_INVOICE_IDS,
    PAYMENT_INVOICES,
    PAYMENT_TODAY,
    PAYMENTS,
} from '../tinycld/books/lib/receive-payment-fixture'

// The form's start values (new, draft) and the application rows a save writes
// (spec §3.4, §3.6; plan decisions on `amountTyped` and the write order).

const ROW: OutstandingRow = {
    id: PAYMENT_INVOICE_IDS.partly,
    number: '1009',
    date: '2026-10-20',
    due_date: '2026-11-19',
    total: 125_000,
    open: 75_000,
}

function active(rows: readonly Omit<DepositAccountRow, 'parent' | 'inactive'>[]) {
    return rows.map(row => ({ ...row, parent: '', inactive: false }))
}

const DRAFT = PAYMENTS.find(row => row.id === PAYMENT_IDS.draft)
if (!DRAFT) throw new Error('no draft payment in the fixture')

// The draft's applications as the form reads them: each with its invoice's number and
// open balance (a draft changes no balance, so open is the invoice's balance).
const DRAFT_APPLICATIONS = applicationsOf(PAYMENT_IDS.draft).map(application => {
    const invoice = PAYMENT_INVOICES.find(row => row.id === application.invoice)
    if (!invoice) throw new Error(`no invoice ${application.invoice}`)
    return {
        invoice: application.invoice,
        amount: application.amount,
        open: invoice.balance,
        number: invoice.number,
    }
})

describe('newPaymentValues', () => {
    it('ticks a given invoice for its open balance, the amount following it', () => {
        const values = newPaymentValues({
            today: PAYMENT_TODAY,
            customer: 'cust_harbor_001',
            invoice: ROW,
            depositTo: 'acctfixundep001',
        })
        expect(values.payments).toEqual({
            [ROW.id]: { amount: '750.00', open: 75_000, number: '1009' },
        })
        expect(values.amountTyped).toBe(false)
        expect(values.amount).toBe('750.00')
        expect(values).toMatchObject({
            customer: 'cust_harbor_001',
            date: PAYMENT_TODAY,
            payment_method: '',
            reference_no: '',
            memo: '',
        })
    })

    it('starts with no payments and no amount without a customer', () => {
        const values = newPaymentValues({
            today: PAYMENT_TODAY,
            customer: '',
            invoice: null,
            depositTo: 'acctfixundep001',
        })
        expect(values.customer).toBe('')
        expect(values.payments).toEqual({})
        expect(values.amount).toBe('')
        expect(values.amountTyped).toBe(false)
    })

    it('takes the Deposit to that paymentDefaultDeposit gives, empty included', () => {
        for (const chart of [DEPOSIT_ACCOUNTS, DEPOSIT_ACCOUNTS_NO_UNDEPOSITED]) {
            const depositTo = paymentDefaultDeposit(active(chart))
            const values = newPaymentValues({
                today: PAYMENT_TODAY,
                customer: '',
                invoice: null,
                depositTo,
            })
            expect(values.deposit_to).toBe(depositTo)
        }
        expect(paymentDefaultDeposit(active(DEPOSIT_ACCOUNTS_NO_UNDEPOSITED))).toBe('')
    })
})

describe('draftPaymentValues', () => {
    it('keeps the stored amounts with each invoice’s open balance', () => {
        const values = draftPaymentValues(DRAFT, DRAFT_APPLICATIONS)
        expect(values.payments).toEqual({
            [PAYMENT_INVOICE_IDS.overdue]: { amount: '480.00', open: 48_000, number: '1006' },
            [PAYMENT_INVOICE_IDS.partly]: { amount: '750.00', open: 75_000, number: '1009' },
            [PAYMENT_INVOICE_IDS.open]: { amount: '13.56', open: 211_177, number: '1011' },
        })
        expect(values).toMatchObject({
            customer: DRAFT.customer,
            date: DRAFT.date,
            payment_method: 'check',
            reference_no: '10518',
            deposit_to: DRAFT.deposit_to,
            amount: centsToText(124_356),
            memo: DRAFT.memo,
        })
    })

    it('follows the rows when the stored amount equals the applications’ sum', () => {
        expect(draftPaymentValues(DRAFT, DRAFT_APPLICATIONS).amountTyped).toBe(false)
    })

    it('marks the amount typed when it is above the applications’ sum', () => {
        const larger = { ...DRAFT, amount: 150_000 }
        const values = draftPaymentValues(larger, DRAFT_APPLICATIONS)
        expect(values.amountTyped).toBe(true)
        expect(values.amount).toBe(centsToText(150_000))
    })
})

describe('paymentWriteRows', () => {
    const stored = [
        { id: 'pmapstoredrow01', invoice: PAYMENT_INVOICE_IDS.overdue },
        { id: 'pmapstoredrow02', invoice: PAYMENT_INVOICE_IDS.open },
    ]
    const values = newPaymentValues({
        today: PAYMENT_TODAY,
        customer: 'cust_harbor_001',
        invoice: null,
        depositTo: 'acctfixundep001',
    })
    values.payments = {
        [PAYMENT_INVOICE_IDS.overdue]: { amount: '480.00', open: 48_000, number: '1006' },
        [PAYMENT_INVOICE_IDS.partly]: { amount: '12.50', open: 75_000, number: '1009' },
        [PAYMENT_INVOICE_IDS.open]: { amount: '0.00', open: 211_177, number: '1011' },
    }

    it('keeps a stored application’s id for its invoice', () => {
        const rows = paymentWriteRows(values, stored)
        expect(rows.find(row => row.invoice === PAYMENT_INVOICE_IDS.overdue)).toEqual({
            id: 'pmapstoredrow01',
            invoice: PAYMENT_INVOICE_IDS.overdue,
            amount: 48_000,
        })
    })

    it('gives a new invoice a fresh 15-character id, in cents', () => {
        const row = paymentWriteRows(values, stored).find(
            r => r.invoice === PAYMENT_INVOICE_IDS.partly
        )
        expect(row?.amount).toBe(1_250)
        expect(row?.id).toMatch(/^[a-z0-9]{15}$/)
        expect(stored.map(s => s.id)).not.toContain(row?.id)
    })

    it('drops a row at zero', () => {
        const invoices = paymentWriteRows(values, stored).map(row => row.invoice)
        expect(invoices).not.toContain(PAYMENT_INVOICE_IDS.open)
        expect(invoices).toHaveLength(2)
    })
})

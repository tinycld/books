import { describe, expect, it } from 'vitest'
import type { DepositAccountRow } from '../tinycld/books/lib/deposit-accounts'
import { centsToText } from '../tinycld/books/lib/money-text'
import type { OutstandingRow } from '../tinycld/books/lib/payment-allocation'
import { paymentDefaultDeposit } from '../tinycld/books/lib/payment-deposit'
import {
    correctionPaymentValues,
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
// (spec §3.4, §3.6; plan decisions on `amountTyped` and the write order). The form names
// the party and the account by role (`party`, `account`) and a row's document `document`
// (vendor refund spec §3.1), so one form serves the received payment and the refund.

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

// A stored payment as the form reads it: the row, with its party and account by role.
function headerOf(row: (typeof PAYMENTS)[number]) {
    const header = { ...row, party: row.customer, account: row.deposit_to }
    return header
}

const DRAFT_ROW = PAYMENTS.find(row => row.id === PAYMENT_IDS.draft)
if (!DRAFT_ROW) throw new Error('no draft payment in the fixture')
const DRAFT = headerOf(DRAFT_ROW)

// The draft's applications as the form reads them: each with its invoice's number and
// open balance (a draft changes no balance, so open is the invoice's balance).
const DRAFT_APPLICATIONS = applicationsOf(PAYMENT_IDS.draft).map(application => {
    const invoice = PAYMENT_INVOICES.find(row => row.id === application.invoice)
    if (!invoice) throw new Error(`no invoice ${application.invoice}`)
    return {
        document: application.invoice,
        amount: application.amount,
        open: invoice.balance,
        number: invoice.number,
    }
})

describe('newPaymentValues', () => {
    it('ticks a given invoice for its open balance, the amount following it', () => {
        const values = newPaymentValues({
            today: PAYMENT_TODAY,
            party: 'cust_harbor_001',
            document: ROW,
            account: 'acctfixundep001',
        })
        expect(values.payments).toEqual({
            [ROW.id]: { amount: '750.00', open: 75_000, number: '1009' },
        })
        expect(values.amountTyped).toBe(false)
        expect(values.amount).toBe('750.00')
        expect(values).toMatchObject({
            party: 'cust_harbor_001',
            date: PAYMENT_TODAY,
            payment_method: '',
            reference_no: '',
            memo: '',
        })
    })

    it('starts with no payments and no amount without a customer', () => {
        const values = newPaymentValues({
            today: PAYMENT_TODAY,
            party: '',
            document: null,
            account: 'acctfixundep001',
        })
        expect(values.party).toBe('')
        expect(values.payments).toEqual({})
        expect(values.amount).toBe('')
        expect(values.amountTyped).toBe(false)
    })

    it('takes the Deposit to that paymentDefaultDeposit gives, empty included', () => {
        for (const chart of [DEPOSIT_ACCOUNTS, DEPOSIT_ACCOUNTS_NO_UNDEPOSITED]) {
            const depositTo = paymentDefaultDeposit(active(chart))
            const values = newPaymentValues({
                today: PAYMENT_TODAY,
                party: '',
                document: null,
                account: depositTo,
            })
            expect(values.account).toBe(depositTo)
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
            party: DRAFT_ROW.customer,
            date: DRAFT_ROW.date,
            payment_method: 'check',
            reference_no: '10518',
            account: DRAFT_ROW.deposit_to,
            amount: centsToText(124_356),
            memo: DRAFT_ROW.memo,
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

// A correction (`?replaces=<id>`) starts from its posted original. The original's own
// applications are part of each invoice's stored balance being low, so a row's open
// balance is the invoice's balance plus what the original applied to it (spec §3.3: a
// correction lists every invoice its stored allocations name).
function postedPayment(id: string) {
    const row = PAYMENTS.find(p => p.id === id)
    if (row?.status !== 'posted') throw new Error(`no posted payment ${id} in the fixture`)
    return headerOf(row)
}

// The original's applications as the correction reads them: each with its invoice's
// number and its invoice's stored balance (after the original was applied).
function postedApplications(paymentId: string) {
    return applicationsOf(paymentId).map(application => {
        const invoice = PAYMENT_INVOICES.find(row => row.id === application.invoice)
        if (!invoice) throw new Error(`no invoice ${application.invoice}`)
        return {
            document: application.invoice,
            amount: application.amount,
            number: invoice.number,
            balance: invoice.balance,
        }
    })
}

describe('correctionPaymentValues', () => {
    it('copies the header of the original', () => {
        const original = postedPayment(PAYMENT_IDS.partial)
        const values = correctionPaymentValues(original, postedApplications(PAYMENT_IDS.partial))
        expect(values).toMatchObject({
            party: original.customer,
            date: original.date,
            payment_method: 'bank_transfer',
            reference_no: 'ACH 7781-2290',
            account: original.deposit_to,
            amount: centsToText(50_000),
            memo: original.memo,
        })
    })

    it('opens each row for its invoice balance plus what the original applied to it', () => {
        // Payment 1002 paid 500.00 of invoice 1009, whose balance is now 750.00.
        const partial = correctionPaymentValues(
            postedPayment(PAYMENT_IDS.partial),
            postedApplications(PAYMENT_IDS.partial)
        )
        expect(partial.payments).toEqual({
            [PAYMENT_INVOICE_IDS.partly]: { amount: '500.00', open: 125_000, number: '1009' },
        })

        // Payment 1001 paid invoices 1003 and 1005 in full; both are at zero now.
        const full = correctionPaymentValues(
            postedPayment(PAYMENT_IDS.paidInFull),
            postedApplications(PAYMENT_IDS.paidInFull)
        )
        expect(full.payments).toEqual({
            [PAYMENT_INVOICE_IDS.paidA]: { amount: '325.00', open: 32_500, number: '1003' },
            [PAYMENT_INVOICE_IDS.paidB]: { amount: '187.50', open: 18_750, number: '1005' },
        })
    })

    it('follows the rows when the original applied its whole amount', () => {
        const values = correctionPaymentValues(
            postedPayment(PAYMENT_IDS.paidInFull),
            postedApplications(PAYMENT_IDS.paidInFull)
        )
        expect(values.amountTyped).toBe(false)
        expect(values.amount).toBe(centsToText(51_250))
    })

    it('marks the amount typed when the original kept a credit', () => {
        // Payment 1004 received 1,500.00 and applied 1,344.00: 156.00 kept as a credit.
        const values = correctionPaymentValues(
            postedPayment(PAYMENT_IDS.overpayment),
            postedApplications(PAYMENT_IDS.overpayment)
        )
        expect(values.amountTyped).toBe(true)
        expect(values.amount).toBe(centsToText(150_000))
        expect(values.payments).toEqual({
            [PAYMENT_INVOICE_IDS.northwindPaid]: {
                amount: '1,344.00',
                open: 134_400,
                number: '1007',
            },
        })
    })
})

describe('paymentWriteRows', () => {
    const stored = [
        { id: 'pmapstoredrow01', document: PAYMENT_INVOICE_IDS.overdue },
        { id: 'pmapstoredrow02', document: PAYMENT_INVOICE_IDS.open },
    ]
    const values = newPaymentValues({
        today: PAYMENT_TODAY,
        party: 'cust_harbor_001',
        document: null,
        account: 'acctfixundep001',
    })
    values.payments = {
        [PAYMENT_INVOICE_IDS.overdue]: { amount: '480.00', open: 48_000, number: '1006' },
        [PAYMENT_INVOICE_IDS.partly]: { amount: '12.50', open: 75_000, number: '1009' },
        [PAYMENT_INVOICE_IDS.open]: { amount: '0.00', open: 211_177, number: '1011' },
    }

    it('keeps a stored application’s id for its invoice', () => {
        const rows = paymentWriteRows(values, stored)
        expect(rows.find(row => row.document === PAYMENT_INVOICE_IDS.overdue)).toEqual({
            id: 'pmapstoredrow01',
            document: PAYMENT_INVOICE_IDS.overdue,
            amount: 48_000,
        })
    })

    it('gives a new invoice a fresh 15-character id, in cents', () => {
        const row = paymentWriteRows(values, stored).find(
            r => r.document === PAYMENT_INVOICE_IDS.partly
        )
        expect(row?.amount).toBe(1_250)
        expect(row?.id).toMatch(/^[a-z0-9]{15}$/)
        expect(stored.map(s => s.id)).not.toContain(row?.id)
    })

    it('drops a row at zero', () => {
        const documents = paymentWriteRows(values, stored).map(row => row.document)
        expect(documents).not.toContain(PAYMENT_INVOICE_IDS.open)
        expect(documents).toHaveLength(2)
    })
})

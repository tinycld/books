import { describe, expect, it } from 'vitest'
import { paymentBlockRows } from '../tinycld/books/components/documents/DocumentPayments'
import type { DocumentPayment } from '../tinycld/books/hooks/document-data'
import type { CreditApplicationRow } from '../tinycld/books/hooks/useCreditApplications'
import {
    APPLY_CREDIT_INVOICE_IDS,
    APPLY_CREDIT_INVOICE_PAYMENTS,
    applicationsOfInvoice,
    applyCreditInvoiceById,
    linkedRowsOf,
} from '../tinycld/books/lib/apply-credit-fixture'
import {
    type ApplyRow,
    sortApplyRows,
    sourceMemosFirst,
    unappliedPaymentsText,
} from '../tinycld/books/lib/apply-credit-schema'
import { invoiceCreditsApplied } from '../tinycld/books/lib/bill-values'
import { phonePrimaryAction } from '../tinycld/books/lib/document-actions'
import { publishedRow } from './live-rows'

// The invoice side of apply credit (apply credit spec §3.1, §3.3, §3.6), checkpoint 4: the
// credits applied to an invoice from its stored record, the phone bar's primary action by
// kind, the payments line of the invoice's notice, the Payments block's order and the
// dialog's list order from an invoice.

const USD = 'USD'

describe('invoiceCreditsApplied', () => {
    it('is the total less the posted payments, written_off and the balance', () => {
        expect(
            invoiceCreditsApplied(
                { status: 'posted', total: 40_000, balance: 25_000, written_off: 0 },
                0
            )
        ).toBe(15_000)
        expect(
            invoiceCreditsApplied(
                { status: 'posted', total: 40_000, balance: 5_000, written_off: 10_000 },
                10_000
            )
        ).toBe(15_000)
    })

    it('is 0 while nothing but payments and a write-off lowered the invoice', () => {
        expect(
            invoiceCreditsApplied(
                { status: 'posted', total: 40_000, balance: 20_000, written_off: 5_000 },
                15_000
            )
        ).toBe(0)
    })

    it('is 0 for a draft and a void invoice', () => {
        expect(
            invoiceCreditsApplied({ status: 'draft', total: 40_000, balance: 0, written_off: 0 }, 0)
        ).toBe(0)
        expect(
            invoiceCreditsApplied({ status: 'void', total: 40_000, balance: 0, written_off: 0 }, 0)
        ).toBe(0)
        expect(
            invoiceCreditsApplied(
                { status: 'void', total: 40_000, balance: 25_000, written_off: 0 },
                0
            )
        ).toBe(0)
    })

    it('makes Payments, Credits applied, Written off and Balance due add up to the total of invoice-mixed', () => {
        const mixed = applyCreditInvoiceById(APPLY_CREDIT_INVOICE_IDS.mixed)
        if (!mixed) throw new Error('the fixture has no invoice-mixed')
        const payments = linkedRowsOf(APPLY_CREDIT_INVOICE_PAYMENTS, mixed.id).reduce(
            (sum, row) => sum + row.amount,
            0
        )
        const credits = applicationsOfInvoice(mixed.id).reduce((sum, row) => sum + row.amount, 0)
        expect(payments).toBeGreaterThan(0)
        expect(credits).toBeGreaterThan(0)
        expect(mixed.written_off).toBeGreaterThan(0)

        const applied = invoiceCreditsApplied(mixed, payments)
        expect(applied).toBe(credits)
        expect(payments + applied + mixed.written_off + mixed.balance).toBe(mixed.total)
    })
})

// The one button a phone's read bar keeps beside More (plan decision 9): a bill's Pay bill,
// a credit's Apply; an invoice has none, so the bar falls back to its lifecycle button
// (Edit) and Apply credit is a row of More.
describe('phonePrimaryAction', () => {
    it('is undefined for an invoice, also when it offers Apply credit', () => {
        expect(phonePrimaryAction('invoice', ['receive_payment', 'apply_credit', 'edit'])).toBe(
            undefined
        )
    })

    it('is Apply for a credit memo and a vendor credit that offer it', () => {
        expect(
            phonePrimaryAction('credit_memo', ['apply_credit', 'edit', 'void', 'refund_credit'])
        ).toBe('apply_credit')
        expect(phonePrimaryAction('vendor_credit', ['apply_credit', 'record_refund', 'edit'])).toBe(
            'apply_credit'
        )
    })

    it('is Pay bill for a bill that offers it', () => {
        expect(phonePrimaryAction('bill', ['pay_bill', 'edit', 'void', 'copy'])).toBe('pay_bill')
    })

    it('is undefined when the kind does not offer its primary action', () => {
        expect(phonePrimaryAction('credit_memo', ['edit', 'void', 'copy'])).toBe(undefined)
        expect(phonePrimaryAction('bill', ['edit', 'void', 'copy'])).toBe(undefined)
    })
})

// The second line of the invoice's notice (spec §3.1, Q2): at most three payments, oldest
// first, then "and N more payments on the customer's page". The hook gives the first three
// and the number of the rest.
describe('unappliedPaymentsText', () => {
    const PAYMENTS = [
        { number: '1004', credited: 10_000 },
        { number: '1007', credited: 2_550 },
        { number: '1011', credited: 123_456 },
    ]
    const line = (number: string, money: string) =>
        `Payment ${number} has ${money} that is not applied to an invoice. Open the payment and edit it to apply that amount.`
    const THREE = [line('1004', '$100.00'), line('1007', '$25.50'), line('1011', '$1,234.56')]

    it('names one payment, with no more link', () => {
        expect(unappliedPaymentsText(PAYMENTS.slice(0, 1), 0, USD)).toEqual({
            lines: [line('1004', '$100.00')],
            more: '',
        })
    })

    it('names three payments in the given order, with no more link', () => {
        expect(unappliedPaymentsText(PAYMENTS, 0, USD)).toEqual({ lines: THREE, more: '' })
    })

    it('names the first three of four, and one more payment', () => {
        expect(unappliedPaymentsText(PAYMENTS, 1, USD)).toEqual({
            lines: THREE,
            more: "and 1 more payment on the customer's page",
        })
    })

    it('names the first three of five, and two more payments', () => {
        expect(unappliedPaymentsText(PAYMENTS, 2, USD)).toEqual({
            lines: THREE,
            more: "and 2 more payments on the customer's page",
        })
    })
})

// The Payments block (spec §3.6): each application among the payments, in date order.
describe('paymentBlockRows', () => {
    const payment = (id: string, number: string, date: string): DocumentPayment => ({
        id,
        amount: 5_000,
        payment: `pay${id}`,
        number,
        date,
    })
    // The hook hands on live query rows, which carry TanStack DB's virtual props.
    const application: CreditApplicationRow = publishedRow(
        {
            id: 'cmapp0000000001',
            amount: 15_000,
            date: '2026-11-16',
            documentId: 'invoice00000001',
            documentNumber: '1009',
            creditId: 'creditmemo00001',
            creditNumber: '1001',
        },
        'books_credit_memo_applications'
    )

    it('puts the application between a payment before it and one after it', () => {
        const early = payment('line00000000001', '1003', '2026-10-12 00:00:00.000Z')
        const late = payment('line00000000002', '1008', '2026-11-18 00:00:00.000Z')
        const rows = paymentBlockRows([early, late], [application])
        expect(rows.map(row => row.kind)).toEqual(['payment', 'credit', 'payment'])
        expect(rows.map(row => row.key)).toEqual([
            `payment-${early.id}`,
            `credit-${application.id}`,
            `payment-${late.id}`,
        ])
    })
})

// The dialog's list from an invoice (spec §3.3), as useApplyCredit builds it: the rows by
// credit date, then by number (sortApplyRows with no source), then the credit memos made from
// this invoice (`invoice` = this invoice) moved first, each part keeping that order.
describe('sourceMemosFirst from an invoice', () => {
    const memo = (id: string, number: string, day: string): ApplyRow => ({
        id,
        number,
        date: day,
        due_date: day,
        creditDate: day,
        total: 10_000,
        open: 10_000,
    })
    const fromInvoiceLate = memo('memofrominvlate', '1003', '2026-11-18')
    const fromInvoiceHigh = memo('memofrominvhigh', '1008', '2026-11-13')
    const fromInvoiceLow = memo('memofrominvlow0', '1004', '2026-11-13')
    const later = memo('memolater000001', '1001', '2026-11-14')
    const sameDayHigh = memo('memosamehigh001', '1006', '2026-11-12')
    const sameDayLow = memo('memosamelow0001', '1002', '2026-11-12')

    it('puts the memos made from the invoice first by credit date and number, then the rest', () => {
        const rows = [
            later,
            fromInvoiceLate,
            sameDayHigh,
            fromInvoiceHigh,
            sameDayLow,
            fromInvoiceLow,
        ]
        const sourceIds = new Set([fromInvoiceLate.id, fromInvoiceHigh.id, fromInvoiceLow.id])
        const ordered = sourceMemosFirst(sortApplyRows(rows, ''), sourceIds)
        expect(ordered.map(row => row.id)).toEqual([
            fromInvoiceLow.id,
            fromInvoiceHigh.id,
            fromInvoiceLate.id,
            sameDayLow.id,
            sameDayHigh.id,
            later.id,
        ])
    })
})

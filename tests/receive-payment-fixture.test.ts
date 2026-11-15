import type {
    BooksInvoices,
    BooksPaymentApplications,
    BooksPayments,
} from '@tinycld/core/types/pbSchema'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { INVOICE_IDS, INVOICE_SEED_IDS, INVOICES } from '../tinycld/books/lib/invoice-form-fixture'
import {
    applicationsOf,
    type OpenInvoiceRecord,
    openInvoicesOf,
    PAYMENT_APPLICATIONS,
    PAYMENT_CUSTOMER_IDS,
    PAYMENT_INVOICES,
    PAYMENT_SEED,
    PAYMENTS,
    type PaymentApplicationRecord,
    type PaymentRecord,
} from '../tinycld/books/lib/receive-payment-fixture'

const sum = (amounts: number[]) => amounts.reduce((total, amount) => total + amount, 0)

function paymentById(id: string) {
    const payment = PAYMENTS.find(row => row.id === id)
    if (!payment) throw new Error(`no fixture payment ${id}`)
    return payment
}

function invoiceTotal(id: string) {
    const invoice = INVOICES.find(row => row.id === id)
    if (!invoice) throw new Error(`no fixture invoice ${id}`)
    return invoice.total
}

describe('generated payment types', () => {
    it('the fixture types are the generated types', () => {
        // tsc fails here until the migration and the generated types exist.
        expectTypeOf<PaymentRecord>().toEqualTypeOf<BooksPayments>()
        expectTypeOf<PaymentApplicationRecord>().toEqualTypeOf<BooksPaymentApplications>()
        expectTypeOf<OpenInvoiceRecord>().toEqualTypeOf<BooksInvoices>()
    })
})

describe('receive payment fixture', () => {
    // applied and credited are what the server writes at posting, so a draft carries
    // neither, and a payment that was posted (now posted or void) carries both.
    it('gives every posted or void payment the sum of its applications as applied and the rest as credited', () => {
        for (const payment of PAYMENTS) {
            const applied = sum(applicationsOf(payment.id).map(row => row.amount))
            if (payment.status === 'draft') {
                expect([payment.applied, payment.credited], payment.id).toEqual([0, 0])
                continue
            }
            expect(payment.applied, payment.id).toBe(applied)
            expect(payment.credited, payment.id).toBe(payment.amount - payment.applied)
        }
    })

    it('gives each invoice its total less the posted applications that name it as balance', () => {
        for (const invoice of PAYMENT_INVOICES) {
            const posted = PAYMENT_APPLICATIONS.filter(
                row => row.invoice === invoice.id && paymentById(row.payment).status === 'posted'
            )
            expect(invoice.balance, invoice.number).toBe(
                invoice.total - sum(posted.map(row => row.amount))
            )
        }
    })

    it('uses 15-character ids', () => {
        const ids = [
            ...PAYMENTS.map(row => row.id),
            ...PAYMENT_APPLICATIONS.map(row => row.id),
            ...PAYMENT_INVOICES.map(row => row.id),
        ]
        for (const id of ids) {
            expect(id.length, id).toBe(15)
        }
        expect(new Set(ids).size).toBe(ids.length)
    })

    // Spec §4.5: paid in full, partial, an overpayment with credit, a draft, a void and
    // its correction.
    it('holds each payment case of the spec', () => {
        const posted = PAYMENTS.filter(row => row.status === 'posted')
        const paysInFull = (payment: PaymentRecord) => {
            const rows = applicationsOf(payment.id)
            return (
                rows.length > 0 &&
                rows.every(row => {
                    const invoice = PAYMENT_INVOICES.find(inv => inv.id === row.invoice)
                    return invoice !== undefined && row.amount === invoice.total
                })
            )
        }
        const paysPart = (payment: PaymentRecord) =>
            applicationsOf(payment.id).some(row => {
                const invoice = PAYMENT_INVOICES.find(inv => inv.id === row.invoice)
                return invoice !== undefined && row.amount < invoice.total
            })

        expect(posted.some(row => paysInFull(row) && row.credited === 0)).toBe(true)
        expect(posted.some(paysPart)).toBe(true)
        expect(posted.some(row => row.credited > 0 && row.applied > 0)).toBe(true)
        expect(PAYMENTS.some(row => row.status === 'draft')).toBe(true)

        const voided = PAYMENTS.filter(row => row.status === 'void' && row.replaced_by !== '')
        expect(voided.length).toBeGreaterThan(0)
        for (const original of voided) {
            const correction = paymentById(original.replaced_by)
            expect(correction.status).toBe('posted')
            expect(correction.replaces).toBe(original.id)
            expect(correction.number).toBe(original.number)
        }
    })

    it('holds a customer with four open invoices and one with none', () => {
        expect(openInvoicesOf(PAYMENT_CUSTOMER_IDS.harborview)).toHaveLength(4)
        expect(openInvoicesOf(PAYMENT_CUSTOMER_IDS.bluefin)).toEqual([])
    })
})

// Spec §4.5: the seed posts two payments on seeded invoices, one in full to 1200
// Undeposited funds and one in part, and keeps one seeded invoice fully open.
describe('PAYMENT_SEED', () => {
    const seeded: readonly string[] = INVOICE_SEED_IDS

    it('names seeded invoices only, each once', () => {
        for (const row of PAYMENT_SEED) {
            expect(seeded, row.key).toContain(row.invoice)
        }
        const invoices = PAYMENT_SEED.map(row => row.invoice)
        expect(new Set(invoices).size).toBe(invoices.length)
    })

    it('pays one invoice in full to 1200 and one in part', () => {
        expect(PAYMENT_SEED.map(row => row.key).sort()).toEqual(['full', 'partial'])
        const full = PAYMENT_SEED.find(row => row.key === 'full')
        const partial = PAYMENT_SEED.find(row => row.key === 'partial')
        expect(full?.amount).toBe('total')
        expect(full?.depositNumber).toBe('1200')
        expect(full?.invoice).toBe(INVOICE_IDS.exempt)
        expect(partial?.invoice).toBe(INVOICE_IDS.noTax)
        const amount = partial?.amount
        expect(typeof amount).toBe('number')
        if (typeof amount === 'number' && partial) {
            expect(amount).toBeGreaterThan(0)
            expect(amount).toBeLessThan(invoiceTotal(partial.invoice))
        }
    })

    it('leaves at least one seeded invoice with no payment', () => {
        const paid = new Set(PAYMENT_SEED.map(row => row.invoice))
        expect(seeded.filter(id => !paid.has(id))).toContain(INVOICE_IDS.posted)
    })

    it('dates each payment in 2026-10, after its invoice', () => {
        for (const row of PAYMENT_SEED) {
            const invoice = INVOICES.find(inv => inv.id === row.invoice)
            expect(row.date, row.key).toMatch(/^2026-10-\d\d$/)
            expect(row.date > (invoice?.date ?? ''), row.key).toBe(true)
        }
    })
})

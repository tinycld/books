import { describe, expect, it } from 'vitest'
import { INVOICE_OUTSTANDING } from '../tinycld/books/lib/outstanding-documents'
import { PAYMENT_FLOW, sumErrorOf } from '../tinycld/books/lib/payment-flow'
import { PAYMENT_CHROME } from '../tinycld/books/lib/payment-kind'
import { fillPaymentText } from '../tinycld/books/lib/payment-texts'

// The received payment's descriptor of the shared payment layer (vendor refund spec §3.1):
// every value, text and test id is today's, so the receive-payment screen does not change.

describe('PAYMENT_FLOW', () => {
    it('holds the received payment’s party, document, collections, routes and rules', () => {
        expect(PAYMENT_FLOW.key).toBe('payment')
        expect(PAYMENT_FLOW.chrome).toBe(PAYMENT_CHROME)
        expect(PAYMENT_FLOW.testId).toBe('payment')
        expect(PAYMENT_FLOW.logContext).toBe('books.payment')
        expect(PAYMENT_FLOW.routeBase).toBe('books/payments')
        expect(PAYMENT_FLOW.partyParam).toBe('customer')
        expect(PAYMENT_FLOW.documentParam).toBe('invoice')
        expect(PAYMENT_FLOW.partyRoute).toBe('books/customers')
        expect(PAYMENT_FLOW.doc).toBe(INVOICE_OUTSTANDING)
        expect(PAYMENT_FLOW.sumRule).toBe('credit')
        expect(PAYMENT_FLOW.lineKey).toBe('applications')
        expect(PAYMENT_FLOW.serverFields).toEqual({ party: 'customer', account: 'deposit_to' })
    })

    // Literal suffixes read from the receive-payment parts before the change: payment-customer
    // (PaymentCustomerField), payment-deposit-to (PaymentBand), payment-choose-customer,
    // payment-list-empty, payment-list-loading, payment-list-error (OutstandingInvoices),
    // payment-over (PaymentTotals). The received payment draws no account balance today.
    it('keeps today’s test id suffixes', () => {
        expect(PAYMENT_FLOW.ids).toMatchObject({
            party: 'customer',
            account: 'deposit-to',
            listPrompt: 'choose-customer',
            listEmpty: 'list-empty',
            listLoading: 'list-loading',
            listError: 'list-error',
            sumError: 'over',
        })
    })

    // Read from PaymentReadView before the flow: `${testId}-detail-memo`.
    it('keeps today’s read view memo text id', () => {
        expect(PAYMENT_FLOW.ids.memoText).toBe('detail-memo')
    })

    it('gives today’s two total lines for $650.00 received and $600.00 on the rows', () => {
        const lines = PAYMENT_FLOW.totals({
            amountCents: 65_000,
            rowsCents: 60_000,
            currency: 'USD',
        })
        expect(lines).toHaveLength(2)
        const [apply, credit] = lines
        expect(apply).toMatchObject({
            label: 'Amount to apply',
            amount: '$600.00',
            isStrong: false,
            isDanger: false,
            note: '',
        })
        expect(apply.id).toMatch(/to-apply$/)
        expect(credit).toMatchObject({
            label: 'Amount to credit',
            amount: '$50.00',
            isStrong: true,
            isDanger: false,
        })
        expect(credit.id).toMatch(/to-credit$/)
        // The note names the party, which the shared totals part fills in.
        expect(fillPaymentText(credit.note, 'Harborview Dental')).toBe(
            'Kept as a credit for Harborview Dental'
        )
    })

    it('gives only Amount to apply when the rows equal the amount', () => {
        const lines = PAYMENT_FLOW.totals({
            amountCents: 65_000,
            rowsCents: 65_000,
            currency: 'USD',
        })
        expect(lines).toHaveLength(1)
        expect(lines[0]).toMatchObject({
            label: 'Amount to apply',
            amount: '$650.00',
            isStrong: false,
            isDanger: false,
        })
    })

    it('holds today’s screen state texts', () => {
        expect(PAYMENT_FLOW.texts.loadFailed).toBe('Books could not load this payment.')
        expect(PAYMENT_FLOW.texts.notFound).toBe('This payment does not exist')
        expect(PAYMENT_FLOW.texts.noAccess).toBe('You need bookkeeper access to receive payments')
        expect(PAYMENT_FLOW.texts.cannotEdit).toBe('This payment cannot be edited')
    })

    it('holds today’s edit and read titles', () => {
        expect(PAYMENT_FLOW.texts.editTitle('1004')).toBe('Edit payment 1004')
        expect(PAYMENT_FLOW.texts.readTitle('1004')).toBe('Payment 1004')
    })

    it('holds today’s list, row, sum and memo texts', () => {
        const { texts } = PAYMENT_FLOW
        expect(texts.listHeading).toBe('Outstanding invoices')
        expect(texts.memoLabel).toBe('Internal memo (not printed)')
        expect(texts.memoHint).toBe('')
        expect(texts.noDocuments('Harborview Dental')).toBe(
            'Harborview Dental has no open invoices. The amount you enter is kept as a credit.'
        )
        expect(texts.noDocumentsHref).toBeNull()
        expect(texts.aboveOpen('$243.56')).toBe('More than the open balance of $243.56')
        expect(texts.datedAfter).toBeNull()
        expect(texts.rowsAbove('$1,500.00', '$1,243.56')).toBe(
            'The payments add up to $1,500.00, more than the $1,243.56 received'
        )
        expect(texts.rowsBelow).toBeNull()
        expect(texts.paymentVerb).toBe('deposited to')
    })
})

// The live sum refusal under the list, before any submit (vendor refund spec §3.5): rows
// above the amount under both rules; rows below it only where the rows must add up to the
// amount ('exact') and the flow has a below text.
describe('sumErrorOf', () => {
    const EXACT_FLOW = {
        sumRule: 'exact' as const,
        texts: {
            ...PAYMENT_FLOW.texts,
            rowsBelow: (rest: string) => `${rest} is not on a document`,
        },
    }

    function input(amountCents: number | null, rowsCents: number) {
        return { amountCents, rowsCents, currency: 'USD' }
    }

    it('gives the rows-above text when the rows add up to more than the amount', () => {
        expect(sumErrorOf(PAYMENT_FLOW, input(65_000, 70_000))).toBe(
            'The payments add up to $700.00, more than the $650.00 received'
        )
    })

    it('gives the rows-above text under the exact rule too', () => {
        expect(sumErrorOf(EXACT_FLOW, input(65_000, 70_000))).toBe(
            'The payments add up to $700.00, more than the $650.00 received'
        )
    })

    it('gives nothing for rows below the amount under the credit rule', () => {
        expect(sumErrorOf(PAYMENT_FLOW, input(65_000, 60_000))).toBe('')
    })

    it('gives the rows-below text with the rest under the exact rule', () => {
        expect(sumErrorOf(EXACT_FLOW, input(65_000, 63_000))).toBe('$20.00 is not on a document')
    })

    it('gives nothing when the rows equal the amount', () => {
        expect(sumErrorOf(PAYMENT_FLOW, input(65_000, 65_000))).toBe('')
        expect(sumErrorOf(EXACT_FLOW, input(65_000, 65_000))).toBe('')
    })

    it('gives no rows-below text while the amount is empty or 0', () => {
        expect(sumErrorOf(EXACT_FLOW, input(null, 0))).toBe('')
        expect(sumErrorOf(EXACT_FLOW, input(null, 30_000))).toBe('')
        expect(sumErrorOf(EXACT_FLOW, input(0, 0))).toBe('')
    })
})

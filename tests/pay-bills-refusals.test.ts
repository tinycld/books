import { BatchMutationError } from 'pbtsdb'
import { ClientResponseError } from 'pocketbase'
import { describe, expect, it } from 'vitest'
import type { PayBillsWritePlan } from '../tinycld/books/lib/pay-bills-plan'
import { payBillsRefusalErrors } from '../tinycld/books/lib/pay-bills-refusals'

// Where a refused Pay shows (spec §3.5, §9): the batch names the operation the server
// refused (pbtsdb's BatchMutationError). A payment's `lines.<n>` goes under the Payment cell
// of that payment's line n's bill, a line's own refusal under its bill's cell, the payment's
// Ref no. under Starting check no., Paid from under Paid from, and the rest in the summary.

// Two vendors, in display-name order; Alder's payment pays two bills.
const PLAN: PayBillsWritePlan = {
    vendors: [
        {
            vendor: 'vendalder00001',
            name: 'Alder Supply',
            paymentId: 'billpayalder001',
            reference_no: '1050',
            lines: [
                {
                    id: 'bplinealder0001',
                    bill: 'billalderfirst1',
                    billNumber: '1003',
                    amount: 42_000,
                    position: 0,
                },
                {
                    id: 'bplinealder0002',
                    bill: 'billaldersecnd1',
                    billNumber: '1007',
                    amount: 5_000,
                    position: 1,
                },
            ],
        },
        {
            vendor: 'vendzephyr0001',
            name: 'Zephyr Power',
            paymentId: 'billpayzephyr01',
            reference_no: '1051',
            lines: [
                {
                    id: 'bplinezephyr001',
                    bill: 'billzephyrone01',
                    billNumber: '1004',
                    amount: 30_000,
                    position: 0,
                },
            ],
        },
    ],
}

function refusal(
    recordId: string,
    collection: string,
    response: { message: string; data: Record<string, { code: string; message: string }> }
) {
    return new BatchMutationError({
        index: 0,
        collection,
        recordId,
        response: { status: 400, ...response },
        cause: new ClientResponseError({ status: 400 }),
    })
}

function fieldOn(recordId: string, collection: string, field: string, message: string) {
    return refusal(recordId, collection, {
        message: 'Failed to create record.',
        data: { [field]: { code: 'validation_refused', message } },
    })
}

function messageOn(recordId: string, collection: string, message: string) {
    return refusal(recordId, collection, { message, data: {} })
}

// The row field of a bill: `payments.<bill id>`, or its Payment cell's `.amount`.
function rowField(bill: string) {
    return expect.stringMatching(new RegExp(`^payments\\.${bill}(\\.amount)?$`))
}

describe('payBillsRefusalErrors', () => {
    it('puts a payment’s lines.1 under the cell of that payment’s second bill', () => {
        const text = 'Bill 1007: the payment is more than its open balance of $50.00.'
        const errors = payBillsRefusalErrors(
            PLAN,
            fieldOn('billpayalder001', 'books_bill_payments', 'lines.1', text)
        )
        expect(errors).toEqual([{ field: rowField('billaldersecnd1'), message: text }])
    })

    it('puts lines.0 of the second vendor’s payment under that vendor’s bill', () => {
        const text = 'Bill 1004 is not open. Clear it to continue.'
        const errors = payBillsRefusalErrors(
            PLAN,
            fieldOn('billpayzephyr01', 'books_bill_payments', 'lines.0', text)
        )
        expect(errors).toEqual([{ field: rowField('billzephyrone01'), message: text }])
    })

    it('puts a line’s own refusal under its bill’s cell', () => {
        const text = 'Bill 1003 is not open. Clear it to continue.'
        const errors = payBillsRefusalErrors(
            PLAN,
            messageOn('bplinealder0001', 'books_bill_payment_lines', text)
        )
        expect(errors).toEqual([{ field: rowField('billalderfirst1'), message: text }])
    })

    it('puts a taken check number under Starting check no.', () => {
        const text = 'Check no. 1051 from 1000 Business Checking is already on Bill payment 1006.'
        const errors = payBillsRefusalErrors(
            PLAN,
            fieldOn('billpayzephyr01', 'books_bill_payments', 'reference_no', text)
        )
        expect(errors).toEqual([{ field: 'reference_no', message: text }])
    })

    it('puts a Paid from refusal under Paid from', () => {
        const text = '1000 Business Checking is inactive. Choose an active account.'
        const errors = payBillsRefusalErrors(
            PLAN,
            fieldOn('billpayalder001', 'books_bill_payments', 'paid_from', text)
        )
        expect(errors).toEqual([{ field: 'paid_from', message: text }])
    })

    it('puts a refusal with no field in the summary, with its final period', () => {
        const text = 'The books are closed through 2026-06-30.'
        const errors = payBillsRefusalErrors(
            PLAN,
            messageOn('billpayalder001', 'books_bill_payments', text)
        )
        expect(errors).toEqual([{ field: 'root', message: text }])
    })

    it('puts a refusal of a record the plan does not hold in the summary', () => {
        const text = 'Bill 1099 is not open. Clear it to continue.'
        const errors = payBillsRefusalErrors(
            PLAN,
            messageOn('notinthisplan01', 'books_bill_payment_lines', text)
        )
        expect(errors).toEqual([{ field: 'root', message: text }])
    })
})

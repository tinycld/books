import { describe, expect, it } from 'vitest'
import { billPaymentReadState } from '../tinycld/books/lib/bill-payment-read-state'
import { PAY_BILLS_MESSAGES } from '../tinycld/books/lib/pay-bills-texts'

// Which surface the bill payment read view shows (pay-bills spec §3.8 States): loading, a
// load error with Retry, not found, or the payment. These states are transient, so e2e
// drives only the load error (plan: E2E budget).

type Input = Parameters<typeof billPaymentReadState>[0]
type Payment = NonNullable<Input['payment']>

const PAYMENT = { id: 'bpay1002summit1', status: 'posted', number: '1002' } as unknown as Payment

describe('billPaymentReadState', () => {
    it('is loading while the payment loads', () => {
        expect(billPaymentReadState({ isLoading: true, isError: false, payment: undefined })).toBe(
            'loading'
        )
    })

    it('is the error, which offers Retry, when the read failed', () => {
        expect(billPaymentReadState({ isLoading: false, isError: true, payment: undefined })).toBe(
            'error'
        )
        expect(PAY_BILLS_MESSAGES.paymentLoadFailed).toBe('Books could not load this bill payment.')
    })

    it('is not found when the read ended with no payment', () => {
        expect(billPaymentReadState({ isLoading: false, isError: false, payment: undefined })).toBe(
            'not-found'
        )
        expect(billPaymentReadState({ isLoading: false, isError: false, payment: null })).toBe(
            'not-found'
        )
        expect(PAY_BILLS_MESSAGES.notFound).toBe('This bill payment does not exist')
    })

    it('is ready with the payment', () => {
        expect(billPaymentReadState({ isLoading: false, isError: false, payment: PAYMENT })).toBe(
            'ready'
        )
    })

    it('is the error, not not-found, when the read failed with no payment', () => {
        expect(billPaymentReadState({ isLoading: false, isError: true, payment: null })).toBe(
            'error'
        )
    })
})

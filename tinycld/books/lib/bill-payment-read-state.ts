// Which surface the bill payment read view shows (pay-bills spec §3.8 States). A failed
// read is an error with Retry even when it left no payment, never "does not exist".

import type { BooksBillPayments } from '../types'

export type BillPaymentReadState = 'loading' | 'error' | 'not-found' | 'ready'

export function billPaymentReadState(input: {
    isLoading: boolean
    isError: boolean
    payment: Pick<BooksBillPayments, 'id'> | null | undefined
}): BillPaymentReadState {
    if (input.isError) return 'error'
    if (input.isLoading) return 'loading'
    if (!input.payment) return 'not-found'
    return 'ready'
}

// The Void dialog texts of a bill payment (spec §3.8), read through `PAY_BILLS_MESSAGES`.
// No imports, so an e2e spec can import this file without the app's module chain.

export const BILL_PAYMENT_VOID_BODY =
    'A reversing entry is posted in the original period. The number is kept. The bills it paid are open again.'

export const BILL_PAYMENT_VOID_CONFIRM = 'Void bill payment'

// The account types an expense is paid from, and the payment method a Paid from pick sets
// (spec §3.3). Plain: type imports and ./payment-methods only, because the expense
// fixture re-exports these and the fixture is in the plain-node seed graph
// (tests/seed-node.test.ts). The server holds the same types (server/expenses.go
// `isPaymentAccount`).

import type { PaymentMethodKey } from './payment-methods'

export const PAID_FROM_TYPES: ReadonlySet<string> = new Set(['bank', 'credit_card'])

const CASH_ON_HAND = 'cash_on_hand'

// A credit card account sets Credit card, a bank account of detail type Cash on hand sets
// Cash, any other bank account sets Check.
export function defaultMethodFor(account: { type: string; detail_type: string }): PaymentMethodKey {
    if (account.type === 'credit_card') return 'credit_card'
    if (account.detail_type === CASH_ON_HAND) return 'cash'
    return 'check'
}

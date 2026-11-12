// The fixed list of ways a customer pays on a sales receipt (spec §3.3). The
// server holds the same list in server/payment_methods.json;
// tests/payment-methods.test.ts fails when the two drift.

// For z.enum: the keys in list order.
export const PAYMENT_METHOD_KEYS = [
    'cash',
    'check',
    'credit_card',
    'debit_card',
    'bank_transfer',
    'other',
] as const

export type PaymentMethodKey = (typeof PAYMENT_METHOD_KEYS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, string> = {
    cash: 'Cash',
    check: 'Check',
    credit_card: 'Credit card',
    debit_card: 'Debit card',
    bank_transfer: 'Bank transfer',
    other: 'Other',
}

export const PAYMENT_METHODS: readonly { key: PaymentMethodKey; label: string }[] =
    PAYMENT_METHOD_KEYS.map(key => ({ key, label: PAYMENT_METHOD_LABELS[key] }))

const LABELS = new Map<string, string>(PAYMENT_METHODS.map(m => [m.key, m.label]))

// The label of a stored key; '' for an empty (none) or unknown key.
export function paymentMethodLabel(key: string): string {
    return LABELS.get(key) ?? ''
}

// The Payment method select's options: "None" (the empty value) first.
export function paymentMethodOptions(): { value: string; label: string }[] {
    return [
        { value: '', label: 'None' },
        ...PAYMENT_METHODS.map(m => ({ value: m.key, label: m.label })),
    ]
}

import type { BooksVendors } from '../types'

// The `terms` select of books_vendors (2100000004_create_books_vendors.js);
// tests/payment-terms.test.ts fails when the migration's values drift from
// these keys. An empty `terms` means none.
export const PAYMENT_TERMS = [
    { key: 'due_on_receipt', label: 'Due on receipt', days: 0 },
    { key: 'net_10', label: 'Net 10', days: 10 },
    { key: 'net_15', label: 'Net 15', days: 15 },
    { key: 'net_30', label: 'Net 30', days: 30 },
    { key: 'net_60', label: 'Net 60', days: 60 },
] as const satisfies readonly {
    key: Exclude<BooksVendors['terms'], ''>
    label: string
    days: number
}[]

// A tuple literal, as `z.enum` needs; the test holds it equal to the keys above.
export const PAYMENT_TERM_KEYS = ['due_on_receipt', 'net_10', 'net_15', 'net_30', 'net_60'] as const

export type PaymentTermKey = BooksVendors['terms']

export function paymentTermLabel(key: string): string {
    return PAYMENT_TERMS.find(term => term.key === key)?.label ?? ''
}

export const PAYMENT_TERM_OPTIONS: { value: PaymentTermKey; label: string }[] = [
    { value: '', label: 'None' },
    ...PAYMENT_TERMS.map(term => ({ value: term.key, label: term.label })),
]

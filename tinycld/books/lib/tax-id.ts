// A vendor's tax ID type and the display forms of its tax ID. The keys must
// equal the tax_id_type values of migration 2100000004 (tests/tax-id.test.ts).

import type { BooksVendors } from '../types'

export type TaxIdType = Exclude<BooksVendors['tax_id_type'], ''>

export const TAX_ID_TYPES = [
    { key: 'ein', label: 'EIN (business)' },
    { key: 'ssn', label: 'SSN or ITIN (person)' },
] as const satisfies readonly { key: TaxIdType; label: string }[]

export const TAX_ID_TYPE_KEYS = ['ein', 'ssn'] as const satisfies readonly TaxIdType[]

export const TAX_ID_TYPE_OPTIONS: { value: TaxIdType | ''; label: string }[] = [
    { value: '', label: 'Choose…' },
    ...TAX_ID_TYPES.map(type => ({ value: type.key, label: type.label })),
]

export function taxIdDigits(text: string): string {
    return text.replace(/\D/g, '')
}

export function taxIdLastFour(taxId: string): string | null {
    const digits = taxIdDigits(taxId)
    if (digits === '') return null
    return `•••${digits.slice(-4)}`
}

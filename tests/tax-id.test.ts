import { describe, expect, it } from 'vitest'
import {
    TAX_ID_TYPE_KEYS,
    TAX_ID_TYPE_OPTIONS,
    TAX_ID_TYPES,
    taxIdDigits,
    taxIdLastFour,
} from '../tinycld/books/lib/tax-id'
import { fieldMax, fieldPattern, fieldValues, migrationField } from './migration-field'

const VENDORS_MIGRATION = '2100000004_create_books_vendors.js'

describe('TAX_ID_TYPES', () => {
    it('TAX_ID_TYPE_KEYS are the keys of TAX_ID_TYPES', () => {
        expect([...TAX_ID_TYPE_KEYS]).toEqual(TAX_ID_TYPES.map(t => t.key))
    })

    it('TAX_ID_TYPE_OPTIONS start with Choose…, then EIN and SSN', () => {
        expect(TAX_ID_TYPE_OPTIONS).toEqual([
            { value: '', label: 'Choose…' },
            { value: 'ein', label: 'EIN (business)' },
            { value: 'ssn', label: 'SSN or ITIN (person)' },
        ])
    })
})

describe('taxIdDigits', () => {
    it('removes every character that is not a digit', () => {
        expect(taxIdDigits('12-345 6789')).toBe('123456789')
    })
})

describe('taxIdLastFour', () => {
    it('shows the last four digits of an SSN and an EIN', () => {
        expect(taxIdLastFour('123-45-6789')).toBe('•••6789')
        expect(taxIdLastFour('07-3418265')).toBe('•••8265')
    })

    it('is null with no tax ID', () => {
        expect(taxIdLastFour('')).toBeNull()
    })
})

describe('books_vendors 1099 columns (migration 2100000004)', () => {
    it('tax_id_type values are TAX_ID_TYPE_KEYS', () => {
        const field = migrationField(VENDORS_MIGRATION, 'tax_id_type')
        expect(fieldValues(field)).toEqual([...TAX_ID_TYPE_KEYS])
    })

    it('tax_id holds the dashed form, up to 11 characters', () => {
        const field = migrationField(VENDORS_MIGRATION, 'tax_id')
        expect(fieldPattern(field)).toBe(String.raw`^(\d{2}-\d{7}|\d{3}-\d{2}-\d{4})?$`)
        expect(fieldMax(field)).toBe(11)
    })

    it('legal_name holds up to 200 characters', () => {
        expect(fieldMax(migrationField(VENDORS_MIGRATION, 'legal_name'))).toBe(200)
    })
})

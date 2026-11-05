import { describe, expect, it } from 'vitest'
import {
    EXEMPTION_REASON_KEYS,
    EXEMPTION_REASONS,
    exemptionReasonOptions,
} from '../tinycld/books/lib/exemption-reasons'
import { fieldValues, migrationField } from './migration-field'

// The spec's ten reasons, in the order the Exemption reason select lists them.
const SPEC_LABELS = [
    'Resale',
    'Federal government',
    'State or local government',
    'Tribal government',
    'Nonprofit organization',
    'Educational organization',
    'Agricultural',
    'Manufacturing',
    'Direct pay permit',
    'Other',
]

describe('exemption reasons', () => {
    it("lists the spec's ten reasons in order", () => {
        expect(EXEMPTION_REASONS.map(reason => reason.label)).toEqual(SPEC_LABELS)
    })

    it('keeps the key tuple in the order of the reasons', () => {
        expect([...EXEMPTION_REASON_KEYS]).toEqual(EXEMPTION_REASONS.map(reason => reason.key))
    })

    it('offers Choose… first, then the ten reasons', () => {
        const options = exemptionReasonOptions()
        expect(options[0]).toEqual({ value: '', label: 'Choose…' })
        expect(options).toHaveLength(11)
        expect(options.slice(1)).toEqual(
            EXEMPTION_REASONS.map(reason => ({ value: reason.key, label: reason.label }))
        )
    })

    it("matches the migration's exemption_reason select values", () => {
        const field = migrationField('2100000007_create_books_sales_tax.js', 'exemption_reason')
        expect(fieldValues(field)).toEqual([...EXEMPTION_REASON_KEYS])
    })
})

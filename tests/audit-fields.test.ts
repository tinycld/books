import * as zodSchemas from '@tinycld/core/types/pbZodSchema'
import { describe, expect, it } from 'vitest'
import { AUDIT_FIELDS, changedFieldRows } from '../tinycld/books/lib/audit-fields'
import { AUDIT_RECORD_TYPE_OPTIONS } from '../tinycld/books/lib/audit-log-fixture'

// Every audited collection's fields, as the generated zod schema (from the migrations)
// lists them: `books_tax_rates` → `booksTaxRatesSchema`.
function schemaFields(collection: string): string[] {
    const name = `${collection.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())}Schema`
    const schema = (zodSchemas as Record<string, unknown>)[name]
    if (!schema || typeof schema !== 'object' || !('shape' in schema)) {
        throw new Error(`no generated schema ${name} for ${collection}`)
    }
    return Object.keys(schema.shape as object).sort()
}

const AUDITED = AUDIT_RECORD_TYPE_OPTIONS.map(option => option.value)

// Keys core's audit diff carries that are never a person's change (spec §3 Events).
const INTERNAL_KEYS = ['sort_key', 'name_key', 'fields']

// Redacted by core for every reader (spec §5 Visibility rule).
const HIDDEN = [
    { collection: 'books_vendors', key: 'tax_id' },
    { collection: 'books_settings', key: 'tax_id' },
    { collection: 'books_estimates', key: 'public_token' },
]

describe('AUDIT_FIELDS against the generated schema', () => {
    it.each(
        AUDITED
    )('%s: every field has an entry, labelled in words, and no entry names a missing field', collection => {
        const fields = AUDIT_FIELDS[collection]
        expect(fields, `AUDIT_FIELDS has no map for ${collection}`).toBeDefined()
        expect(Object.keys(fields ?? {}).sort()).toEqual(schemaFields(collection))
        for (const [key, field] of Object.entries(fields ?? {})) {
            expect(field.label, `${collection}.${key}`).not.toBe('')
            expect(field.label, `${collection}.${key}`).not.toContain('_')
        }
    })

    // Only the collections that have such keys: for the others there is nothing to check.
    it.each(
        AUDITED.filter(collection =>
            INTERNAL_KEYS.some(key => schemaFields(collection).includes(key))
        )
    )('%s: sort keys, name keys and custom field JSON are internal', collection => {
        const fields = AUDIT_FIELDS[collection] ?? {}
        for (const key of INTERNAL_KEYS.filter(k => schemaFields(collection).includes(k))) {
            expect(fields[key]?.kind, `${collection}.${key}`).toBe('internal')
        }
    })

    it.each(HIDDEN)('$collection: $key is hidden', ({ collection, key }) => {
        expect(AUDIT_FIELDS[collection]?.[key]?.kind).toBe('hidden')
    })
})

// The credit memo's history (as the sales receipt's): its record and its lines are
// audited, and the memo's own fields read in words.
describe('the credit memo fields', () => {
    it('audits the credit memo and its lines', () => {
        expect(AUDITED).toContain('books_credit_memos')
        expect(AUDITED).toContain('books_credit_memo_lines')
    })

    it('names the invoice it credits and its unapplied credit', () => {
        const rows = changedFieldRows('books_credit_memos', {
            invoice: { before: '', after: 'invc1' },
            balance: { before: 0, after: 1_000 },
        })
        expect(rows.map(row => row.label).sort()).toEqual(['Invoice', 'Unapplied credit'])
    })
})

describe('a field with no entry', () => {
    it('reads its key in words', () => {
        const rows = changedFieldRows('books_not_audited', {
            due_date: { before: '', after: 'soon' },
        })
        expect(rows.map(row => row.label)).toEqual(['Due date'])
    })
})

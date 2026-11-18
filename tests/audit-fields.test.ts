import * as zodSchemas from '@tinycld/core/types/pbZodSchema'
import { describe, expect, it } from 'vitest'
import { AUDIT_FIELDS, changedFieldRows } from '../tinycld/books/lib/audit-fields'
import { recordTypeLabel } from '../tinycld/books/lib/audit-log'
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

// The vendor credit's history (vendor credit spec §3.12), as the bill's, the bill lines'
// and the bill payment lines': the credit, its lines and its applications are audited,
// and each field reads in words.
const VENDOR_CREDIT_COLLECTIONS = [
    'books_vendor_credits',
    'books_vendor_credit_lines',
    'books_vendor_credit_applications',
]

describe('the vendor credit fields', () => {
    it('audits the vendor credit, its lines and its applications', () => {
        expect(AUDITED).toEqual(expect.arrayContaining(VENDOR_CREDIT_COLLECTIONS))
        expect(recordTypeLabel('books_vendor_credits')).toBe('Vendor credit')
    })

    it.each(
        VENDOR_CREDIT_COLLECTIONS
    )('%s: every field of the generated schema has an entry, and no entry names a missing field', collection => {
        expect(Object.keys(AUDIT_FIELDS[collection] ?? {}).sort()).toEqual(schemaFields(collection))
    })

    it('names the vendor, the credit no. and the unapplied credit', () => {
        const rows = changedFieldRows('books_vendor_credits', {
            vendor: { before: '', after: 'vendpacificpw01' },
            ref_no: { before: '', after: 'CM-8841' },
            balance: { before: 0, after: 65_000 },
        })
        const labels = Object.fromEntries(rows.map(row => [row.key, row.label]))
        expect(labels.vendor).toBe('Vendor')
        expect(labels.ref_no).toMatch(/^Vendor[’']s credit no\.$/)
        expect(labels.balance).toBe('Unapplied credit')
        expect(AUDIT_FIELDS.books_vendor_credits?.vendor).toMatchObject({
            kind: 'relation',
            target: 'books_vendors',
        })
    })

    it('links a line and an application to their credit, and an application to its bill', () => {
        expect(AUDIT_FIELDS.books_vendor_credit_lines?.vendor_credit).toMatchObject({
            kind: 'relation',
            target: 'books_vendor_credits',
        })
        expect(AUDIT_FIELDS.books_vendor_credit_applications?.vendor_credit).toMatchObject({
            kind: 'relation',
            target: 'books_vendor_credits',
        })
        expect(AUDIT_FIELDS.books_vendor_credit_applications?.bill).toMatchObject({
            kind: 'relation',
            target: 'books_bills',
        })
        expect(AUDIT_FIELDS.books_vendor_credit_applications?.amount?.kind).toBe('money')
    })

    it('reads an entry of type vendor_credit as "Vendor credit"', () => {
        const options = AUDIT_FIELDS.books_journal_entries?.doc_type?.options ?? []
        expect(options).toContainEqual({ value: 'vendor_credit', label: 'Vendor credit' })
    })

    it('links an attachment to its vendor credit', () => {
        expect(AUDIT_FIELDS.books_attachments?.vendor_credit).toMatchObject({
            kind: 'relation',
            target: 'books_vendor_credits',
        })
    })
})

// The vendor refund's history (vendor refund spec §3.11), as the vendor credit's: the
// refund and its lines are audited, a line links to its refund and to the credit it
// refunds, and an entry of type vendor_refund reads "Vendor refund".
const VENDOR_REFUND_COLLECTIONS = ['books_vendor_refunds', 'books_vendor_refund_lines']

describe('the vendor refund fields', () => {
    it('audits the vendor refund and its lines', () => {
        expect(AUDITED).toEqual(expect.arrayContaining(VENDOR_REFUND_COLLECTIONS))
        expect(recordTypeLabel('books_vendor_refunds')).toBe('Vendor refund')
        expect(recordTypeLabel('books_vendor_refund_lines')).toBe('Vendor refund line')
    })

    it.each(
        VENDOR_REFUND_COLLECTIONS
    )('%s: every field of the generated schema has an entry, and no entry names a missing field', collection => {
        expect(Object.keys(AUDIT_FIELDS[collection] ?? {}).sort()).toEqual(schemaFields(collection))
    })

    it('links a refund to its vendor and Refunded to account, and a line to its refund and credit', () => {
        expect(AUDIT_FIELDS.books_vendor_refunds?.vendor).toMatchObject({
            kind: 'relation',
            target: 'books_vendors',
        })
        expect(AUDIT_FIELDS.books_vendor_refunds?.refunded_to).toMatchObject({
            kind: 'relation',
            target: 'books_accounts',
        })
        expect(AUDIT_FIELDS.books_vendor_refunds?.amount?.kind).toBe('money')
        expect(AUDIT_FIELDS.books_vendor_refund_lines?.refund).toMatchObject({
            kind: 'relation',
            target: 'books_vendor_refunds',
        })
        expect(AUDIT_FIELDS.books_vendor_refund_lines?.vendor_credit).toMatchObject({
            kind: 'relation',
            target: 'books_vendor_credits',
        })
        expect(AUDIT_FIELDS.books_vendor_refund_lines?.amount?.kind).toBe('money')
    })

    it('reads an entry of type vendor_refund as "Vendor refund"', () => {
        const options = AUDIT_FIELDS.books_journal_entries?.doc_type?.options ?? []
        expect(options).toContainEqual({ value: 'vendor_refund', label: 'Vendor refund' })
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

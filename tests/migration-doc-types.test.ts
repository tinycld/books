import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DOC_TYPE } from '../tinycld/books/lib/audit-fields'
import { ROUTED_DOC_TYPES } from '../tinycld/books/lib/audit-record-route'
import { fieldValues, migrationFields } from './migration-field'

// Carried check 1 (vendor credit spec, checkpoint 1): every doc_type a migration lets a
// row hold reads in words in a record's history (DOC_TYPE of lib/audit-fields.ts), and
// every journal entry doc_type opens where entryHref says (ROUTED_DOC_TYPES of
// lib/audit-record-route.ts). A doc type added to a migration and not to those lists
// fails here.

const MIGRATIONS = readdirSync(join(__dirname, '..', 'pb-migrations'))
    .filter(file => file.endsWith('.js'))
    .sort()

// Every select field named doc_type in pb-migrations/, with its collection and values.
function docTypeSelects() {
    return MIGRATIONS.flatMap(file =>
        migrationFields(file, 'doc_type')
            .filter(({ field }) => /type:\s*'select'/.test(field))
            .map(({ collection, field }) => ({ file, collection, values: fieldValues(field) }))
    )
}

function valuesOf(collection: string): string[] {
    return docTypeSelects()
        .filter(select => select.collection === collection)
        .flatMap(select => select.values)
}

describe('doc_type select values against the client lists', () => {
    it('finds the doc_type selects of the sequences and the journal entries', () => {
        const collections = docTypeSelects().map(select => select.collection)
        expect(collections).toContain('books_doc_sequences')
        expect(collections).toContain('books_journal_entries')
    })

    it('labels every doc_type value of every migration in DOC_TYPE (lib/audit-fields.ts)', () => {
        const labelled = new Set((DOC_TYPE ?? []).map(option => option.value))
        const missing = docTypeSelects().flatMap(select =>
            select.values
                .filter(value => !labelled.has(value))
                .map(value => `${select.file} ${select.collection}: ${value}`)
        )
        expect(missing).toEqual([])
    })

    it('routes every journal entry doc_type in ROUTED_DOC_TYPES (lib/audit-record-route.ts)', () => {
        const routed = new Set(ROUTED_DOC_TYPES ?? [])
        const missing = valuesOf('books_journal_entries').filter(value => !routed.has(value))
        expect(missing).toEqual([])
    })

    it('holds vendor_credit in both selects, in DOC_TYPE and in ROUTED_DOC_TYPES', () => {
        expect(valuesOf('books_doc_sequences')).toContain('vendor_credit')
        expect(valuesOf('books_journal_entries')).toContain('vendor_credit')
        expect(DOC_TYPE).toContainEqual({ value: 'vendor_credit', label: 'Vendor credit' })
        expect(ROUTED_DOC_TYPES).toContain('vendor_credit')
    })

    // Vendor refund spec §4: migrations 2100000001 and 2100000002 are edited in place.
    it('holds vendor_refund in both selects, in DOC_TYPE and in ROUTED_DOC_TYPES', () => {
        expect(valuesOf('books_doc_sequences')).toContain('vendor_refund')
        expect(valuesOf('books_journal_entries')).toContain('vendor_refund')
        expect(DOC_TYPE).toContainEqual({ value: 'vendor_refund', label: 'Vendor refund' })
        expect(ROUTED_DOC_TYPES).toContain('vendor_refund')
    })

    // Refund receipt spec §4.1: migrations 2100000001 and 2100000002 are edited in place.
    it('holds refund_receipt in both selects, in DOC_TYPE and in ROUTED_DOC_TYPES', () => {
        expect(valuesOf('books_doc_sequences')).toContain('refund_receipt')
        expect(valuesOf('books_journal_entries')).toContain('refund_receipt')
        expect(DOC_TYPE).toContainEqual({ value: 'refund_receipt', label: 'Refund receipt' })
        expect(ROUTED_DOC_TYPES).toContain('refund_receipt')
    })

    // Write-off spec §4.1: migrations 2100000001 and 2100000002 are edited in place.
    it('holds write_off in both selects, in DOC_TYPE and in ROUTED_DOC_TYPES', () => {
        expect(valuesOf('books_doc_sequences')).toContain('write_off')
        expect(valuesOf('books_journal_entries')).toContain('write_off')
        expect(DOC_TYPE).toContainEqual({ value: 'write_off', label: 'Write-off' })
        expect(ROUTED_DOC_TYPES).toContain('write_off')
    })
})

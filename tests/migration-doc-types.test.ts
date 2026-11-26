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

const SETTINGS_MIGRATION = '2100000001_create_books_settings.js'
const SENDS_MIGRATION = '2100000034_create_books_document_sends.js'
const PURCHASE_ORDERS_MIGRATION = '2100000048_create_books_purchase_orders.js'

// The literal values list of each doc_type field that one migration declares on one
// collection (a field with no literal list, such as a down step's filter, has none).
function docTypeValuesIn(file: string, collection: string): string[][] {
    return migrationFields(file, 'doc_type')
        .filter(declared => declared.collection === collection)
        .flatMap(({ field }) => (/values:\s*\[\s*'/.test(field) ? [fieldValues(field)] : []))
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

    // Bank deposit spec §4.1: migrations 2100000001 and 2100000002 are edited in place.
    it('holds deposit in both selects, in DOC_TYPE and in ROUTED_DOC_TYPES', () => {
        expect(valuesOf('books_doc_sequences')).toContain('deposit')
        expect(valuesOf('books_journal_entries')).toContain('deposit')
        expect(DOC_TYPE).toContainEqual({ value: 'deposit', label: 'Deposit' })
        expect(ROUTED_DOC_TYPES).toContain('deposit')
    })

    // Three collections repeat the journal entry doc_type list (books_journal_lines in
    // 2100000002, books_cash_basis_lines in 2100000021, books_deposit_items in 2100000037);
    // a new doc type left out of one drifts silently, so each must hold exactly the
    // journal entry values. books_document_sends has its own shorter list.
    it('repeats the journal entry doc_type values in the line and view selects', () => {
        const entryValues = [...valuesOf('books_journal_entries')].sort()
        const views = docTypeSelects().filter(select =>
            ['books_journal_lines', 'books_cash_basis_lines', 'books_deposit_items'].includes(
                select.collection
            )
        )
        expect(views.map(select => select.collection).sort()).toEqual([
            'books_cash_basis_lines',
            'books_deposit_items',
            'books_journal_lines',
        ])
        for (const view of views) {
            expect([...view.values].sort(), `${view.file} ${view.collection}`).toEqual(entryValues)
        }
    })

    // Purchase order spec §4: Books v0.0.1 shipped 2100000001 (the sequence) and
    // 2100000034 (the document sends), so they stay as released and the unit's own
    // migration 2100000048 declares each doc_type again (PocketBase's fields.add replaces
    // a field by name) with the shipped values and purchase_order. A purchase order never
    // posts, so no journal entry, line or view select holds it.
    it('adds purchase_order to the sequence and send selects in 2100000048, not in the shipped migrations', () => {
        for (const [collection, shipped] of [
            ['books_doc_sequences', SETTINGS_MIGRATION],
            ['books_document_sends', SENDS_MIGRATION],
        ] as const) {
            const released = docTypeValuesIn(shipped, collection)
            expect(released, `${shipped} ${collection}`).toHaveLength(1)
            const before = released[0] ?? []
            expect(before, `${shipped} ${collection}`).not.toContain('purchase_order')
            expect(
                docTypeValuesIn(PURCHASE_ORDERS_MIGRATION, collection).map(values =>
                    [...values].sort()
                ),
                `${PURCHASE_ORDERS_MIGRATION} ${collection}`
            ).toContainEqual([...before, 'purchase_order'].sort())
        }
        expect(DOC_TYPE).toContainEqual({ value: 'purchase_order', label: 'Purchase order' })
        for (const ledger of [
            'books_journal_entries',
            'books_journal_lines',
            'books_cash_basis_lines',
            'books_deposit_items',
        ]) {
            expect(valuesOf(ledger), ledger).not.toContain('purchase_order')
        }
    })

    // Purchase order spec §4: a purchase order's send names its vendor. The optional
    // vendor relation of books_document_sends (cascade: deleting the vendor deletes its
    // sends) is added by 2100000048; the shipped 2100000034 has none.
    it('adds the optional cascading vendor relation of the sends in 2100000048, not in 2100000034', () => {
        expect(
            migrationFields(SENDS_MIGRATION, 'vendor').filter(
                declared => declared.collection === 'books_document_sends'
            )
        ).toEqual([])
        const added = migrationFields(PURCHASE_ORDERS_MIGRATION, 'vendor').filter(
            declared => declared.collection === 'books_document_sends'
        )
        expect(added).toHaveLength(1)
        const field = added[0]?.field ?? ''
        expect(field).toMatch(/cascadeDelete:\s*true/)
        expect(field).not.toMatch(/required:\s*true/)
    })

    // Inventory design (ADR 3): migrations 2100000001 and 2100000002 are edited in place;
    // 2100000021 (books_cash_basis_lines) and 2100000037 (books_deposit_items) were edited
    // too, as the other places that repeat the list (see the test above).
    it('holds inventory_adjustment in both selects, in DOC_TYPE and in ROUTED_DOC_TYPES', () => {
        expect(valuesOf('books_doc_sequences')).toContain('inventory_adjustment')
        expect(valuesOf('books_journal_entries')).toContain('inventory_adjustment')
        expect(DOC_TYPE).toContainEqual({
            value: 'inventory_adjustment',
            label: 'Inventory adjustment',
        })
        expect(ROUTED_DOC_TYPES).toContain('inventory_adjustment')
    })
})

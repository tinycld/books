import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { docTypeLabel, nextNumberPreview } from '../tinycld/books/lib/doc-types'
import { SETTINGS_SECTIONS, visibleSections } from '../tinycld/books/lib/settings-sections'

describe('numbering settings section', () => {
    it('is listed as "Numbering" and is not admin only', () => {
        const numbering = SETTINGS_SECTIONS.find(s => s.id === 'numbering')
        expect(numbering).toEqual({ id: 'numbering', label: 'Numbering', adminOnly: false })
    })

    it('shows to a non-admin after Accounting', () => {
        const ids = visibleSections(false).map(s => s.id)
        expect(ids).toContain('numbering')
        expect(ids.indexOf('numbering')).toBeGreaterThan(ids.indexOf('accounting'))
    })
})

// The values migration 2100000001 sets on the seeded books_doc_sequences row with this id:
// `<record>.set('id', '<id>')`, then that record's other `.set(...)` calls.
function seededSequence(id: string): Record<string, string> {
    const source = readFileSync(
        join(__dirname, '..', 'pb-migrations', '2100000001_create_books_settings.js'),
        'utf8'
    )
    const record = source.match(new RegExp(`(\\w+)\\.set\\('id', '${id}'\\)`))?.[1]
    if (!record) throw new Error(`migration 2100000001 seeds no sequence row ${id}`)
    const sets = source.matchAll(
        new RegExp(`\\b${record}\\.set\\('(\\w+)', ('[^']*'|\\d+)\\)`, 'g')
    )
    return Object.fromEntries([...sets].map(([, key, value]) => [key, value.replace(/'/g, '')]))
}

// Settings → Numbering draws one card per sequence row (vendor credit spec §3.12): the
// seeded `vendor_credit` row is the "Vendor credits" card, with no prefix, next 1001.
describe('the Vendor credits numbering card', () => {
    it('is seeded as booksseqvcredit: vendor_credit, no prefix, next 1001', () => {
        expect(seededSequence('booksseqvcredit')).toEqual({
            id: 'booksseqvcredit',
            doc_type: 'vendor_credit',
            prefix: '',
            next_number: '1001',
        })
    })

    it('reads "Vendor credits" and previews "Next vendor credit: 1001"', () => {
        const row = seededSequence('booksseqvcredit')
        expect(docTypeLabel(row.doc_type ?? '')).toBe('Vendor credits')
        expect(nextNumberPreview(row.doc_type ?? '', row.prefix ?? '', row.next_number ?? '')).toBe(
            'Next vendor credit: 1001'
        )
    })
})

// Vendor refund spec §3.11: the seeded `vendor_refund` row is the "Vendor refunds" card,
// with no prefix, next 1001.
describe('the Vendor refunds numbering card', () => {
    it('is seeded as booksseqvrefund: vendor_refund, no prefix, next 1001', () => {
        expect(seededSequence('booksseqvrefund')).toEqual({
            id: 'booksseqvrefund',
            doc_type: 'vendor_refund',
            prefix: '',
            next_number: '1001',
        })
    })

    it('reads "Vendor refunds" and previews "Next vendor refund: 1001"', () => {
        const row = seededSequence('booksseqvrefund')
        expect(docTypeLabel(row.doc_type ?? '')).toBe('Vendor refunds')
        expect(nextNumberPreview(row.doc_type ?? '', row.prefix ?? '', row.next_number ?? '')).toBe(
            'Next vendor refund: 1001'
        )
    })
})

// Refund receipt spec §4.1: the seeded `refund_receipt` row is the "Refund receipts"
// card, with no prefix, next 1001.
describe('the Refund receipts numbering card', () => {
    it('is seeded as booksseqrefundr: refund_receipt, no prefix, next 1001', () => {
        expect(seededSequence('booksseqrefundr')).toEqual({
            id: 'booksseqrefundr',
            doc_type: 'refund_receipt',
            prefix: '',
            next_number: '1001',
        })
    })

    it('reads "Refund receipts" and previews "Next refund receipt: 1001"', () => {
        const row = seededSequence('booksseqrefundr')
        expect(docTypeLabel(row.doc_type ?? '')).toBe('Refund receipts')
        expect(nextNumberPreview(row.doc_type ?? '', row.prefix ?? '', row.next_number ?? '')).toBe(
            'Next refund receipt: 1001'
        )
    })
})

// Write-off spec Q6: the seeded `write_off` row is the "Write-offs" card, with no prefix,
// next 1001.
describe('the Write-offs numbering card', () => {
    it('is seeded as booksseqwriteof: write_off, no prefix, next 1001', () => {
        expect(seededSequence('booksseqwriteof')).toEqual({
            id: 'booksseqwriteof',
            doc_type: 'write_off',
            prefix: '',
            next_number: '1001',
        })
    })

    it('reads "Write-offs" and previews "Next write-off: 1001"', () => {
        const row = seededSequence('booksseqwriteof')
        expect(docTypeLabel(row.doc_type ?? '')).toBe('Write-offs')
        expect(nextNumberPreview(row.doc_type ?? '', row.prefix ?? '', row.next_number ?? '')).toBe(
            'Next write-off: 1001'
        )
    })
})

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Carried check 2 (vendor credit spec, checkpoint 1): PocketBase runs migrations in file
// name order, and two files with one numeric prefix run in an order no one chose. The
// audit log view reads audit_logs, users (both core) and the line collections of its
// LINES list, so it runs after each migration that creates one of those line
// collections. A later migration that creates a collection the view does not read may
// run after it; each such migration is named below (bank-match spec §4 Schema: 30 is
// the bank matches). The vendor party balances rewrite creates no collection, so it
// may run before the audit view. A/R Aging (D8): the receivable items migration takes
// 2100000028, the number the write-off spec left free, after the payments and credit
// memos it reads. books_receivable_items is stored, not audited: only Books' posting
// writes it, and the audit log does not read it.

const MIGRATIONS_DIR = join(__dirname, '..', 'pb-migrations')

const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.js'))
    .sort()

const AUDIT = '2100000029_create_books_audit_log.js'

const AFTER_AUDIT = ['2100000030_create_books_bank_matches.js']

function prefixOf(file: string): string {
    return file.split('_')[0] ?? file
}

function numberOf(file: string | undefined): number {
    return file === undefined ? Number.NaN : Number(prefixOf(file))
}

function sourceOf(file: string): string {
    return readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
}

// The line collections the audit view reads: the first name of each row of its LINES list.
function auditLineCollections(): string[] {
    const list = /const LINES = \[([\s\S]*?)\n\]/.exec(sourceOf(AUDIT))?.[1] ?? ''
    return [...list.matchAll(/\[\s*'(books_\w+)'/g)].map(match => match[1] ?? '')
}

// The migrations that create the collection: those that give a collection its name.
function creatorsOf(collection: string): string[] {
    return MIGRATIONS.filter(file => sourceOf(file).includes(`name: '${collection}'`))
}

describe('pb-migrations prefixes', () => {
    it('gives every migration a numeric prefix before the first _', () => {
        expect(MIGRATIONS.length).toBeGreaterThan(0)
        expect(MIGRATIONS.filter(file => !/^\d+$/.test(prefixOf(file)))).toEqual([])
    })

    it('never gives two migrations the same numeric prefix', () => {
        const byPrefix = new Map<string, string[]>()
        for (const file of MIGRATIONS) {
            byPrefix.set(prefixOf(file), [...(byPrefix.get(prefixOf(file)) ?? []), file])
        }
        const shared = [...byPrefix.values()]
            .filter(files => files.length > 1)
            .map(files => files.join(' and '))
        expect(shared).toEqual([])
    })

    it('runs only the named later migrations after the audit log view', () => {
        const afterAudit = MIGRATIONS.filter(file => numberOf(file) > numberOf(AUDIT))
        expect(afterAudit).toEqual(AFTER_AUDIT)
    })

    it('runs the receivable items after the payments and the credit memos', () => {
        const receivable = MIGRATIONS.filter(file =>
            file.endsWith('_create_books_receivable_items.js')
        )
        expect(receivable).toHaveLength(1)
        const payments = MIGRATIONS.find(file => file.endsWith('_create_books_payments.js'))
        const creditMemos = MIGRATIONS.find(file => file.endsWith('_create_books_credit_memos.js'))
        expect(numberOf(receivable[0])).toBeGreaterThan(numberOf(payments))
        expect(numberOf(receivable[0])).toBeGreaterThan(numberOf(creditMemos))
    })

    it('runs the audit log view after every migration that creates a collection the view reads', () => {
        const lines = auditLineCollections()
        expect(lines).toContain('books_journal_lines')
        expect(lines).toContain('books_refund_receipt_lines')
        const lateOrMissing = lines.flatMap(collection => {
            const creators = creatorsOf(collection)
            if (creators.length === 0) return [`${collection}: no migration creates it`]
            return creators
                .filter(file => numberOf(file) >= numberOf(AUDIT))
                .map(file => `${collection}: ${file}`)
        })
        expect(lateOrMissing).toEqual([])
    })

    // Vendor credit spec §4: the vendor credits take 2100000023. Vendor refund spec §4:
    // the vendor refunds take 2100000024. Refund receipt spec §4.1: the refund receipts
    // take 2100000025. Vendor pages spec §4: the party balances view gains its vendor rows
    // in 2100000026. Write-off spec §4.1: the write-offs take 2100000027, 2100000028 stays
    // free for p5-ar-aging, and the audit view moves to 2100000029. A/R Aging spec: the
    // receivable items take 2100000028. Bank-match spec §4 Schema: the bank matches take
    // 2100000030, after the audit log, because the view reads none of their collections.
    it('holds the vendor credits at 2100000023, the vendor refunds at 2100000024, the refund receipts at 2100000025, the vendor party balances at 2100000026, the write-offs at 2100000027 and the receivable items at 2100000028, before the audit log at 2100000029, and the bank matches at 2100000030 after it', () => {
        expect(MIGRATIONS).toContain('2100000023_create_books_vendor_credits.js')
        expect(MIGRATIONS).toContain('2100000024_create_books_vendor_refunds.js')
        expect(MIGRATIONS).toContain('2100000025_create_books_refund_receipts.js')
        expect(MIGRATIONS).toContain('2100000026_add_vendor_party_balances.js')
        expect(MIGRATIONS).toContain('2100000027_create_books_write_offs.js')
        expect(MIGRATIONS.filter(file => prefixOf(file) === '2100000028')).toEqual([
            '2100000028_create_books_receivable_items.js',
        ])
        expect(MIGRATIONS).toContain(AUDIT)
        expect(MIGRATIONS).not.toContain('2100000025_create_books_audit_log.js')
        expect(MIGRATIONS).not.toContain('2100000027_create_books_audit_log.js')
        expect(MIGRATIONS.slice(MIGRATIONS.indexOf(AUDIT) + 1)).toEqual([
            '2100000030_create_books_bank_matches.js',
        ])
        const matches = sourceOf('2100000030_create_books_bank_matches.js')
        const read = auditLineCollections().filter(collection =>
            matches.includes(`name: '${collection}'`)
        )
        expect(read).toEqual([])
    })
})

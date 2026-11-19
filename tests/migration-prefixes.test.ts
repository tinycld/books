import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Carried check 2 (vendor credit spec, checkpoint 1): PocketBase runs migrations in file
// name order, and two files with one numeric prefix run in an order no one chose. The
// audit log view reads every audited collection, so it runs after each migration that
// creates one, and last. The vendor party balances rewrite creates no collection, so it
// may run before the audit view.

const MIGRATIONS = readdirSync(join(__dirname, '..', 'pb-migrations'))
    .filter(file => file.endsWith('.js'))
    .sort()

function prefixOf(file: string): string {
    return file.split('_')[0] ?? file
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

    it('runs the audit log view last', () => {
        const highest = MIGRATIONS.reduce((top, file) =>
            Number(prefixOf(file)) > Number(prefixOf(top)) ? file : top
        )
        expect(highest).toMatch(/^\d+_create_books_audit_log\.js$/)
    })

    it('runs the audit log view after every migration that creates a collection', () => {
        const audit = '2100000029_create_books_audit_log.js'
        const createsAfterAudit = MIGRATIONS.filter(
            file =>
                file !== audit &&
                file.includes('_create_') &&
                Number(prefixOf(file)) >= Number(prefixOf(audit))
        )
        expect(createsAfterAudit).toEqual([])
    })

    // Vendor credit spec §4: the vendor credits take 2100000023. Vendor refund spec §4:
    // the vendor refunds take 2100000024. Refund receipt spec §4.1: the refund receipts
    // take 2100000025 and the audit view moves to 2100000027, the highest. Vendor pages
    // spec §4: the party balances view gains its vendor rows in 2100000026. Write-off spec
    // §4.1: the write-offs take 2100000027, no migration takes 2100000028, and the audit
    // view moves to 2100000029, the highest.
    it('holds the vendor credits at 2100000023, the vendor refunds at 2100000024, the refund receipts at 2100000025, the vendor party balances at 2100000026 and the write-offs at 2100000027, before the audit log at 2100000029', () => {
        expect(MIGRATIONS).toContain('2100000023_create_books_vendor_credits.js')
        expect(MIGRATIONS).toContain('2100000024_create_books_vendor_refunds.js')
        expect(MIGRATIONS).toContain('2100000025_create_books_refund_receipts.js')
        expect(MIGRATIONS).toContain('2100000026_add_vendor_party_balances.js')
        expect(MIGRATIONS).toContain('2100000027_create_books_write_offs.js')
        expect(MIGRATIONS.filter(file => prefixOf(file) === '2100000028')).toEqual([])
        expect(MIGRATIONS).toContain('2100000029_create_books_audit_log.js')
        expect(MIGRATIONS).not.toContain('2100000027_create_books_audit_log.js')
        expect(MIGRATIONS[MIGRATIONS.length - 1]).toBe('2100000029_create_books_audit_log.js')
    })
})

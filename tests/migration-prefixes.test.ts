import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Carried check 2 (vendor credit spec, checkpoint 1): PocketBase runs migrations in file
// name order, and two files with one numeric prefix run in an order no one chose. The
// audit log view reads every audited collection, so it runs after each migration that
// creates one, and last among them. The vendor party balances rewrite creates no
// collection, so it may run before the audit view. A/R Aging (D8): the receivable items
// migration comes after it and creates no audited collection (only Books' posting
// writes books_receivable_items, and the audit log does not read it).

const MIGRATIONS = readdirSync(join(__dirname, '..', 'pb-migrations'))
    .filter(file => file.endsWith('.js'))
    .sort()

// The migrations that may run after the audit log view, by name suffix: each creates
// no audited collection.
const NOT_AUDITED_AFTER = ['_create_books_receivable_items.js']

const isNotAuditedAfter = (file: string) => NOT_AUDITED_AFTER.some(suffix => file.endsWith(suffix))

const AUDITED_ORDER = MIGRATIONS.filter(file => !isNotAuditedAfter(file))

function prefixOf(file: string): string {
    return file.split('_')[0] ?? file
}

function numberOf(file: string | undefined): number {
    return file === undefined ? Number.NaN : Number(prefixOf(file))
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

    it('runs the audit log view after every audited collection', () => {
        const highest = AUDITED_ORDER.reduce((top, file) =>
            Number(prefixOf(file)) > Number(prefixOf(top)) ? file : top
        )
        expect(highest).toMatch(/^\d+_create_books_audit_log\.js$/)

        const receivable = MIGRATIONS.filter(file =>
            file.endsWith('_create_books_receivable_items.js')
        )
        expect(receivable).toHaveLength(1)
        const payments = MIGRATIONS.find(file => file.endsWith('_create_books_payments.js'))
        const creditMemos = MIGRATIONS.find(file => file.endsWith('_create_books_credit_memos.js'))
        expect(numberOf(receivable[0])).toBeGreaterThan(numberOf(payments))
        expect(numberOf(receivable[0])).toBeGreaterThan(numberOf(creditMemos))
    })

    it('runs the audit log view after every migration that creates a collection', () => {
        const audit = '2100000027_create_books_audit_log.js'
        const createsAfterAudit = MIGRATIONS.filter(
            file =>
                file !== audit &&
                !isNotAuditedAfter(file) &&
                file.includes('_create_') &&
                Number(prefixOf(file)) >= Number(prefixOf(audit))
        )
        expect(createsAfterAudit).toEqual([])
    })

    // Vendor credit spec §4: the vendor credits take 2100000023. Vendor refund spec §4:
    // the vendor refunds take 2100000024. Refund receipt spec §4.1: the refund receipts
    // take 2100000025 and the audit view moves to 2100000027, the highest. Vendor pages
    // spec §4: the party balances view gains its vendor rows in 2100000026.
    it('holds the vendor credits at 2100000023, the vendor refunds at 2100000024, the refund receipts at 2100000025 and the vendor party balances at 2100000026, before the audit log at 2100000027', () => {
        expect(MIGRATIONS).toContain('2100000023_create_books_vendor_credits.js')
        expect(MIGRATIONS).toContain('2100000024_create_books_vendor_refunds.js')
        expect(MIGRATIONS).toContain('2100000025_create_books_refund_receipts.js')
        expect(MIGRATIONS).toContain('2100000026_add_vendor_party_balances.js')
        expect(MIGRATIONS).toContain('2100000027_create_books_audit_log.js')
        expect(MIGRATIONS).not.toContain('2100000025_create_books_audit_log.js')
        expect(AUDITED_ORDER[AUDITED_ORDER.length - 1]).toBe('2100000027_create_books_audit_log.js')
    })
})

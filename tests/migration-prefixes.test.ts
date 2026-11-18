import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Carried check 2 (vendor credit spec, checkpoint 1): PocketBase runs migrations in file
// name order, and two files with one numeric prefix run in an order no one chose. The
// audit log view reads every audited collection, so it must run after each migration
// that creates one. A/R Aging (D8): the receivable items views come after it, and
// create no audited collection (nobody writes a view).

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

    // Vendor credit spec §4: the vendor credits take 2100000023. Vendor refund spec §4:
    // the vendor refunds take 2100000024 and the audit view moves to 2100000025, the
    // highest.
    it('holds the vendor credits at 2100000023 and the vendor refunds at 2100000024, before the audit log at 2100000025', () => {
        expect(MIGRATIONS).toContain('2100000023_create_books_vendor_credits.js')
        expect(MIGRATIONS).toContain('2100000024_create_books_vendor_refunds.js')
        expect(MIGRATIONS).toContain('2100000025_create_books_audit_log.js')
        expect(MIGRATIONS).not.toContain('2100000024_create_books_audit_log.js')
        expect(AUDITED_ORDER[AUDITED_ORDER.length - 1]).toBe('2100000025_create_books_audit_log.js')
    })
})

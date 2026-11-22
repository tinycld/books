import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Carried check 2 (vendor credit spec, checkpoint 1): PocketBase runs migrations in file
// name order, and two files with one numeric prefix run in an order no one chose. The
// audit log view reads audit_logs, users (both core) and the line collections of its
// LINES list, so it runs after each migration that creates one of those line
// collections. A later migration that creates a collection the view does not read may
// run after it; each such migration is named in AFTER_AUDIT (the bank matches at 30 came
// before the credit memo applications at 31, whose lines the view reads, so the view moved
// to 32, then to 34). Vendor Balance (D17, amendment 2): the books_journal_lines
// (account, posted, vendor, date) index takes 2100000032, the number the audit view left
// free when it moved to 34, because it adds an index and creates no collection the view
// reads. Bank-categorize spec §4 Schema: the bank categorizations take 2100000035, after
// the audit view, which reads none of their collections; Books 0.1.0 is unreleased, and
// the view does not move. The vendor party balances rewrite creates no collection, so it
// may run before the audit view. A/R Aging (D8): the receivable items migration takes
// 2100000028, the number the write-off spec left free, after the payments and credit
// memos it reads. books_receivable_items is stored, not audited: only Books' posting
// writes it, and the audit log does not read it. A/P Aging (D1): the payable items
// migration takes 2100000029, the number left free between the receivable items and the
// bank matches, after the bills, bill payments, vendor credits and vendor refunds it
// reads; books_payable_items is stored, not audited, and the audit view does not read it.
// Expenses by Vendor (D11): the covering line indexes take 2100000036, after the audit
// view, because they add indexes only and create no collection the view reads.
// Reconcile spec §4 Schema: the reconciliations take the next free number at build time,
// after the audit view, which reads none of their collections (books_reconciliations is
// audited through the audit_logs rows the core audit writes, not through the view's LINES).
// The number is not named here: the file is found by its suffix, so a rename to the next
// free number before the unit merges changes no test.

const MIGRATIONS_DIR = join(__dirname, '..', 'pb-migrations')

const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.js'))
    .sort()

const AUDIT = '2100000034_create_books_audit_log.js'

const RECONCILE_SUFFIX = '_create_books_reconciliations.js'

const RECONCILE = MIGRATIONS.filter(file => file.endsWith(RECONCILE_SUFFIX))

const AFTER_AUDIT: string[] = [
    '2100000035_create_books_bank_categorizations.js',
    '2100000036_index_books_lines_account_date_covering.js',
    ...RECONCILE,
]

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
        expect(RECONCILE).toHaveLength(1)
        const afterAudit = MIGRATIONS.filter(file => numberOf(file) > numberOf(AUDIT))
        expect(afterAudit).toEqual(AFTER_AUDIT)
    })

    it('runs the reconciliations after the audit log view, which reads none of their collections', () => {
        expect(RECONCILE).toHaveLength(1)
        const reconcile = RECONCILE[0] ?? ''
        expect(numberOf(reconcile)).toBeGreaterThan(numberOf(AUDIT))
        const source = sourceOf(reconcile)
        const read = auditLineCollections().filter(collection =>
            source.includes(`name: '${collection}'`)
        )
        expect(read).toEqual([])
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

    it('runs the payable items after the bills, the bill payments, the vendor credits and the vendor refunds, and before the audit log view', () => {
        const payable = MIGRATIONS.filter(file => file.endsWith('_create_books_payable_items.js'))
        expect(payable).toHaveLength(1)
        const reads = [
            '_create_books_bills.js',
            '_create_books_bill_payments.js',
            '_create_books_vendor_credits.js',
            '_create_books_vendor_refunds.js',
        ].map(suffix => MIGRATIONS.find(file => file.endsWith(suffix)))
        expect(reads.every(file => file !== undefined)).toBe(true)
        for (const file of reads) {
            expect(numberOf(payable[0])).toBeGreaterThan(numberOf(file))
        }
        expect(numberOf(payable[0])).toBeLessThan(numberOf(AUDIT))
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
    // 2100000030; the view reads none of their collections. Apply credit spec §4.1: the
    // credit memo applications take 2100000031, and because the view reads their lines,
    // the audit view moved to 2100000032. A/P Aging spec §4.1: the payable items take
    // 2100000029. Statements spec §4.2 (Q21): the statements take 2100000033, and the audit
    // view moves to 2100000034, the highest, with no change of content.
    it('holds the vendor credits at 2100000023, the vendor refunds at 2100000024, the refund receipts at 2100000025, the vendor party balances at 2100000026, the write-offs at 2100000027, the receivable items at 2100000028, the payable items at 2100000029, the bank matches at 2100000030, the credit memo applications at 2100000031 and the statements at 2100000033, before the audit log at 2100000034', () => {
        expect(MIGRATIONS).toContain('2100000023_create_books_vendor_credits.js')
        expect(MIGRATIONS).toContain('2100000024_create_books_vendor_refunds.js')
        expect(MIGRATIONS).toContain('2100000025_create_books_refund_receipts.js')
        expect(MIGRATIONS).toContain('2100000026_add_vendor_party_balances.js')
        expect(MIGRATIONS).toContain('2100000027_create_books_write_offs.js')
        expect(MIGRATIONS.filter(file => prefixOf(file) === '2100000028')).toEqual([
            '2100000028_create_books_receivable_items.js',
        ])
        expect(MIGRATIONS.filter(file => prefixOf(file) === '2100000029')).toEqual([
            '2100000029_create_books_payable_items.js',
        ])
        expect(MIGRATIONS.filter(file => prefixOf(file) === '2100000030')).toEqual([
            '2100000030_create_books_bank_matches.js',
        ])
        expect(MIGRATIONS.filter(file => prefixOf(file) === '2100000031')).toEqual([
            '2100000031_create_books_credit_memo_applications.js',
        ])
        expect(MIGRATIONS.filter(file => prefixOf(file) === '2100000033')).toEqual([
            '2100000033_create_books_statements.js',
        ])
        expect(MIGRATIONS).toContain(AUDIT)
        expect(MIGRATIONS).not.toContain('2100000032_create_books_audit_log.js')
        expect(MIGRATIONS).not.toContain('2100000025_create_books_audit_log.js')
        expect(MIGRATIONS).not.toContain('2100000027_create_books_audit_log.js')
        expect(MIGRATIONS).not.toContain('2100000029_create_books_audit_log.js')
        expect(MIGRATIONS).not.toContain('2100000030_create_books_audit_log.js')
        expect(MIGRATIONS.filter(file => !AFTER_AUDIT.includes(file)).at(-1)).toBe(AUDIT)
        const matches = sourceOf('2100000030_create_books_bank_matches.js')
        const read = auditLineCollections().filter(collection =>
            matches.includes(`name: '${collection}'`)
        )
        expect(read).toEqual([])
        expect(auditLineCollections()).toContain('books_credit_memo_applications')
    })
})

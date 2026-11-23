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
// view then at 2100000034, because they add indexes only and create no collection the
// view reads; the bank deposits then moved the view above them. Email and share (plan
// decisions 1 and 2): the document sends take 2100000034, the number the view left free,
// and the view at 2100000038 reads them as a line collection, so they run before it.
// Reconcile spec §4 Schema: the reconciliations take the next free number at build time,
// after the audit view, which reads none of their collections (books_reconciliations is
// audited through the audit_logs rows the core audit writes, not through the view's LINES).
// The number is not named here: the file is found by its suffix, so a rename to the next
// free number before the unit merges changes no test.

const MIGRATIONS_DIR = join(__dirname, '..', 'pb-migrations')

const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.js'))
    .sort()

// Bank deposit spec §4.1: the deposits take the next free number, 2100000037, because the
// Expenses by Vendor indexes landed first at 2100000036. The view reads the deposits'
// items and lines, so the audit view moves to 2100000038, the highest, after the bank
// categorizations and the covering indexes too.
const AUDIT = '2100000038_create_books_audit_log.js'

const RECONCILE_SUFFIX = '_create_books_reconciliations.js'

const RECONCILE = MIGRATIONS.filter(file => file.endsWith(RECONCILE_SUFFIX))

// Reconciliation report spec §4 Schema: the finisher's name, the undo rule and the
// reconciled lines view take the next free number after the reconciliations. The view
// reads books_reconciliation_lines, books_reconciliations, the journal lines and entries
// and the parties; the audit view reads none of what it creates.
const REPORT_SUFFIX = '_books_reconciliation_report.js'

const REPORT = MIGRATIONS.filter(file => file.endsWith(REPORT_SUFFIX))

// Dashboard spec §4 "New views": the two dashboard views take the next free number after
// the reconciliation report. They read books_invoices and books_payments; the audit view
// reads neither dashboard view, so they may run after it.
const DASHBOARD_SUFFIX = '_create_books_dashboard_views.js'

const DASHBOARD = MIGRATIONS.filter(file => file.endsWith(DASHBOARD_SUFFIX))

// Sidebar shortcuts: one user's own screen arrangement takes the next free number after the
// dashboard views. It is not audited and the audit view reads nothing of it.
const SHORTCUTS_SUFFIX = '_create_books_sidebar_shortcuts.js'

const SHORTCUTS = MIGRATIONS.filter(file => file.endsWith(SHORTCUTS_SUFFIX))

const AFTER_AUDIT: string[] = [...RECONCILE, ...REPORT, ...DASHBOARD, ...SHORTCUTS]

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
        expect(REPORT).toHaveLength(1)
        expect(numberOf(REPORT[0])).toBeGreaterThan(numberOf(RECONCILE[0]))
        expect(DASHBOARD).toHaveLength(1)
        expect(numberOf(DASHBOARD[0])).toBeGreaterThan(numberOf(REPORT[0]))
        expect(SHORTCUTS).toHaveLength(1)
        expect(numberOf(SHORTCUTS[0])).toBeGreaterThan(numberOf(DASHBOARD[0]))
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
    // 2100000029. Statements spec §4.2 (Q21): the statements take 2100000033. Bank-deposit
    // spec: the deposits take 2100000037, and because the view reads their item and line
    // rows, the audit view moves to 2100000038, the highest.
    it('holds the vendor credits at 2100000023, the vendor refunds at 2100000024, the refund receipts at 2100000025, the vendor party balances at 2100000026, the write-offs at 2100000027, the receivable items at 2100000028, the payable items at 2100000029, the bank matches at 2100000030, the credit memo applications at 2100000031 and the statements at 2100000033, before the audit log at 2100000038', () => {
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

    it('holds the covering indexes at 2100000036 and the deposits at 2100000037, before the audit log at 2100000038, which reads their items and lines', () => {
        expect(MIGRATIONS.filter(file => prefixOf(file) === '2100000036')).toEqual([
            '2100000036_index_books_lines_account_date_covering.js',
        ])
        expect(MIGRATIONS.filter(file => prefixOf(file) === '2100000037')).toEqual([
            '2100000037_create_books_deposits.js',
        ])
        expect(MIGRATIONS.filter(file => prefixOf(file) === '2100000038')).toEqual([AUDIT])
        expect(MIGRATIONS).not.toContain('2100000034_create_books_audit_log.js')
        expect(MIGRATIONS).not.toContain('2100000037_create_books_audit_log.js')
        expect(numberOf(AUDIT)).toBeGreaterThan(numberOf('2100000037_create_books_deposits.js'))
        expect(MIGRATIONS.filter(file => !AFTER_AUDIT.includes(file)).at(-1)).toBe(AUDIT)
        expect(auditLineCollections()).toEqual(
            expect.arrayContaining(['books_deposit_items', 'books_deposit_lines'])
        )
    })

    // Email-share plan decision 1: the document sends take 2100000034, the number the
    // audit view left free, and the view at 2100000038 reads them (plan decision 2), so
    // the sends run before it.
    it('holds the document sends at 2100000034, before the audit log at 2100000038, which reads them', () => {
        expect(MIGRATIONS.filter(file => prefixOf(file) === '2100000034')).toEqual([
            '2100000034_create_books_document_sends.js',
        ])
        expect(creatorsOf('books_document_sends')).toEqual([
            '2100000034_create_books_document_sends.js',
        ])
        expect(numberOf('2100000034_create_books_document_sends.js')).toBeLessThan(numberOf(AUDIT))
        expect(auditLineCollections()).toContain('books_document_sends')
    })
})

import * as zodSchemas from '@tinycld/core/types/pbZodSchema'
import { describe, expect, it } from 'vitest'
import {
    AUDIT_FIELDS,
    changedFieldRows,
    DOC_TYPE,
    eventWords,
} from '../tinycld/books/lib/audit-fields'
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

// Apply credit spec §3.8: a credit memo's applications are audited, link to the memo
// and the invoice, and their added and deleted events read as the credit's words.
describe('the credit memo application fields', () => {
    it('audits the applications, every field of the generated schema has an entry', () => {
        expect(AUDITED).toContain('books_credit_memo_applications')
        expect(recordTypeLabel('books_credit_memo_applications')).toBe('Credit memo application')
        expect(Object.keys(AUDIT_FIELDS.books_credit_memo_applications ?? {}).sort()).toEqual(
            schemaFields('books_credit_memo_applications')
        )
    })

    it('links an application to its credit memo and its invoice, and reads its amount as money', () => {
        expect(AUDIT_FIELDS.books_credit_memo_applications?.credit_memo).toMatchObject({
            kind: 'relation',
            target: 'books_credit_memos',
            label: 'Credit memo',
        })
        expect(AUDIT_FIELDS.books_credit_memo_applications?.invoice).toMatchObject({
            kind: 'relation',
            target: 'books_invoices',
            label: 'Invoice',
        })
        expect(AUDIT_FIELDS.books_credit_memo_applications?.amount).toMatchObject({
            kind: 'money',
            label: 'Credit applied',
        })
        expect(AUDIT_FIELDS.books_credit_memo_applications?.date?.label).toBe('Apply date')
    })

    it('reads an application added as "Credit applied" and deleted as "Credit removed"', () => {
        expect(eventWords('added', 'books_credit_memo_applications')).toBe('Credit applied')
        expect(eventWords('deleted', 'books_credit_memo_applications')).toBe('Credit removed')
    })

    it('keeps the words of every other event and collection', () => {
        expect(eventWords('added')).toBe('Added')
        expect(eventWords('deleted', 'books_vendor_credit_applications')).toBe('Deleted')
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

// The write-off's history (write-off spec §3.6): the write-off is audited as "Write-off",
// links to its invoice, customer and account, and an entry of type write_off reads
// "Write-off".
describe('the write-off fields', () => {
    it('audits the write-off as "Write-off"', () => {
        expect(AUDITED).toContain('books_write_offs')
        expect(recordTypeLabel('books_write_offs')).toBe('Write-off')
    })

    it('has an entry for every field of the generated schema, and no entry names a missing field', () => {
        expect(Object.keys(AUDIT_FIELDS.books_write_offs ?? {}).sort()).toEqual(
            schemaFields('books_write_offs')
        )
    })

    it('links a write-off to its invoice, customer and account, and reads its amount as money', () => {
        expect(AUDIT_FIELDS.books_write_offs?.invoice).toMatchObject({
            kind: 'relation',
            target: 'books_invoices',
        })
        expect(AUDIT_FIELDS.books_write_offs?.customer).toMatchObject({
            kind: 'relation',
            target: 'books_customers',
        })
        expect(AUDIT_FIELDS.books_write_offs?.account).toMatchObject({
            kind: 'relation',
            target: 'books_accounts',
        })
        expect(AUDIT_FIELDS.books_write_offs?.amount?.kind).toBe('money')
    })

    it('reads an entry of type write_off as "Write-off"', () => {
        expect(DOC_TYPE).toContainEqual({ value: 'write_off', label: 'Write-off' })
        const options = AUDIT_FIELDS.books_journal_entries?.doc_type?.options ?? []
        expect(options).toContainEqual({ value: 'write_off', label: 'Write-off' })
    })
})

// The deposit's history (bank deposit spec §3.7): the deposit, its items and its other
// funds lines are audited as "Deposit", "Deposit item" and "Deposit line"; each field
// reads in words, links where it names a record, and an entry of type deposit reads
// "Deposit".
const DEPOSIT_COLLECTIONS = ['books_deposits', 'books_deposit_items', 'books_deposit_lines']

describe('the deposit fields', () => {
    it('audits the deposit, its items and its lines', () => {
        expect(AUDITED).toEqual(expect.arrayContaining(DEPOSIT_COLLECTIONS))
        expect(recordTypeLabel('books_deposits')).toBe('Deposit')
        expect(recordTypeLabel('books_deposit_items')).toBe('Deposit item')
        expect(recordTypeLabel('books_deposit_lines')).toBe('Deposit line')
    })

    it.each(
        DEPOSIT_COLLECTIONS
    )('%s: has an entry for every field of the generated schema', collection => {
        expect(Object.keys(AUDIT_FIELDS[collection] ?? {}).sort()).toEqual(schemaFields(collection))
    })

    it('labels the deposit fields and links them to what they name', () => {
        const deposit = AUDIT_FIELDS.books_deposits
        expect(deposit?.deposit_to).toMatchObject({
            label: 'Deposit to',
            kind: 'relation',
            target: 'books_accounts',
        })
        expect(deposit?.entry).toMatchObject({ kind: 'relation', target: 'books_journal_entries' })
        expect(deposit?.replaces).toMatchObject({ kind: 'relation', target: 'books_deposits' })
        for (const money of ['total', 'items_total', 'lines_total']) {
            expect(deposit?.[money]?.kind, money).toBe('money')
        }
        expect(deposit?.sort_key?.kind).toBe('internal')
        const item = AUDIT_FIELDS.books_deposit_items
        expect(item?.line).toMatchObject({ kind: 'relation', target: 'books_journal_lines' })
        expect(item?.deposit).toMatchObject({ kind: 'relation', target: 'books_deposits' })
        expect(item?.amount?.kind).toBe('money')
        const line = AUDIT_FIELDS.books_deposit_lines
        expect(line?.account).toMatchObject({ kind: 'relation', target: 'books_accounts' })
        expect(line?.customer).toMatchObject({ kind: 'relation', target: 'books_customers' })
        expect(line?.vendor).toMatchObject({ kind: 'relation', target: 'books_vendors' })
        expect(line?.amount?.kind).toBe('money')
        expect(line?.description?.label).toBe('Description')
    })

    it('reads an entry of type deposit as "Deposit"', () => {
        expect(DOC_TYPE).toContainEqual({ value: 'deposit', label: 'Deposit' })
        const options = AUDIT_FIELDS.books_journal_entries?.doc_type?.options ?? []
        expect(options).toContainEqual({ value: 'deposit', label: 'Deposit' })
    })
})

// The refund receipt's history (as the credit memo's): the refund and its lines are
// audited, and an entry of type refund_receipt reads "Refund receipt".
const REFUND_RECEIPT_COLLECTIONS = ['books_refund_receipts', 'books_refund_receipt_lines']

describe('the refund receipt fields', () => {
    it('audits the refund receipt and its lines', () => {
        expect(AUDITED).toEqual(expect.arrayContaining(REFUND_RECEIPT_COLLECTIONS))
        expect(recordTypeLabel('books_refund_receipts')).toBe('Refund receipt')
        expect(recordTypeLabel('books_refund_receipt_lines')).toBe('Refund receipt line')
    })

    it.each(
        REFUND_RECEIPT_COLLECTIONS
    )('%s: every field of the generated schema has an entry, and no entry names a missing field', collection => {
        expect(Object.keys(AUDIT_FIELDS[collection] ?? {}).sort()).toEqual(schemaFields(collection))
    })

    it('reads an entry of type refund_receipt as "Refund receipt"', () => {
        const options = AUDIT_FIELDS.books_journal_entries?.doc_type?.options ?? []
        expect(options).toContainEqual({ value: 'refund_receipt', label: 'Refund receipt' })
        expect(DOC_TYPE).toContainEqual({ value: 'refund_receipt', label: 'Refund receipt' })
    })
})

// Bank-categorize spec §4: the categorization is audited as "Bank categorization", as the
// bank match is, and links to its bank transaction, its entry, its payee, its connection
// and who added it.
describe('the bank categorization fields', () => {
    it('audits the categorization as "Bank categorization"', () => {
        expect(AUDITED).toContain('books_bank_categorizations')
        expect(recordTypeLabel('books_bank_categorizations')).toBe('Bank categorization')
    })

    it('has an entry for every field of the generated schema, and no entry names a missing field', () => {
        expect(Object.keys(AUDIT_FIELDS.books_bank_categorizations ?? {}).sort()).toEqual(
            schemaFields('books_bank_categorizations')
        )
    })

    it('links a categorization to the records it names', () => {
        const fields = AUDIT_FIELDS.books_bank_categorizations
        expect(fields?.bank_transaction).toMatchObject({
            kind: 'relation',
            target: 'books_bank_transactions',
        })
        expect(fields?.entry).toMatchObject({ kind: 'relation', target: 'books_journal_entries' })
        expect(fields?.customer).toMatchObject({ kind: 'relation', target: 'books_customers' })
        expect(fields?.vendor).toMatchObject({ kind: 'relation', target: 'books_vendors' })
        expect(fields?.connection).toMatchObject({
            kind: 'relation',
            target: 'books_bank_connections',
        })
        expect(fields?.created_by).toMatchObject({ kind: 'relation', target: 'users' })
    })
})

// Reconcile spec §4 Server: a reconciliation is audited, so a start, a change of the
// statement information, a finish and a discard show in the audit log; its cleared rows
// are not (one row for each press).
describe('the reconciliation fields', () => {
    it('audits the reconciliation as "Reconciliation", and not its cleared rows', () => {
        expect(AUDITED).toContain('books_reconciliations')
        expect(AUDITED).not.toContain('books_reconciliation_lines')
        expect(AUDITED).not.toContain('books_reconcile_lines')
        expect(recordTypeLabel('books_reconciliations')).toBe('Reconciliation')
    })

    it('has an entry for every field of the generated schema, each labelled in words', () => {
        const fields = AUDIT_FIELDS.books_reconciliations
        expect(Object.keys(fields ?? {}).sort()).toEqual(schemaFields('books_reconciliations'))
        for (const [key, field] of Object.entries(fields ?? {})) {
            expect(field.label, key).not.toBe('')
            expect(field.label, key).not.toContain('_')
        }
    })

    it('links a reconciliation to its account and people, and reads its amounts as money and its dates as days', () => {
        const fields = AUDIT_FIELDS.books_reconciliations
        expect(fields?.account).toMatchObject({ kind: 'relation', target: 'books_accounts' })
        expect(fields?.created_by).toMatchObject({ kind: 'relation', target: 'users' })
        expect(fields?.finished_by).toMatchObject({ kind: 'relation', target: 'users' })
        expect(fields?.statement_date?.kind).toBe('day')
        expect(fields?.finished_at?.kind).toBe('datetime')
        for (const key of [
            'statement_balance',
            'beginning_balance',
            'statement_out',
            'statement_in',
            'cleared_out',
            'cleared_in',
        ]) {
            expect(fields?.[key]?.kind, key).toBe('money')
        }
        expect(fields?.status?.kind).toBe('select')
        expect(fields?.has_statement_totals?.kind).toBe('bool')
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

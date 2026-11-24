import { describe, expect, it } from 'vitest'
import { registerCollections } from '../tinycld/books/collections'

const NAMES = [
    'books_accounts',
    'books_journal_lines',
    'books_journal_entries',
    'books_account_balances',
    'books_settings',
    'books_doc_sequences',
    'books_close_overrides',
    'books_admins',
    'books_access',
    'books_customers',
    'books_vendors',
    'books_products',
    'books_bundle_items',
    'books_bank_connections',
    'books_bank_files',
    'books_bank_file_contents',
    'books_bank_imports',
    'books_bank_transactions',
    'books_bank_matches',
    'books_bank_match_lines',
    'books_bank_match_suggestions',
    'books_bank_categorizations',
    'books_tax_agencies',
    'books_tax_rates',
    'books_invoices',
    'books_invoice_lines',
    'books_invoice_public',
    'books_invoice_tax_lines',
    'books_sales_receipts',
    'books_sales_receipt_lines',
    'books_sales_receipt_tax_lines',
    'books_estimates',
    'books_estimate_lines',
    'books_estimate_public',
    'books_estimate_responses',
    'books_bills',
    'books_bill_lines',
    'books_expenses',
    'books_expense_lines',
    'books_party_balances',
    'books_party_contacts',
    'books_audit_log',
    'books_attachments',
    'books_payments',
    'books_payment_applications',
    'books_bill_payments',
    'books_bill_payment_lines',
    'books_cash_basis_lines',
    'books_cash_basis_tax_lines',
    'books_credit_memos',
    'books_credit_memo_lines',
    'books_credit_memo_tax_lines',
    'books_credit_memo_applications',
    'books_vendor_credits',
    'books_vendor_credit_lines',
    'books_vendor_credit_applications',
    'books_vendor_refunds',
    'books_vendor_refund_lines',
    'books_refund_receipts',
    'books_refund_receipt_lines',
    'books_refund_receipt_tax_lines',
    'books_refund_receipt_credits',
    'books_refund_receipt_sale_lines',
    'books_write_offs',
    'books_statements',
    'books_document_sends',
    'books_deposits',
    'books_deposit_items',
    'books_deposit_lines',
    'books_undeposited_items',
    'books_reconciliations',
    'books_reconciliation_lines',
    'books_reconcile_lines',
    'books_reconciled_lines',
    'books_invoice_due_totals',
    'books_payment_day_totals',
    'books_sidebar_shortcuts',
    'books_stock_moves',
    'books_stock_layers',
    'books_inventory_adjustments',
    'books_inventory_adjustment_lines',
]

const INVENTORY = [
    'books_stock_moves',
    'books_stock_layers',
    'books_inventory_adjustments',
    'books_inventory_adjustment_lines',
]

function register() {
    const calls = new Map<string, Record<string, unknown>>()
    const newCollection = (name: string, options: Record<string, unknown>) => {
        calls.set(name, options)
        return { name }
    }
    const users = { name: 'users' }
    const result = registerCollections(newCollection as never, { users } as never)
    return { calls, result }
}

describe('registerCollections', () => {
    it('registers every Books collection', () => {
        const { result } = register()
        expect(Object.keys(result).sort()).toEqual([...NAMES].sort())
    })

    it('syncs every collection on demand with per-query realtime', () => {
        const { calls } = register()
        for (const name of NAMES) {
            expect(calls.get(name)?.syncMode).toBe('on-demand')
            expect(calls.get(name)?.realtime).toBe('query')
        }
    })

    // ADR 3: the server fills an adjustment's number, entry and stamps, and the stock
    // rows are read from their own collections.
    it('declares the inventory collections with no relations, and the server fills an adjustment', () => {
        const { calls } = register()
        for (const name of INVENTORY) {
            expect(calls.get(name)?.relations, name).toBeUndefined()
        }
        expect(calls.get('books_inventory_adjustments')?.omitOnInsert).toEqual([
            'created',
            'updated',
            'number',
            'sequence',
            'source',
            'document',
            'currency',
            'entry',
            'posted_by',
            'posted_at',
            'voided_by',
            'voided_at',
            'sort_key',
        ])
    })

    it('declares the relations the ledger screens read', () => {
        const { calls } = register()
        // Spike outcome (a): the lines reach their entry through a relation.
        expect(calls.get('books_journal_lines')?.relations).toEqual({
            account: { name: 'books_accounts' },
            customer: { name: 'books_customers' },
            vendor: { name: 'books_vendors' },
            entry: { name: 'books_journal_entries' },
        })
        expect(calls.get('books_journal_entries')?.relations).toEqual({
            books_journal_lines_via_entry: { name: 'books_journal_lines' },
            posted_by: { name: 'users' },
            created_by: { name: 'users' },
        })
        expect(calls.get('books_account_balances')?.relations).toEqual({
            account: { name: 'books_accounts' },
        })
    })

    it('never inserts a field Books sets itself', () => {
        const { calls } = register()
        expect(calls.get('books_journal_entries')?.omitOnInsert).toEqual(
            expect.arrayContaining([
                'number',
                'sequence',
                'total',
                'posted_at',
                'posted_by',
                'currency',
                // The server marks a card payment's entry (1099 report spec §4).
                'card_payment',
            ])
        )
        expect(calls.get('books_journal_lines')?.omitOnInsert).toEqual(
            expect.arrayContaining(['posted', 'date', 'currency'])
        )
        // The guard sets name_key and sort_key on every write, so the client never sends them.
        expect(calls.get('books_customers')?.omitOnInsert).toEqual(
            expect.arrayContaining(['created', 'updated', 'name_key', 'sort_key'])
        )
        expect(calls.get('books_vendors')?.omitOnInsert).toEqual(
            expect.arrayContaining(['created', 'updated', 'name_key', 'sort_key'])
        )
    })

    // The customers list materializes each row's parent through a subquery on the
    // same collection, so the collection files no related rows.
    it('declares no relations on customers', () => {
        const { calls } = register()
        expect(calls.has('books_customers')).toBe(true)
        expect(calls.get('books_customers')?.relations).toBeUndefined()
    })

    // The vendors list loads one page at a time, and the expense account picker
    // reads books_accounts itself.
    it('declares no relations on vendors', () => {
        const { calls } = register()
        expect(calls.has('books_vendors')).toBe(true)
        expect(calls.get('books_vendors')?.relations).toBeUndefined()
    })

    // The guard sets name_key and sort_key and the server stamps currency, so the client
    // never sends them on a product; a bundle row sends every column it has.
    it('never inserts a product or bundle row column the server sets', () => {
        const { calls } = register()
        expect(calls.get('books_products')?.omitOnInsert).toEqual([
            'created',
            'updated',
            'name_key',
            'sort_key',
            'currency',
        ])
        expect(calls.get('books_bundle_items')?.omitOnInsert).toEqual(['created', 'updated'])
    })

    // The products list loads one page at a time; a bundle's rows,
    // the product picker and the account pickers read their own collections.
    it('declares no relations on products or bundle rows', () => {
        const { calls } = register()
        for (const name of ['books_products', 'books_bundle_items']) {
            expect(calls.has(name), name).toBe(true)
            expect(calls.get(name)?.relations, name).toBeUndefined()
        }
    })

    // The Banking strip reads each connection's account, and the files list
    // reads each file's connection and uploader.
    it('declares the relations Banking reads', () => {
        const { calls } = register()
        expect(calls.get('books_bank_connections')?.relations).toEqual({
            account: { name: 'books_accounts' },
            created_by: { name: 'users' },
        })
        expect(calls.get('books_bank_files')?.relations).toEqual({
            connection: { name: 'books_bank_connections' },
            uploaded_by: { name: 'users' },
        })
        expect(calls.get('books_bank_file_contents')?.relations).toEqual({
            file: { name: 'books_bank_files' },
        })
        expect(calls.get('books_bank_imports')?.relations).toEqual({
            file: { name: 'books_bank_files' },
            created_by: { name: 'users' },
        })
        expect(calls.get('books_bank_transactions')?.relations).toEqual({
            connection: { name: 'books_bank_connections' },
            file: { name: 'books_bank_files' },
            bank_import: { name: 'books_bank_imports' },
        })
    })

    // The Attachments section reads each row's uploader through materialize().
    it('declares the uploader relation on attachments', () => {
        const { calls } = register()
        expect(calls.get('books_attachments')?.relations).toEqual({
            uploaded_by: { name: 'users' },
        })
    })

    // The server stamps who connected, and stamps everything a file row says about
    // its upload, so the client never sends those columns.
    it('never inserts a banking column the server stamps', () => {
        const { calls } = register()
        expect(calls.get('books_bank_connections')?.omitOnInsert).toEqual([
            'created',
            'updated',
            'created_by',
        ])
        expect(calls.get('books_bank_files')?.omitOnInsert).toEqual([
            'created',
            'updated',
            'name',
            'format',
            'size',
            'content_hash',
            'status',
            'uploaded_by',
            'statement_balance',
            'statement_date',
        ])
        expect(calls.get('books_bank_imports')?.omitOnInsert).toEqual([
            'created',
            'updated',
            'imported',
            'duplicates',
            'created_by',
        ])
    })

    // The server makes an estimate's public token in its create. Nothing writes the
    // public view, and it has no autodate columns, so it omits nothing; a response
    // sends every column but its autodates.
    it('never inserts the estimate public token or a response autodate', () => {
        const { calls } = register()
        expect(calls.get('books_estimates')?.omitOnInsert).toEqual(
            expect.arrayContaining(['public_token'])
        )
        expect(calls.has('books_estimate_public')).toBe(true)
        expect(calls.get('books_estimate_public')?.omitOnInsert).toBeUndefined()
        expect(calls.get('books_estimate_responses')?.omitOnInsert).toEqual(['created', 'updated'])
    })

    // The guard sets name_key and sort_key on every write. The Taxes page reads a
    // group's rates from the rates the agencies query holds, so neither
    // collection files related rows.
    it('registers the sales tax agencies and rates on demand, omitting what the server sets, with no relations', () => {
        const { calls } = register()
        for (const name of ['books_tax_agencies', 'books_tax_rates']) {
            expect(calls.has(name), name).toBe(true)
            expect(calls.get(name)?.syncMode, name).toBe('on-demand')
            expect(calls.get(name)?.realtime, name).toBe('query')
            expect(calls.get(name)?.omitOnInsert, name).toEqual([
                'created',
                'updated',
                'name_key',
                'sort_key',
            ])
            expect(calls.get(name)?.relations, name).toBeUndefined()
        }
    })

    // The balances view is never written: the server signals its topic when a
    // journal line or an account changes, so an open customer page stays live.
    it('keeps the party balances view live on its change topic, with no relations', () => {
        const { calls } = register()
        const balances = calls.get('books_party_balances')
        expect(balances?.liveTopics).toEqual(['collection/books_party_balances'])
        expect(balances?.relations).toBeUndefined()
    })

    // Dashboard spec §4: nobody writes the two dashboard views; the server signals each
    // view's topic when an invoice or a payment changes, so an open dashboard stays live.
    it('keeps the dashboard views live on their change topics', () => {
        const { calls } = register()
        for (const name of ['books_invoice_due_totals', 'books_payment_day_totals']) {
            expect(calls.has(name), name).toBe(true)
            expect(calls.get(name)?.liveTopics, name).toEqual([`collection/${name}`])
        }
    })

    // Bank-match spec §4: the client inserts a match with its bank transaction and
    // its lines; the server stamps the connection and who matched. The match lines
    // are the server's. The suggestions view is never written: the server signals
    // its topic when a bank transaction, a line, an entry, a match line or a
    // connection changes.
    it('registers the bank match collections and keeps the suggestions view live', () => {
        const { calls } = register()
        const matches = calls.get('books_bank_matches')
        expect(matches?.omitOnInsert).toEqual(['connection', 'created_by', 'created', 'updated'])
        expect(matches?.relations).toEqual({
            bank_transaction: { name: 'books_bank_transactions' },
            lines: { name: 'books_journal_lines' },
            connection: { name: 'books_bank_connections' },
        })
        const lines = calls.get('books_bank_match_lines')
        expect(lines?.omitOnInsert).toEqual(['created', 'updated'])
        expect(lines?.relations).toEqual({
            match: { name: 'books_bank_matches' },
            bank_transaction: { name: 'books_bank_transactions' },
            line: { name: 'books_journal_lines' },
            entry: { name: 'books_journal_entries' },
        })
        const suggestions = calls.get('books_bank_match_suggestions')
        expect(suggestions?.liveTopics).toEqual(['collection/books_bank_match_suggestions'])
    })

    // Bank-categorize spec §4: the client inserts a categorization with its bank
    // transaction, kind, payee, memo and lines; the server stamps the connection, the
    // entry it posts and who added it, so the insert carries none of them.
    it('registers the bank categorizations with the relations the Added to Books read follows', () => {
        const { calls } = register()
        const categorizations = calls.get('books_bank_categorizations')
        expect(categorizations?.syncMode).toBe('on-demand')
        expect([...((categorizations?.omitOnInsert as string[] | undefined) ?? [])].sort()).toEqual(
            ['connection', 'created', 'created_by', 'entry', 'updated'].sort()
        )
        expect(categorizations?.relations).toEqual({
            bank_transaction: { name: 'books_bank_transactions' },
            entry: { name: 'books_journal_entries' },
            customer: { name: 'books_customers' },
            vendor: { name: 'books_vendors' },
            created_by: { name: 'users' },
            connection: { name: 'books_bank_connections' },
        })
        expect(categorizations?.alwaysFetchRelations).toBeUndefined()
    })

    // Reconcile spec §4: the two collections are written by the client (a start, a press)
    // and stamped by the server. The lines view is never written: the server signals its
    // topic when a line, an entry, an account, a party, a cleared row, a reconciliation or
    // a bank match line changes (server/register.go), so the work screen follows them.
    it('registers the reconciliation collections on demand and keeps the lines view live', () => {
        const { calls } = register()
        for (const name of [
            'books_reconciliations',
            'books_reconciliation_lines',
            'books_reconcile_lines',
        ]) {
            expect(calls.get(name)?.syncMode, name).toBe('on-demand')
            expect(calls.get(name)?.realtime, name).toBe('query')
        }
        expect(calls.get('books_reconcile_lines')?.liveTopics).toEqual([
            'collection/books_reconcile_lines',
        ])
        expect(calls.get('books_reconciliations')?.liveTopics).toBeUndefined()
        expect(calls.get('books_reconciliation_lines')?.liveTopics).toBeUndefined()
    })

    // Reconciliation report spec §4 "Schema": the reconciled lines view is never written.
    // The server signals its topic when a cleared row, a reconciliation, a journal line, an
    // entry or a party changes (server/register.go), so a finish or an undo reaches the
    // report and the history.
    it('registers the reconciled lines view on demand and keeps it live on its change topic', () => {
        const { calls, result } = register()
        expect(Object.keys(result)).toContain('books_reconciled_lines')
        const view = calls.get('books_reconciled_lines')
        expect(view?.syncMode).toBe('on-demand')
        expect(view?.realtime).toBe('query')
        expect(view?.liveTopics).toEqual(['collection/books_reconciled_lines'])
    })

    // The level view is never written: the server signals its topic when a user's role,
    // core access or Books admin grant changes, so an open app follows a level change.
    it('keeps the access view live on its change topic', () => {
        const { calls } = register()
        const access = calls.get('books_access')
        expect(access?.syncMode).toBe('on-demand')
        expect(access?.realtime).toBe('query')
        expect(access?.liveTopics).toEqual(['collection/books_access'])
    })

    // The audit log view is never written: the server signals its topic when an
    // audit row is written or a line it reads its parent from changes, so an open
    // report or history stays live.
    it('keeps the audit log view live on its change topic, with no relations', () => {
        const { calls } = register()
        const log = calls.get('books_audit_log')
        expect(log?.syncMode).toBe('on-demand')
        expect(log?.liveTopics).toEqual(['collection/books_audit_log'])
        expect(log?.relations).toBeUndefined()
    })

    // Vendor credit spec §4: as the bill's two collections and the bill payment lines.
    // The server writes the number, the totals, the unapplied balance and the posting
    // stamps of a credit, and who applied an application; the client never sends them.
    it('never inserts a vendor credit or application column the server writes', () => {
        const { calls } = register()
        const credits = calls.get('books_vendor_credits')?.omitOnInsert
        expect(credits).toEqual(
            expect.arrayContaining([
                'created',
                'updated',
                'number',
                'sequence',
                'subtotal',
                'total',
                'balance',
                'revision',
                'currency',
                'entry',
                'replaced_by',
                'posted_by',
                'posted_at',
                'voided_by',
                'voided_at',
                'sort_key',
            ])
        )
        for (const written of ['vendor', 'status', 'date', 'ref_no', 'memo', 'replaces']) {
            expect(credits, written).not.toContain(written)
        }
        // An account line's amount is typed by the writer, as on a bill line.
        expect(calls.get('books_vendor_credit_lines')?.omitOnInsert).toEqual(['created', 'updated'])
        const applications = calls.get('books_vendor_credit_applications')?.omitOnInsert
        expect(applications).toEqual(expect.arrayContaining(['created', 'applied_by']))
        for (const written of ['vendor_credit', 'bill', 'amount', 'date']) {
            expect(applications, written).not.toContain(written)
        }
    })

    // Apply credit spec §4.1: the server writes a credit memo's applied cents, as an
    // invoice's written_off, and who applied an application; the client never sends them.
    it('never inserts a credit memo applied sum or an application column the server writes', () => {
        const { calls } = register()
        expect(calls.get('books_credit_memos')?.omitOnInsert).toEqual(
            expect.arrayContaining(['balance', 'applied'])
        )
        const applications = calls.get('books_credit_memo_applications')
        expect(applications?.syncMode).toBe('on-demand')
        expect(applications?.realtime).toBe('query')
        expect(applications?.omitOnInsert).toEqual(
            calls.get('books_vendor_credit_applications')?.omitOnInsert
        )
        expect(applications?.omitOnInsert).toEqual(
            expect.arrayContaining(['created', 'applied_by'])
        )
        for (const written of ['credit_memo', 'invoice', 'amount', 'date']) {
            expect(applications?.omitOnInsert, written).not.toContain(written)
        }
    })

    // Vendor refund spec §4: the refund names its vendor, its Refunded to account, its
    // entry, its poster and voider and the refund it replaces or is replaced by; a line
    // names its refund and the vendor credit it refunds. The server writes the number,
    // the entry and the posting and void stamps.
    it('registers the vendor refunds and their lines with their relations', () => {
        const { calls } = register()
        const refunds = calls.get('books_vendor_refunds')
        expect(refunds?.relations).toEqual({
            vendor: { name: 'books_vendors' },
            refunded_to: { name: 'books_accounts' },
            entry: { name: 'books_journal_entries' },
            posted_by: { name: 'users' },
            voided_by: { name: 'users' },
            replaces: { name: 'books_vendor_refunds' },
            replaced_by: { name: 'books_vendor_refunds' },
        })
        expect(refunds?.omitOnInsert).toEqual(
            expect.arrayContaining([
                'created',
                'updated',
                'number',
                'sequence',
                'entry',
                'replaced_by',
                'posted_by',
                'posted_at',
                'voided_by',
                'voided_at',
            ])
        )
        for (const written of [
            'vendor',
            'status',
            'date',
            'payment_method',
            'reference_no',
            'refunded_to',
            'amount',
            'memo',
            'replaces',
        ]) {
            expect(refunds?.omitOnInsert, written).not.toContain(written)
        }
        const lines = calls.get('books_vendor_refund_lines')
        expect(lines?.relations).toEqual({
            refund: { name: 'books_vendor_refunds' },
            vendor_credit: { name: 'books_vendor_credits' },
        })
        for (const written of ['refund', 'vendor_credit', 'amount', 'position']) {
            expect(lines?.omitOnInsert, written).not.toContain(written)
        }
    })

    // Bank deposit spec §4.1: the server writes a deposit's number, totals, entry and
    // posting and void stamps, and an item's copy of its line; the undeposited items
    // view is never written, and stays live on its change topic, as the match view.
    it('registers the deposit collections and keeps the undeposited items view live', () => {
        const { calls } = register()
        const deposits = calls.get('books_deposits')?.omitOnInsert
        expect(deposits).toEqual(
            expect.arrayContaining([
                'number',
                'sequence',
                'total',
                'items_total',
                'lines_total',
                'currency',
                'entry',
                'replaced_by',
                'posted_by',
                'posted_at',
                'voided_by',
                'voided_at',
                'sort_key',
            ])
        )
        for (const written of ['status', 'date', 'deposit_to', 'memo', 'replaces']) {
            expect(deposits, written).not.toContain(written)
        }
        const items = calls.get('books_deposit_items')?.omitOnInsert
        expect(items).toEqual(
            expect.arrayContaining([
                'entry',
                'account',
                'customer',
                'vendor',
                'amount',
                'date',
                'doc_type',
                'number',
                'document',
                'payment_method',
                'reference_no',
                'posted',
            ])
        )
        for (const written of ['deposit', 'line', 'position']) {
            expect(items, written).not.toContain(written)
        }
        for (const written of [
            'deposit',
            'customer',
            'vendor',
            'account',
            'description',
            'amount',
        ]) {
            expect(calls.get('books_deposit_lines')?.omitOnInsert, written).not.toContain(written)
        }
        const view = calls.get('books_undeposited_items')
        expect(view?.syncMode).toBe('on-demand')
        expect(view?.liveTopics).toEqual(['collection/books_undeposited_items'])
    })

    // Statements spec §4.2: the client sends the customer, the type, the dates and the
    // address; the server sets the number, the sequence, the balance, the currency and the
    // sent fields. The customer files into its collection.
    it('never inserts a statement column the server sets, and relates its customer', () => {
        const { calls } = register()
        const statements = calls.get('books_statements')
        expect(statements?.omitOnInsert).toEqual([
            'created',
            'updated',
            'number',
            'sequence',
            'balance',
            'currency',
            'sent_at',
            'sent_to',
        ])
        expect(statements?.relations).toEqual({ customer: { name: 'books_customers' } })
    })

    // The contacts tab reads the contacts of one customer; nothing else enters
    // through them.
    it('registers the party contacts with no relations to fetch', () => {
        const { calls } = register()
        const contacts = calls.get('books_party_contacts')
        expect(contacts?.syncMode).toBe('on-demand')
        expect(contacts?.relations).toBeUndefined()
        expect(contacts?.alwaysFetchRelations).toBeUndefined()
    })
})

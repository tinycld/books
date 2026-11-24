import { liveViewOptions } from '@tinycld/core/lib/change-signal'
import type { CoreStores } from '@tinycld/core/lib/pocketbase'
import type { Schema } from '@tinycld/core/types/pbSchema'
import type { createCollection } from 'pbtsdb/core'
import { BasicIndex } from 'pbtsdb/core'

// The generated Schema already carries the books_* collections, both
// directions of every relation included.
type MergedSchema = Schema

const indexed = {
    autoIndex: 'eager' as const,
    defaultIndexType: BasicIndex,
}

// Only the rows a live query asks for enter the store, and realtime covers
// exactly those rows. A register or report never loads the whole ledger.
const onDemand = { syncMode: 'on-demand', realtime: 'query' } as const

export function registerCollections(
    newCollection: ReturnType<typeof createCollection<MergedSchema>>,
    coreStores: CoreStores
) {
    // The server stamps `currency` from books_settings and `full_name` from the
    // parent path.
    const books_accounts = newCollection('books_accounts', {
        omitOnInsert: ['created', 'updated', 'currency', 'full_name'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // created_by is stamped from the request's user.
    const books_bank_connections = newCollection('books_bank_connections', {
        omitOnInsert: ['created', 'updated', 'created_by'] as const,
        ...onDemand,
        relations: { account: books_accounts, created_by: coreStores.users },
        collectionOptions: indexed,
    })

    // A row is created by core's uploadRecordWithFile (the file bytes), never by an insert
    // here; the server stamps everything below the omit line from the upload.
    const books_bank_files = newCollection('books_bank_files', {
        omitOnInsert: [
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
        ] as const,
        ...onDemand,
        relations: { connection: books_bank_connections, uploaded_by: coreStores.users },
        collectionOptions: indexed,
    })

    // A bill's, an expense's or a vendor credit's file. A row is created by core's
    // uploadRecordWithFile (the file bytes), never by an insert here; the server stamps
    // name, size and uploaded_by from the upload. A reader filters by the parent's id
    // column and never reads the parent through the row, so no parent relation is declared.
    const books_attachments = newCollection('books_attachments', {
        omitOnInsert: ['created', 'updated', 'name', 'size', 'uploaded_by'] as const,
        ...onDemand,
        relations: { uploaded_by: coreStores.users },
        collectionOptions: indexed,
    })

    // One row per stored file, written by the server's upload hook: the file's rows
    // as text cells, which the import mapping screen reads. Nothing inserts it here.
    const books_bank_file_contents = newCollection('books_bank_file_contents', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        relations: { file: books_bank_files },
        collectionOptions: indexed,
    })

    // One import of chosen lines of a file. The server stamps the counts and who
    // imported, and writes the transactions.
    const books_bank_imports = newCollection('books_bank_imports', {
        omitOnInsert: ['created', 'updated', 'imported', 'duplicates', 'created_by'] as const,
        ...onDemand,
        relations: { file: books_bank_files, created_by: coreStores.users },
        collectionOptions: indexed,
    })

    // Written only by the server's import.
    const books_bank_transactions = newCollection('books_bank_transactions', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        relations: {
            connection: books_bank_connections,
            file: books_bank_files,
            bank_import: books_bank_imports,
        },
        collectionOptions: indexed,
    })

    // No relations: the customers list materializes each row's parent with a
    // subquery on this same collection, so nothing is filed through a relation.
    const books_customers = newCollection('books_customers', {
        omitOnInsert: ['created', 'updated', 'name_key', 'sort_key'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // No relations: the list loads one page of vendors at a time; the expense
    // account picker reads books_accounts itself.
    const books_vendors = newCollection('books_vendors', {
        omitOnInsert: ['created', 'updated', 'name_key', 'sort_key'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // Created before entries so the entry's back-relation can name it; `entry`
    // is added once the entries exist (Object.assign, because typing the key
    // would make the two collections' types refer to each other). posted, date and currency are stamped
    // when the entry posts; card_payment and doc_type are copies of the entry's,
    // stamped by the server (server/lines.go). A line's customer and vendor (its Name) file into the
    // customers and vendors collections, declared above for that reason.
    const lineRelations: {
        account: typeof books_accounts
        customer: typeof books_customers
        vendor: typeof books_vendors
    } = { account: books_accounts, customer: books_customers, vendor: books_vendors }
    const books_journal_lines = newCollection('books_journal_lines', {
        omitOnInsert: [
            'created',
            'updated',
            'posted',
            'date',
            'currency',
            'card_payment',
            'doc_type',
        ] as const,
        ...onDemand,
        relations: lineRelations,
        collectionOptions: indexed,
    })

    // Every field below the omit line is Books' own: the number and totals
    // are assigned at posting, who and when by the request, the override by
    // the close-date check, the card mark by the poster (server/card_payment.go).
    const books_journal_entries = newCollection('books_journal_entries', {
        omitOnInsert: [
            'created',
            'updated',
            'number',
            'sequence',
            'total',
            'revision',
            'posted_at',
            'posted_by',
            'voided_at',
            'voided_by',
            'created_by',
            'close_override',
            'currency',
            'document',
            'card_payment',
        ] as const,
        ...onDemand,
        relations: {
            books_journal_lines_via_entry: books_journal_lines,
            posted_by: coreStores.users,
            created_by: coreStores.users,
        },
        collectionOptions: indexed,
    })

    Object.assign(lineRelations, { entry: books_journal_entries })

    // The bank collections that read journal lines come after the lines. A writer
    // inserts a match with its bank transaction and lines; the server stamps the
    // connection and who matched, writes the match lines and moves the bank
    // transaction to reviewed (server/bank_match.go).
    const books_bank_matches = newCollection('books_bank_matches', {
        omitOnInsert: ['connection', 'created_by', 'created', 'updated'] as const,
        ...onDemand,
        relations: {
            bank_transaction: books_bank_transactions,
            lines: books_journal_lines,
            connection: books_bank_connections,
        },
        collectionOptions: indexed,
    })

    // Written only by the server, one row for each matched journal line.
    const books_bank_match_lines = newCollection('books_bank_match_lines', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        relations: {
            match: books_bank_matches,
            bank_transaction: books_bank_transactions,
            line: books_journal_lines,
            entry: books_journal_entries,
        },
        collectionOptions: indexed,
    })

    // A writer inserts a categorization with its bank transaction, kind, payee, memo
    // and lines; the server stamps the connection and who added it, posts the entry,
    // stamps it, and matches the bank transaction to it (server/bank_categorize.go).
    // A delete is the undo: the server voids the entry.
    const books_bank_categorizations = newCollection('books_bank_categorizations', {
        omitOnInsert: ['connection', 'entry', 'created_by', 'created', 'updated'] as const,
        ...onDemand,
        relations: {
            bank_transaction: books_bank_transactions,
            entry: books_journal_entries,
            customer: books_customers,
            vendor: books_vendors,
            created_by: coreStores.users,
            connection: books_bank_connections,
        },
        collectionOptions: indexed,
    })

    // A view, never written: the server signals its topic when a bank transaction,
    // a journal line, an entry, a match line or a connection changes
    // (server/register.go), so the For review list follows a post, a void or a
    // match with no reload.
    const books_bank_match_suggestions = newCollection('books_bank_match_suggestions', {
        ...onDemand,
        ...liveViewOptions('books_bank_match_suggestions'),
        collectionOptions: indexed,
    })

    // One comparison of an account with one bank statement. A writer inserts the
    // account, the statement fields and `status: 'in_progress'`; the server stamps the
    // beginning balance, who started it and the currency at create, and the cleared sums,
    // who finished it (id and name) and when at finish; an admin's undo clears them again
    // (server/reconcile.go).
    const books_reconciliations = newCollection('books_reconciliations', {
        omitOnInsert: [
            'created',
            'updated',
            'beginning_balance',
            'cleared_out',
            'cleared_in',
            'cleared_out_count',
            'cleared_in_count',
            'created_by',
            'finished_by',
            'finished_by_name',
            'finished_at',
            'currency',
        ] as const,
        ...onDemand,
        relations: {
            account: books_accounts,
            created_by: coreStores.users,
            finished_by: coreStores.users,
        },
        collectionOptions: indexed,
    })

    // One row for each cleared transaction: a writer inserts the reconciliation and the
    // line; the server stamps the rest from the journal line, and sets `finished` when the
    // reconciliation is finished (server/reconcile.go).
    const books_reconciliation_lines = newCollection('books_reconciliation_lines', {
        omitOnInsert: [
            'created',
            'updated',
            'account',
            'entry',
            'date',
            'debit',
            'credit',
            'finished',
        ] as const,
        ...onDemand,
        relations: { reconciliation: books_reconciliations },
        collectionOptions: indexed,
    })

    // A view, never written: the server signals its topic when a journal line, an entry,
    // an account, a customer, a vendor, a cleared row, a reconciliation or a bank match
    // line changes (server/register.go), so the work screen follows a post, a void, a
    // press or a match with no reload.
    const books_reconcile_lines = newCollection('books_reconcile_lines', {
        ...onDemand,
        ...liveViewOptions('books_reconcile_lines'),
        collectionOptions: indexed,
    })

    // A view, never written: one row for each cleared row of a finished reconciliation.
    // The server signals its topic when a cleared row, a reconciliation, a journal line, an
    // entry, a customer or a vendor changes (server/register.go), so a finish or an undo
    // reaches the reconciliation report with no reload.
    const books_reconciled_lines = newCollection('books_reconciled_lines', {
        ...onDemand,
        ...liveViewOptions('books_reconciled_lines'),
        collectionOptions: indexed,
    })

    // Server-maintained; reports read these instead of summing lines.
    const books_account_balances = newCollection('books_account_balances', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        relations: { account: books_accounts },
        collectionOptions: indexed,
    })

    const books_settings = newCollection('books_settings', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    const books_doc_sequences = newCollection('books_doc_sequences', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    const books_close_overrides = newCollection('books_close_overrides', {
        omitOnInsert: ['created', 'updated', 'granted_by'] as const,
        ...onDemand,
        relations: { user: coreStores.users, granted_by: coreStores.users },
        collectionOptions: indexed,
    })

    const books_admins = newCollection('books_admins', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        relations: { user: coreStores.users },
        collectionOptions: indexed,
    })

    // A view, never written: the server signals its topic when a user's role, core
    // access or Books admin grant changes (server/register.go), so a level change
    // reaches an open app with no reload.
    const books_access = newCollection('books_access', {
        ...onDemand,
        ...liveViewOptions('books_access'),
        relations: { user: coreStores.users },
        collectionOptions: indexed,
    })

    // No relations: the list loads one page of products at a time; a bundle's
    // rows, the product picker and the account pickers read their own
    // collections. The guard sets name_key and sort_key, and the server stamps currency.
    const books_products = newCollection('books_products', {
        omitOnInsert: ['created', 'updated', 'name_key', 'sort_key', 'currency'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    const books_bundle_items = newCollection('books_bundle_items', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // No relations: the Taxes page materializes each agency's rates with a
    // subquery and finds a group's rates among those, so nothing is filed through
    // a relation. The guard sets name_key and sort_key.
    const books_tax_agencies = newCollection('books_tax_agencies', {
        omitOnInsert: ['created', 'updated', 'name_key', 'sort_key'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    const books_tax_rates = newCollection('books_tax_rates', {
        omitOnInsert: ['created', 'updated', 'name_key', 'sort_key'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // Every field below the omit line is Books' own: the number at posting, the
    // totals at every draft write, who and when by the request, sort_key by the
    // guard, the open balance at posting and at every payment post or void,
    // written_off at every write-off post or void, and the public token when the
    // invoice is created (server/invoice_link.go). No relations: the invoice
    // screen reads its customer, tax rate and users through their own queries.
    const books_invoices = newCollection('books_invoices', {
        omitOnInsert: [
            'created',
            'updated',
            'number',
            'sequence',
            'subtotal',
            'tax_total',
            'total',
            'balance',
            'written_off',
            'revision',
            'currency',
            'entry',
            'replaced_by',
            'posted_by',
            'posted_at',
            'voided_by',
            'voided_at',
            'public_token',
            'sort_key',
        ] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // A view the signed-out customer page reads by its token (the X-Share-Token
    // header), as books_estimate_public. Nothing inserts into it, and it has no
    // autodates to omit.
    const books_invoice_public = newCollection('books_invoice_public', {
        ...onDemand,
        collectionOptions: indexed,
    })

    // amount is recomputed by the server at every line write.
    const books_invoice_lines = newCollection('books_invoice_lines', {
        omitOnInsert: ['created', 'updated', 'amount'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // Written by the server at posting; clients only read it.
    const books_invoice_tax_lines = newCollection('books_invoice_tax_lines', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // As the invoice's three: server-owned fields below the omit line, no
    // relations (the receipt screen reads its customer, tax rate, deposit
    // account and users through their own queries).
    const books_sales_receipts = newCollection('books_sales_receipts', {
        omitOnInsert: [
            'created',
            'updated',
            'number',
            'sequence',
            'subtotal',
            'tax_total',
            'total',
            'revision',
            'currency',
            'entry',
            'replaced_by',
            'posted_by',
            'posted_at',
            'voided_by',
            'voided_at',
            'sort_key',
        ] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // amount is recomputed by the server at every line write.
    const books_sales_receipt_lines = newCollection('books_sales_receipt_lines', {
        omitOnInsert: ['created', 'updated', 'amount'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // Written by the server at posting; clients only read it.
    const books_sales_receipt_tax_lines = newCollection('books_sales_receipt_tax_lines', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // As the invoice's three: server-owned fields below the omit line (the
    // number at posting, the totals at every draft write, the credit not yet
    // applied at posting and void, the cents applied to invoices at each
    // application, as the invoice's written_off), no relations (the credit memo
    // screen reads its customer, tax rate, invoice and users through its own
    // queries).
    const books_credit_memos = newCollection('books_credit_memos', {
        omitOnInsert: [
            'created',
            'updated',
            'number',
            'sequence',
            'subtotal',
            'tax_total',
            'total',
            'balance',
            'applied',
            'revision',
            'currency',
            'entry',
            'replaced_by',
            'posted_by',
            'posted_at',
            'voided_by',
            'voided_at',
            'sort_key',
        ] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // amount is recomputed by the server at every line write.
    const books_credit_memo_lines = newCollection('books_credit_memo_lines', {
        omitOnInsert: ['created', 'updated', 'amount'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // Written by the server at posting; clients only read it.
    const books_credit_memo_tax_lines = newCollection('books_credit_memo_tax_lines', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // As the sales receipt's three: server-owned fields below the omit line, no
    // relations (the refund screen reads its customer, tax rate, Refund from
    // account, source and users through its own queries).
    const books_refund_receipts = newCollection('books_refund_receipts', {
        omitOnInsert: [
            'created',
            'updated',
            'number',
            'sequence',
            'subtotal',
            'tax_total',
            'total',
            'revision',
            'currency',
            'entry',
            'replaced_by',
            'posted_by',
            'posted_at',
            'voided_by',
            'voided_at',
            'sort_key',
        ] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // amount is recomputed by the server at every line write.
    const books_refund_receipt_lines = newCollection('books_refund_receipt_lines', {
        omitOnInsert: ['created', 'updated', 'amount'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // Written by the server at posting; clients only read it.
    const books_refund_receipt_tax_lines = newCollection('books_refund_receipt_tax_lines', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // Written by the server when a payout posts (the payer row of its credit
    // memo's balance); clients only read it.
    const books_refund_receipt_credits = newCollection('books_refund_receipt_credits', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // A view, never written: the lines of the refunds that pay out no credit
    // memo. The server signals its topic when a refund or one of its lines
    // changes (server/register.go).
    const books_refund_receipt_sale_lines = newCollection('books_refund_receipt_sale_lines', {
        ...onDemand,
        ...liveViewOptions('books_refund_receipt_sale_lines'),
        collectionOptions: indexed,
    })

    // As the invoice's: server-owned fields below the omit line (the number and
    // the public token when the estimate is created, the totals at every write,
    // the invoice made from it by the invoice guards), no relations (the
    // estimate screen reads its customer, tax rate and invoice through its own
    // queries).
    const books_estimates = newCollection('books_estimates', {
        omitOnInsert: [
            'created',
            'updated',
            'number',
            'sequence',
            'subtotal',
            'tax_total',
            'total',
            'revision',
            'currency',
            'invoice',
            'public_token',
            'sort_key',
        ] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // amount is recomputed by the server at every line write.
    const books_estimate_lines = newCollection('books_estimate_lines', {
        omitOnInsert: ['created', 'updated', 'amount'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // A view the signed-out customer page reads by its token (the X-Share-Token
    // header). Nothing inserts into it, and it has no autodates to omit (as
    // books_access).
    const books_estimate_public = newCollection('books_estimate_public', {
        ...onDemand,
        collectionOptions: indexed,
    })

    // A customer's Accept or Decline: the page sends every column but the
    // autodates, and the server's guard sets the estimate's status.
    const books_estimate_responses = newCollection('books_estimate_responses', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // As the invoice's: server-owned fields below the omit line, no relations
    // (the bill screen reads its vendor, accounts, products and users through
    // their own queries).
    const books_bills = newCollection('books_bills', {
        omitOnInsert: [
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
        ] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // amount stays insertable: an account line's amount is typed by the writer;
    // the server computes a product line's and refuses one sent with it.
    const books_bill_lines = newCollection('books_bill_lines', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // As the bill's: server-owned fields below the omit line, no relations
    // (the expense screen reads its vendor, accounts, products and users
    // through their own queries).
    const books_expenses = newCollection('books_expenses', {
        omitOnInsert: [
            'created',
            'updated',
            'number',
            'sequence',
            'subtotal',
            'total',
            'revision',
            'currency',
            'entry',
            'replaced_by',
            'posted_by',
            'posted_at',
            'voided_by',
            'voided_at',
            'sort_key',
        ] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // As the bill's lines: an account line's amount is typed by the writer;
    // the server computes a product line's.
    const books_expense_lines = newCollection('books_expense_lines', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // As the invoice's: server-owned fields below the omit line (the number,
    // applied and credited at posting), no relations (the payment screen reads
    // its customer, deposit account and users through their own queries).
    const books_payments = newCollection('books_payments', {
        omitOnInsert: [
            'created',
            'updated',
            'number',
            'sequence',
            'applied',
            'credited',
            'currency',
            'entry',
            'replaced_by',
            'posted_by',
            'posted_at',
            'voided_by',
            'voided_at',
            'sort_key',
        ] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // One row per invoice a payment pays; the client writes every column but
    // the autodates. No relations: the payment screen reads the invoices
    // through their own query.
    const books_payment_applications = newCollection('books_payment_applications', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // Created posted, with its lines, in one batch; the server posts it from the
    // create's request hook. Server-owned fields below the omit line (the number
    // and total at posting, the poster by the request). No relations: the
    // screens read the vendor, the account and the users through their own
    // queries.
    const books_bill_payments = newCollection('books_bill_payments', {
        omitOnInsert: [
            'created',
            'updated',
            'number',
            'sequence',
            'total',
            'currency',
            'entry',
            'replaced_by',
            'posted_by',
            'posted_at',
            'voided_by',
            'voided_at',
            'sort_key',
        ] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // One row per bill a bill payment pays; the client writes every column but
    // the autodates, in the batch that creates the payment.
    const books_bill_payment_lines = newCollection('books_bill_payment_lines', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // As the bill's: server-owned fields below the omit line (balance is the
    // unapplied credit), no relations (the vendor credit screen reads its
    // vendor, accounts, products and users through their own queries).
    const books_vendor_credits = newCollection('books_vendor_credits', {
        omitOnInsert: [
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
        ] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // As the bill's lines: an account line's amount is typed by the writer;
    // the server computes a product line's and refuses one sent with it.
    const books_vendor_credit_lines = newCollection('books_vendor_credit_lines', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // One row per bill a credit is applied to; the client writes the credit, the
    // bill, the amount and the apply date, and the server stamps applied_by and
    // close_override (the create rule refuses a client value of either). The
    // credit and the bill file into their collections, where the Applied to
    // rows read them through materialize() (useCreditApplications).
    const books_vendor_credit_applications = newCollection('books_vendor_credit_applications', {
        omitOnInsert: ['created', 'applied_by', 'close_override'] as const,
        ...onDemand,
        relations: { vendor_credit: books_vendor_credits, bill: books_bills },
        collectionOptions: indexed,
    })

    // One row per invoice a credit memo is applied to, written as the vendor
    // credit's applications: the client sends the memo, the invoice, the amount
    // and the apply date; the server stamps applied_by and close_override.
    const books_credit_memo_applications = newCollection('books_credit_memo_applications', {
        omitOnInsert: ['created', 'applied_by', 'close_override'] as const,
        ...onDemand,
        relations: { credit_memo: books_credit_memos, invoice: books_invoices },
        collectionOptions: indexed,
    })

    // As the payment's: server-owned fields below the omit line (the number at
    // posting, who and when by the request). The read view materializes its vendor,
    // Refunded to account, entry, poster and voider, and the correction reads the
    // refund it replaces or is replaced by, so each files into its collection. The
    // self-relations replaces and replaced_by are added once the collection exists
    // (Object.assign, as the journal lines' entry: typing the keys would make the
    // collection's type refer to itself).
    const refundRelations = {
        vendor: books_vendors,
        refunded_to: books_accounts,
        entry: books_journal_entries,
        posted_by: coreStores.users,
        voided_by: coreStores.users,
    }
    const books_vendor_refunds = newCollection('books_vendor_refunds', {
        omitOnInsert: [
            'created',
            'updated',
            'number',
            'sequence',
            'currency',
            'entry',
            'replaced_by',
            'posted_by',
            'posted_at',
            'voided_by',
            'voided_at',
            'sort_key',
        ] as const,
        ...onDemand,
        relations: refundRelations,
        collectionOptions: indexed,
    })

    Object.assign(refundRelations, {
        replaces: books_vendor_refunds,
        replaced_by: books_vendor_refunds,
    })

    // One row per vendor credit a refund refunds; the client writes every column but
    // the autodates. The refund and the credit file into their collections, where the
    // credit's Refunded rows and the refund's credits list read them through materialize().
    const books_vendor_refund_lines = newCollection('books_vendor_refund_lines', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        relations: { refund: books_vendor_refunds, vendor_credit: books_vendor_credits },
        collectionOptions: indexed,
    })

    // As the payment's: server-owned fields below the omit line (the customer from
    // the invoice, the number at posting, the close override, who and when by the
    // request). A write-off is created posted in one insert and only ever voided.
    // No relations: the dialog and the write-off page read the invoice, customer,
    // account and users through their own queries.
    const books_write_offs = newCollection('books_write_offs', {
        omitOnInsert: [
            'created',
            'updated',
            'customer',
            'number',
            'sequence',
            'currency',
            'entry',
            'close_override',
            'posted_by',
            'posted_at',
            'voided_by',
            'voided_at',
            'sort_key',
        ] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // A customer statement: the client sends the customer, the type, the dates and the
    // address; the server's create guard (server/statements.go) sets the number, the
    // sequence, the balance and the currency, and only the send route sets the sent
    // fields. The customer files into its collection for the screens that materialize it.
    const books_statements = newCollection('books_statements', {
        omitOnInsert: [
            'created',
            'updated',
            'number',
            'sequence',
            'balance',
            'currency',
            'sent_at',
            'sent_to',
        ] as const,
        ...onDemand,
        relations: { customer: books_customers },
        collectionOptions: indexed,
    })

    // One row for each sent email of a sales document. Only the send route writes it
    // (its create, update and delete rules are null), so no client inserts; created is
    // its one autodate. The customer files into its collection, as the statement's.
    const books_document_sends = newCollection('books_document_sends', {
        omitOnInsert: ['created'] as const,
        ...onDemand,
        relations: { customer: books_customers },
        collectionOptions: indexed,
    })

    // As the vendor refund's: server-owned fields below the omit line (the number and the
    // totals at posting, who and when by the request). The form and the read view
    // materialize Deposit to, the poster and the voider, and a correction reads the
    // deposit it replaces or is replaced by; the self-relations are added once the
    // collection exists (Object.assign, as the vendor refund's).
    const depositRelations = {
        deposit_to: books_accounts,
        posted_by: coreStores.users,
        voided_by: coreStores.users,
    }
    const books_deposits = newCollection('books_deposits', {
        omitOnInsert: [
            'created',
            'updated',
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
        ] as const,
        ...onDemand,
        relations: depositRelations,
        collectionOptions: indexed,
    })

    Object.assign(depositRelations, {
        replaces: books_deposits,
        replaced_by: books_deposits,
    })

    // One row per ticked item: the client writes the deposit, the line and the position;
    // the server copies the rest from the line, its entry and its source document
    // (server/deposits.go), so the read view and a correction read this one collection.
    const books_deposit_items = newCollection('books_deposit_items', {
        omitOnInsert: [
            'created',
            'updated',
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
        ] as const,
        ...onDemand,
        relations: {
            deposit: books_deposits,
            account: books_accounts,
            customer: books_customers,
            vendor: books_vendors,
        },
        collectionOptions: indexed,
    })

    // One row per other funds line; the client writes every column but the autodates.
    const books_deposit_lines = newCollection('books_deposit_lines', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        relations: {
            deposit: books_deposits,
            account: books_accounts,
            customer: books_customers,
            vendor: books_vendors,
        },
        collectionOptions: indexed,
    })

    // A view, never written: the server signals its topic when a journal line, an entry,
    // an account, a deposit item or a source document changes (server/register.go), so
    // the deposit form follows a post, a void or another deposit with no reload.
    const books_undeposited_items = newCollection('books_undeposited_items', {
        ...onDemand,
        ...liveViewOptions('books_undeposited_items'),
        collectionOptions: indexed,
    })

    // Written by the server from payments (the cash basis); clients only read them.
    const books_cash_basis_lines = newCollection('books_cash_basis_lines', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    const books_cash_basis_tax_lines = newCollection('books_cash_basis_tax_lines', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // A view, never written: the server signals its topic when a journal line or
    // an account changes (server/party_balances.go), so an open page follows a
    // post or a void with no reload.
    const books_party_balances = newCollection('books_party_balances', {
        ...onDemand,
        ...liveViewOptions('books_party_balances'),
        collectionOptions: indexed,
    })

    // The dashboard views, never written: the server signals each topic when an
    // invoice or a payment changes (server/dashboard.go), so an open dashboard
    // follows a post, a void or a payment with no reload.
    const books_invoice_due_totals = newCollection('books_invoice_due_totals', {
        ...onDemand,
        ...liveViewOptions('books_invoice_due_totals'),
        collectionOptions: indexed,
    })

    const books_payment_day_totals = newCollection('books_payment_day_totals', {
        ...onDemand,
        ...liveViewOptions('books_payment_day_totals'),
        collectionOptions: indexed,
    })

    // A view over core's audit_logs, never written: the server signals its topic when an
    // audit row is written or a line it reads a parent from changes
    // (server/register.go), so an open report or history follows a change with no
    // reload.
    const books_audit_log = newCollection('books_audit_log', {
        ...onDemand,
        ...liveViewOptions('books_audit_log'),
        collectionOptions: indexed,
    })

    // No relations: the customer page reads one customer's contacts with its
    // own query. The server clears is_primary on a party's other contacts.
    const books_party_contacts = newCollection('books_party_contacts', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // One row for each user: the Shortcuts section of the Books sidebar. No relations: the
    // row's user is the reader.
    const books_sidebar_shortcuts = newCollection('books_sidebar_shortcuts', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // Written by the server's costing replay (ADR 3); clients only read them. No
    // relations: a report or a product page reads the product from its own collection.
    const books_stock_moves = newCollection('books_stock_moves', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    const books_stock_layers = newCollection('books_stock_layers', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // The server numbers an adjustment and fills its entry and stamps when it posts, and
    // names the document a re-cost belongs to. No relations: the form reads its lines,
    // the products and the accounts from their own collections.
    const books_inventory_adjustments = newCollection('books_inventory_adjustments', {
        omitOnInsert: [
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
        ] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    const books_inventory_adjustment_lines = newCollection('books_inventory_adjustment_lines', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    return {
        books_sidebar_shortcuts,
        books_stock_moves,
        books_stock_layers,
        books_inventory_adjustments,
        books_inventory_adjustment_lines,
        books_accounts,
        books_bank_connections,
        books_bank_files,
        books_attachments,
        books_bank_file_contents,
        books_bank_imports,
        books_bank_transactions,
        books_bank_matches,
        books_bank_match_lines,
        books_bank_match_suggestions,
        books_bank_categorizations,
        books_reconciliations,
        books_reconciliation_lines,
        books_reconcile_lines,
        books_reconciled_lines,
        books_journal_lines,
        books_journal_entries,
        books_account_balances,
        books_settings,
        books_doc_sequences,
        books_close_overrides,
        books_admins,
        books_access,
        books_customers,
        books_vendors,
        books_products,
        books_bundle_items,
        books_tax_agencies,
        books_tax_rates,
        books_invoices,
        books_invoice_public,
        books_invoice_lines,
        books_invoice_tax_lines,
        books_sales_receipts,
        books_sales_receipt_lines,
        books_sales_receipt_tax_lines,
        books_credit_memos,
        books_credit_memo_lines,
        books_credit_memo_tax_lines,
        books_credit_memo_applications,
        books_refund_receipts,
        books_refund_receipt_lines,
        books_refund_receipt_tax_lines,
        books_refund_receipt_credits,
        books_refund_receipt_sale_lines,
        books_estimates,
        books_estimate_lines,
        books_estimate_public,
        books_estimate_responses,
        books_bills,
        books_bill_lines,
        books_expenses,
        books_expense_lines,
        books_payments,
        books_payment_applications,
        books_bill_payments,
        books_bill_payment_lines,
        books_vendor_credits,
        books_vendor_credit_lines,
        books_vendor_credit_applications,
        books_vendor_refunds,
        books_vendor_refund_lines,
        books_write_offs,
        books_statements,
        books_document_sends,
        books_deposits,
        books_deposit_items,
        books_deposit_lines,
        books_undeposited_items,
        books_cash_basis_lines,
        books_cash_basis_tax_lines,
        books_party_balances,
        books_invoice_due_totals,
        books_payment_day_totals,
        books_party_contacts,
        books_audit_log,
    }
}

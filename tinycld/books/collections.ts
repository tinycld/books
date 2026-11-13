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
    // when the entry posts. A line's customer and vendor (its Name) file into the
    // customers and vendors collections, declared above for that reason.
    const lineRelations: {
        account: typeof books_accounts
        customer: typeof books_customers
        vendor: typeof books_vendors
    } = { account: books_accounts, customer: books_customers, vendor: books_vendors }
    const books_journal_lines = newCollection('books_journal_lines', {
        omitOnInsert: ['created', 'updated', 'posted', 'date', 'currency'] as const,
        ...onDemand,
        relations: lineRelations,
        collectionOptions: indexed,
    })

    // Every field below the omit line is Books' own: the number and totals
    // are assigned at posting, who and when by the request, the override by
    // the close-date check.
    const books_journal_entries = newCollection('books_journal_entries', {
        omitOnInsert: [
            'created',
            'updated',
            'number',
            'sequence',
            'total',
            'posted_at',
            'posted_by',
            'voided_at',
            'voided_by',
            'created_by',
            'close_override',
            'currency',
            'document',
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

    // A view: read only, and it emits no realtime events, so a level change
    // reaches an open app on its next reload or foreground.
    const books_access = newCollection('books_access', {
        ...onDemand,
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
    // guard. No relations: the invoice screen reads its customer, tax rate and
    // users through their own queries.
    const books_invoices = newCollection('books_invoices', {
        omitOnInsert: [
            'created',
            'updated',
            'number',
            'sequence',
            'subtotal',
            'tax_total',
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

    // As the invoice's: server-owned fields below the omit line (the number when
    // the estimate is created, the totals at every write, the invoice made from
    // it by the invoice guards), no relations (the estimate screen reads its
    // customer, tax rate and invoice through its own queries).
    const books_estimates = newCollection('books_estimates', {
        omitOnInsert: [
            'created',
            'updated',
            'number',
            'sequence',
            'subtotal',
            'tax_total',
            'total',
            'currency',
            'invoice',
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

    return {
        books_accounts,
        books_bank_connections,
        books_bank_files,
        books_bank_file_contents,
        books_bank_imports,
        books_bank_transactions,
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
        books_invoice_lines,
        books_invoice_tax_lines,
        books_sales_receipts,
        books_sales_receipt_lines,
        books_sales_receipt_tax_lines,
        books_estimates,
        books_estimate_lines,
        books_bills,
        books_bill_lines,
    }
}

import type PocketBase from 'pocketbase'
import { ATTACHMENT_SEED_FILES } from './lib/attachment-seed-files'
import { ATTACHMENTS, SEED_ATTACHMENT_IDS } from './lib/attachments-fixture'
import { BANK_SEED } from './lib/bank-connection-fixture'
import { BANK_IMPORT_SEED_STATEMENT } from './lib/bank-import-mapping-fixture'
import { BILL_LINES, BILL_SEED_IDS, BILLS } from './lib/bill-form-fixture'
import {
    CREDIT_MEMO_LINES,
    CREDIT_MEMO_SEED_DRAFT_ID,
    CREDIT_MEMO_SEED_IDS,
    CREDIT_MEMOS,
} from './lib/credit-memo-form-fixture'
import { CUSTOMER_BALANCE_SEED } from './lib/customer-balance-fixture'
import { CUSTOMERS } from './lib/customer-form-fixture'
import { CUSTOMER_PAGE_CONTACTS } from './lib/customer-page-fixture'
import {
    CONVERTED_INVOICE,
    CONVERTED_INVOICE_LINES,
    ESTIMATE_LINES,
    ESTIMATE_SEED_IDS,
    ESTIMATES,
} from './lib/estimate-form-fixture'
import {
    DECLINE_ESTIMATE_LINES,
    DECLINE_ESTIMATES,
    DECLINE_RESPONSES,
} from './lib/estimate-public-link-fixture'
import { EXPENSE_LINES, EXPENSE_SEED_IDS, EXPENSES } from './lib/expense-form-fixture'
import { REVIEW_SEED_STATEMENT } from './lib/for-review-fixture'
import {
    GENERAL_LEDGER_LONG_SECTION,
    GENERAL_LEDGER_PARTY_SEED,
} from './lib/general-ledger-fixture'
import {
    CUSTOMER_TERMS_PATCHES,
    INVOICE_IDS,
    INVOICE_LINES,
    INVOICE_PRODUCTS,
    INVOICE_SEED_IDS,
    INVOICES,
} from './lib/invoice-form-fixture'
import { JOURNAL_SEED } from './lib/journal-entries-fixture'
import { BILL_PAYMENT_SEED, PAY_BILLS_SEED_BILLS } from './lib/pay-bills-fixture'
import { BUNDLE_ITEMS, PRODUCTS } from './lib/products-services-fixture'
import { PAYMENT_SEED } from './lib/receive-payment-fixture'
import {
    REFUND_FROM_ACCOUNTS,
    REFUND_RECEIPT_IDS,
    REFUND_RECEIPT_LINES,
    REFUND_RECEIPT_SEED_DRAFT_ID,
    REFUND_RECEIPTS,
    REFUND_SEED_CREDIT_MEMO,
    REFUND_SEED_CREDIT_MEMO_LINES,
    REFUND_SEED_PAYOUT,
    REFUND_SEED_PAYOUT_LINES,
    type RefundReceiptLineRecord,
    type RefundReceiptRecord,
} from './lib/refund-receipt-form-fixture'
import { SALES_LIST_SEED_DRAFTS } from './lib/sales-lists-fixture'
import {
    DEPOSIT_ACCOUNTS,
    SALES_RECEIPT_IDS,
    SALES_RECEIPT_LINES,
    SALES_RECEIPT_SEED_DRAFT_ID,
    SALES_RECEIPT_SEED_IDS,
    SALES_RECEIPTS,
} from './lib/sales-receipt-form-fixture'
import { SALES_REPORTS_SEED } from './lib/sales-reports-fixture'
import {
    SALES_TAX_DOCUMENTS,
    SALES_TAX_LIABILITY_VOID_TARGET,
    type SalesDocumentFixture,
    salesTaxLiabilitySeedMemo,
} from './lib/sales-tax-liability-fixture'
import { SEED_ACCOUNTS } from './lib/seed-accounts'
import {
    CUSTOMER_TAX_PATCHES,
    TAX_AGENCIES,
    TAX_GROUPS,
    TAX_IDS,
    TAX_RATE_ROWS,
    TAX_RATES,
} from './lib/tax-rates-fixture'
import { TRANSFER_SEED } from './lib/transfer-fixture'
import { PRIOR_YEAR_SEED } from './lib/trial-balance-fixture'
import { ACCOUNT_BOXES, VENDOR_1099_PATCHES } from './lib/vendor-1099-fixture'
import {
    VENDOR_CREDIT_APPLICATIONS,
    VENDOR_CREDIT_LINES,
    VENDOR_CREDIT_SEED_APPLICATION_IDS,
    VENDOR_CREDIT_SEED_BILL,
    VENDOR_CREDIT_SEED_IDS,
    VENDOR_CREDITS,
} from './lib/vendor-credit-form-fixture'
import { VENDORS } from './lib/vendor-form-fixture'
import { VENDOR_PAGE_CONTACTS } from './lib/vendor-page-fixture'
import {
    linesOfRefund,
    REFUND_ACCOUNTS,
    refundCreditById,
    VENDOR_REFUND_SEED_CREDIT_IDS,
    VENDOR_REFUND_SEED_CREDIT_LINE,
    VENDOR_REFUND_SEED_IDS,
    VENDOR_REFUNDS,
} from './lib/vendor-refund-fixture'
import type { BooksPartyContacts } from './types'

// Seed function invoked by core/scripts/seed-db.ts with a superuser `pb` and
// the seeded user. Entries are posted through the same update the app makes,
// so the server's posting hook validates them, numbers them and fills the
// balance rows. The superuser may attribute them to the seeded user.

interface SeedContext {
    user: { id: string; email: string; name: string }
}

// [account key, debit, credit] in cents
type SeedLine = [string, number, number]

interface SeedEntry {
    day: string
    memo: string
    lines: SeedLine[]
    post: boolean
}

const ENTRIES: SeedEntry[] = [
    {
        day: '01-02',
        memo: 'Owner investment',
        lines: [
            ['checking', 2500000, 0],
            ['equity', 0, 2500000],
        ],
        post: true,
    },
    {
        day: '01-05',
        memo: 'January rent',
        lines: [
            ['rent', 180000, 0],
            ['checking', 0, 180000],
        ],
        post: true,
    },
    {
        day: '01-20',
        memo: 'Consulting for Acme',
        lines: [
            ['receivable', 450000, 0],
            ['consulting', 0, 450000],
        ],
        post: true,
    },
    {
        day: '02-03',
        memo: 'Laptop',
        lines: [
            ['equipment', 210000, 0],
            ['card', 0, 210000],
        ],
        post: true,
    },
    {
        day: '02-10',
        memo: 'Design tool subscription',
        lines: [
            ['design-tools', 4900, 0],
            ['card', 0, 4900],
        ],
        post: false,
    },
]

function isoDay(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// A request that posts a draft must state the revision it saw (server/revision.go). The seed
// reads it just before the post: nothing else writes while it runs.
async function postSeedDraft(pb: PocketBase, entryId: string, userId: string): Promise<void> {
    const entries = pb.collection('books_journal_entries')
    const { revision } = await entries.getOne<{ revision: number }>(entryId, { fields: 'revision' })
    await entries.update(entryId, { status: 'posted', posted_by: userId, revision: revision + 1 })
}

// As postSeedDraft, for a sales document: the line creates before the post each
// increased the draft's revision.
async function postSeedDocument(
    pb: PocketBase,
    collection:
        | 'books_invoices'
        | 'books_sales_receipts'
        | 'books_credit_memos'
        | 'books_refund_receipts'
        | 'books_bills'
        | 'books_expenses'
        | 'books_vendor_credits',
    id: string,
    userId: string
): Promise<void> {
    const documents = pb.collection(collection)
    const { revision } = await documents.getOne<{ revision: number }>(id, { fields: 'revision' })
    await documents.update(id, { status: 'posted', posted_by: userId, revision: revision + 1 })
}

// The first day of the latest month on or before today whose month number is the fiscal start.
function fiscalYearStart(today: Date, startMonth: number): string {
    const year = today.getMonth() + 1 >= startMonth ? today.getFullYear() : today.getFullYear() - 1
    return isoDay(new Date(year, startMonth - 1, 1))
}

export default async function seed(pb: PocketBase, ctx: SeedContext): Promise<void> {
    // The settings row is not seeded from the fixture: it holds fake user ids and
    // setup_completed: true, which would hide the setup card the setup e2e opens.
    // The settings e2e fills the company fields through the UI.
    // The settings row keeps setup_started and setup_completed false, so the seeded book (which already has accounts) shows the wizard's populated-book path.
    const year = new Date().getFullYear()
    const ids = new Map<string, string>()
    const accountIds = new Map<string, string>()
    for (const account of SEED_ACCOUNTS) {
        const created = await pb.collection('books_accounts').create({
            name: account.name,
            number: account.number,
            type: account.type,
            detail_type: account.detail_type,
            parent: account.parent ? ids.get(account.parent) : '',
        })
        ids.set(account.key, created.id)
        accountIds.set(account.number, created.id)
    }
    // The server ships an empty prefix; the list shows numbers as "JE-n", so every seeded post takes it.
    await pb.collection('books_doc_sequences').update('booksseqjournal', { prefix: 'JE-' })
    for (const entry of ENTRIES) {
        const created = await pb.collection('books_journal_entries').create({
            date: `${year}-${entry.day}`,
            memo: entry.memo,
            status: 'draft',
            doc_type: 'journal',
            origin: 'manual',
            created_by: ctx.user.id,
        })
        for (const [position, [key, debit, credit]] of entry.lines.entries()) {
            await pb.collection('books_journal_lines').create({
                entry: created.id,
                account: ids.get(key),
                debit,
                credit,
                position,
            })
        }
        if (entry.post) {
            await postSeedDraft(pb, created.id, ctx.user.id)
        }
    }
    await seedRegisterEntries(pb, ctx, ids)
    await seedJournalEntries(pb, ctx, ids)
    // Two years back, so the Trial Balance folds it onto Retained earnings.
    await postEntry(pb, ctx, ids, {
        date: `${year - PRIOR_YEAR_SEED.yearsAgo}-${PRIOR_YEAR_SEED.day}`,
        memo: PRIOR_YEAR_SEED.memo,
        lines: PRIOR_YEAR_SEED.lines,
    })
    await seedTransfer(pb, ctx, accountIds)
    await seedBanking(pb, ctx, accountIds)
    const customerIds = await seedCustomers(pb)
    await seedVendors(pb, accountIds)
    await seedPartyEntries(pb, ctx, ids, customerIds)
    await seedLongSection(pb, ctx, ids)
    await seedProducts(pb, accountIds)
    await seed1099(pb, accountIds)
    await seedSalesTax(pb, accountIds, customerIds)
    const invoiceIds = await seedInvoices(pb, ctx, customerIds)
    await seedPayments(pb, ctx, accountIds, customerIds)
    await seedCreditMemos(pb, ctx, customerIds, invoiceIds)
    const salesReceiptIds = await seedSalesReceipts(pb, ctx, accountIds, customerIds)
    // After the earlier seeded documents, so they keep their numbers.
    await seedSalesTaxLiability(pb, ctx, accountIds, customerIds)
    await retireSeededTax(pb)
    await seedEstimates(pb, customerIds)
    await seedSalesListDrafts(pb, accountIds, customerIds)
    await seedPartyContacts(pb, customerIds)
    await seedVendorContacts(pb)
    await seedDeclinedEstimates(pb, customerIds)
    const billIds = await seedBills(pb, ctx, accountIds)
    await seedBillPayments(pb, ctx, accountIds)
    const expenseIds = await seedExpenses(pb, ctx, accountIds)
    const creditIds = await seedVendorCredits(pb, ctx, accountIds)
    await seedVendorCreditApplications(pb, ctx, accountIds, creditIds)
    await seedVendorRefunds(pb, ctx, accountIds)
    await seedAttachments(pb, ctx, billIds, expenseIds)
    // Last among the document seeds, so the earlier seeded documents keep their numbers.
    await seedCustomerBalance(pb, ctx, ids, customerIds)
    await seedSalesReports(pb, ctx, accountIds, customerIds)
    // After every other document seed, so the seeded documents keep their numbers.
    await seedRefundReceipts(pb, ctx, accountIds, customerIds, salesReceiptIds)
    // Created active and deactivated last, because the app makes an account
    // inactive by updating it, and the vendor and product guards refuse a row
    // that names an inactive account when it is saved.
    for (const account of SEED_ACCOUNTS.filter(a => a.inactive)) {
        const id = ids.get(account.key)
        if (id === undefined) throw new Error(`seed: account ${account.key} was not created`)
        await pb.collection('books_accounts').update(id, { inactive: true })
    }
}

// The columns a seed sends: form, fields and the autodates are the server's.
export function seedValues<
    Row extends { form: string; fields: unknown; created: string; updated: string },
>(row: Row): Omit<Row, 'form' | 'fields' | 'created' | 'updated'> {
    const { form: _form, fields: _fields, created: _created, updated: _updated, ...values } = row
    return values
}

// Top-level customers first, so each sub-customer's parent exists when it is
// created. The fixture ids hold `_`, which a PocketBase id refuses, so the
// server assigns ids and `parent` is mapped from fixture id to created id.
// A fixture row has no name_key or sort_key (CustomerFixtureRecord omits them),
// so the seed never sends them: the server's guard sets both.
export async function seedCustomers(pb: PocketBase): Promise<Map<string, string>> {
    const ids = new Map<string, string>()
    const topLevelFirst = [
        ...CUSTOMERS.filter(c => c.parent === ''),
        ...CUSTOMERS.filter(c => c.parent !== ''),
    ]
    for (const { id, parent, ...row } of topLevelFirst) {
        const parentId = parent ? ids.get(parent) : ''
        if (parentId === undefined) {
            throw new Error(`seed: the parent ${parent} of customer ${id} was not created first`)
        }
        const created = await pb
            .collection('books_customers')
            .create({ ...seedValues(row), parent: parentId })
        ids.set(id, created.id)
    }
    for (const { id, terms } of CUSTOMER_TERMS_PATCHES) {
        const customerId = ids.get(id)
        if (customerId === undefined) {
            throw new Error(`seed: terms name customer ${id}, which was not created`)
        }
        await pb.collection('books_customers').update(customerId, { terms })
    }
    return ids
}

// The fixture ids are valid PocketBase ids, so the seed sends them. A fixture
// row names its default expense account by number; `accountIds` maps the
// number to the created account's id. A number with no account is a fixture
// bug, so it throws before the create.
export async function seedVendors(pb: PocketBase, accountIds: Map<string, string>): Promise<void> {
    for (const vendor of VENDORS) {
        const { expense_account_number: number, ...row } = vendor
        const accountId = number ? accountIds.get(number) : ''
        if (accountId === undefined) {
            throw new Error(
                `seed: vendor ${vendor.id} names account ${number}, which was not created`
            )
        }
        await pb
            .collection('books_vendors')
            .create({ ...seedValues(row), expense_account: accountId })
    }
}

// The created account's id for a fixture account number ('' for none). A
// number with no account is a fixture bug, so it throws before the create.
// `owner` names the fixture row in the error ("product <id>", "bill line <id>").
function seededAccountId(accountIds: Map<string, string>, number: string, owner: string): string {
    const accountId = number ? accountIds.get(number) : ''
    if (accountId === undefined) {
        throw new Error(`seed: ${owner} names account ${number}, which was not created`)
    }
    return accountId
}

// The fixture ids are valid PocketBase ids, so the seed sends them; `currency`
// is the server's. Every product is created active, then its bundle rows, and
// the inactive products are made inactive last: the item guard refuses a row
// whose product is inactive when the row is created, so rows come first. The
// invoice products (the Discount service a percent line names) come after.
export async function seedProducts(pb: PocketBase, accountIds: Map<string, string>): Promise<void> {
    for (const product of [...PRODUCTS, ...INVOICE_PRODUCTS]) {
        const {
            income_account_number: income,
            expense_account_number: expense,
            currency: _currency,
            inactive: _inactive,
            ...row
        } = product
        const income_account = seededAccountId(accountIds, income, `product ${product.id}`)
        const expense_account = seededAccountId(accountIds, expense, `product ${product.id}`)
        await pb
            .collection('books_products')
            .create({ ...seedValues(row), income_account, expense_account, inactive: false })
    }
    for (const { id, bundle, product, quantity, position } of BUNDLE_ITEMS) {
        await pb
            .collection('books_bundle_items')
            .create({ id, bundle, product, quantity, position })
    }
    for (const product of PRODUCTS.filter(p => p.inactive)) {
        await pb.collection('books_products').update(product.id, { inactive: true })
    }
}

// The vendors are created by seedVendors from the vendor-form fixture, so the
// 1099 columns are written after, by update, as a person would set them on a
// vendor and an account that already exist. `accountIds` maps a seed account
// number to the created account's id.
export async function seed1099(pb: PocketBase, accountIds: Map<string, string>): Promise<void> {
    for (const { number, form_1099_box } of ACCOUNT_BOXES) {
        if (form_1099_box === '') continue
        const id = accountIds.get(number)
        if (id === undefined) {
            throw new Error(`seed: 1099 box names account ${number}, which was not created`)
        }
        await pb.collection('books_accounts').update(id, { form_1099_box })
    }
    for (const patch of VENDOR_1099_PATCHES) {
        const { id, ...columns } = patch
        await pb.collection('books_vendors').update(id, columns)
    }
}

// The fixture ids are valid PocketBase ids, so the seed sends them. Every
// agency, rate and group is created active (rates first, so each group's
// components exist): the rate guard refuses a rate whose agency is inactive,
// and the document guard refuses a document under an inactive rate, so the
// sales tax liability documents under Retired rate and Old county rate post
// first. retireSeededTax makes the fixture's inactive rows inactive after them.
// `accountIds` maps a seed account number to the created account's id;
// `customerIds` maps a customer-form fixture id to the created customer's id.
export async function seedSalesTax(
    pb: PocketBase,
    accountIds: Map<string, string>,
    customerIds: Map<string, string>
): Promise<void> {
    for (const { id, name, account_number } of TAX_AGENCIES) {
        const account = accountIds.get(account_number)
        if (account === undefined) {
            throw new Error(
                `seed: tax agency ${id} names account ${account_number}, which was not created`
            )
        }
        await pb.collection('books_tax_agencies').create({ id, name, inactive: false, account })
    }
    for (const row of TAX_RATE_ROWS) {
        const { id, type, name, rate_ppm, agency, components, is_default } = row
        await pb.collection('books_tax_rates').create({
            id,
            type,
            name,
            rate_ppm,
            agency,
            components,
            is_default,
            inactive: false,
        })
    }
    // Customers are created before the tax rows exist, so their tax columns are
    // written after, by update, as a person would set them.
    for (const { id, ...columns } of CUSTOMER_TAX_PATCHES) {
        const customerId = customerIds.get(id)
        if (customerId === undefined) {
            throw new Error(`seed: tax columns name customer ${id}, which was not created`)
        }
        await pb.collection('books_customers').update(customerId, columns)
    }
}

// The memo of a seeded invoice names its INVOICE_IDS key, so a spec finds it.
function seedInvoiceMemo(id: string): string {
    const key = Object.entries(INVOICE_IDS).find(([, value]) => value === id)?.[0]
    if (key === undefined) throw new Error(`seed: invoice ${id} is not in INVOICE_IDS`)
    return `Seed invoice ${key}`
}

// Posts the INVOICE_SEED_IDS fixture invoices, in order, through the same
// writes the invoice form makes: create the draft, create its lines, then post
// it, so the server numbers each (1001, 1002, 1003 here, not the fixture's
// numbers), computes every amount and writes the journal entry. Each takes the
// Denver combined group (spec §4.6); its fixture date keeps it out of the
// General Ledger's fixed seed days. The product fixture ids are valid
// PocketBase ids and are sent as-is; `customerIds` maps a customer-form
// fixture id to the created customer's id. The amounts and totals are the
// server's, so none is sent. Returns the created id of each fixture invoice,
// by its fixture id, for the documents that name one (seedCreditMemos).
export async function seedInvoices(
    pb: PocketBase,
    ctx: SeedContext,
    customerIds: Map<string, string>
): Promise<Map<string, string>> {
    const invoiceIds = new Map<string, string>()
    for (const id of INVOICE_SEED_IDS) {
        const fixture = INVOICES.find(row => row.id === id)
        if (fixture === undefined) throw new Error(`seed: invoice ${id} is not in INVOICES`)
        const customer = customerIds.get(fixture.customer)
        if (customer === undefined) {
            throw new Error(
                `seed: invoice ${id} names customer ${fixture.customer}, which was not created`
            )
        }
        const created = await pb.collection('books_invoices').create({
            customer,
            status: 'draft',
            date: fixture.date,
            due_date: fixture.due_date,
            terms: fixture.terms,
            tax_rate: TAX_IDS.denverCombined,
            message: fixture.message,
            memo: seedInvoiceMemo(id),
            bill_to: fixture.bill_to,
            email: fixture.email,
        })
        for (const line of INVOICE_LINES.filter(row => row.invoice === id)) {
            await pb.collection('books_invoice_lines').create({
                invoice: created.id,
                position: line.position,
                kind: line.kind,
                product: line.product,
                description: line.description,
                quantity: line.quantity,
                rate: line.rate,
                percent_ppm: line.percent_ppm,
                taxable: line.taxable,
            })
        }
        await postSeedDocument(pb, 'books_invoices', created.id, ctx.user.id)
        invoiceIds.set(id, created.id)
    }
    return invoiceIds
}

// Creates a fixture credit memo as a draft with its lines, through the writes
// the credit memo form makes: the header, then its lines in order. The amounts
// and totals are the server's, so none is sent. `customerIds` maps a
// customer-form fixture id to the created customer's id; `invoiceIds` maps a
// fixture invoice id to the created invoice's id.
async function createSeedCreditMemo(
    pb: PocketBase,
    id: string,
    customerIds: Map<string, string>,
    invoiceIds: Map<string, string>
): Promise<string> {
    const fixture = CREDIT_MEMOS.find(row => row.id === id)
    if (fixture === undefined) throw new Error(`seed: credit memo ${id} is not in CREDIT_MEMOS`)
    const customer = customerIds.get(fixture.customer)
    if (customer === undefined) {
        throw new Error(
            `seed: credit memo ${id} names customer ${fixture.customer}, which was not created`
        )
    }
    const invoice = fixture.invoice === '' ? '' : invoiceIds.get(fixture.invoice)
    if (invoice === undefined) {
        throw new Error(
            `seed: credit memo ${id} names invoice ${fixture.invoice}, which was not seeded`
        )
    }
    const created = await pb.collection('books_credit_memos').create({
        customer,
        status: 'draft',
        date: fixture.date,
        bill_to: fixture.bill_to,
        email: fixture.email,
        tax_rate: fixture.tax_rate,
        message: fixture.message,
        memo: fixture.memo,
        invoice,
    })
    for (const line of CREDIT_MEMO_LINES.filter(row => row.credit_memo === id)) {
        await pb.collection('books_credit_memo_lines').create({
            credit_memo: created.id,
            position: line.position,
            kind: line.kind,
            product: line.product,
            description: line.description,
            quantity: line.quantity,
            rate: line.rate,
            percent_ppm: line.percent_ppm,
            taxable: line.taxable,
        })
    }
    return created.id
}

// Posts the CREDIT_MEMO_SEED_IDS memos (spec §4.6: the posted one names the
// seeded posted invoice of its customer, with Denver combined tax), so the
// server numbers each (1001 on a fresh book), writes its journal entry, its
// negative tax snapshot and its balance; then keeps CREDIT_MEMO_SEED_DRAFT_ID as
// a draft. Their fixture days (2026-11-10, 2026-11-16) are days no report spec
// reads.
export async function seedCreditMemos(
    pb: PocketBase,
    ctx: SeedContext,
    customerIds: Map<string, string>,
    invoiceIds: Map<string, string>
): Promise<void> {
    for (const id of CREDIT_MEMO_SEED_IDS) {
        const created = await createSeedCreditMemo(pb, id, customerIds, invoiceIds)
        await postSeedDocument(pb, 'books_credit_memos', created, ctx.user.id)
    }
    await createSeedCreditMemo(pb, CREDIT_MEMO_SEED_DRAFT_ID, customerIds, invoiceIds)
}

// Posts the PAYMENT_SEED payments (spec §4.5), in order, through the writes the payment
// form makes: create the draft payment, create its one application, then post it, so the
// server numbers each (1001, 1002 on a fresh book), writes its journal entry and lowers the
// invoice's balance. Each invoice is found by the memo seedInvoices gave it; `'total'` is
// that invoice's posted total. A payment has no revision field, so the post sends only the
// status and the poster. The deposit account resolves by its number in `accountIds`;
// `customerIds` maps the invoice's customer-form fixture id to the created customer's id.
export async function seedPayments(
    pb: PocketBase,
    ctx: SeedContext,
    accountIds: Map<string, string>,
    customerIds: Map<string, string>
): Promise<void> {
    for (const seedPayment of PAYMENT_SEED) {
        const fixture = INVOICES.find(row => row.id === seedPayment.invoice)
        const customer = fixture === undefined ? undefined : customerIds.get(fixture.customer)
        if (customer === undefined) {
            throw new Error(
                `seed: payment ${seedPayment.key} pays invoice ${seedPayment.invoice}, whose customer was not created`
            )
        }
        const invoice = await pb
            .collection('books_invoices')
            .getFirstListItem<{ id: string; total: number }>(
                pb.filter('memo = {:memo} && customer = {:customer} && status = "posted"', {
                    memo: seedInvoiceMemo(seedPayment.invoice),
                    customer,
                }),
                { fields: 'id,total' }
            )
        const depositTo = seededAccountId(
            accountIds,
            seedPayment.depositNumber,
            `payment ${seedPayment.key}`
        )
        const amount = seedPayment.amount === 'total' ? invoice.total : seedPayment.amount
        const created = await pb.collection('books_payments').create({
            customer,
            status: 'draft',
            date: seedPayment.date,
            payment_method: seedPayment.payment_method,
            reference_no: seedPayment.reference_no,
            deposit_to: depositTo,
            amount,
            memo: `Seed payment ${seedPayment.key}`,
        })
        await pb.collection('books_payment_applications').create({
            payment: created.id,
            invoice: invoice.id,
            amount,
            position: 0,
        })
        await pb
            .collection('books_payments')
            .update(created.id, { status: 'posted', posted_by: ctx.user.id })
    }
}

// The memo of a seeded sales receipt names its SALES_RECEIPT_IDS key, so a spec finds it.
function seedSalesReceiptMemo(id: string): string {
    const key = Object.entries(SALES_RECEIPT_IDS).find(([, value]) => value === id)?.[0]
    if (key === undefined) throw new Error(`seed: sales receipt ${id} is not in SALES_RECEIPT_IDS`)
    return `Seed sales receipt ${key}`
}

// Creates a fixture sales receipt as a draft with its lines, through the writes
// the receipt form makes. The fixture's deposit account id is a fixture id, so
// the account is resolved by its number; `customerIds` maps a customer-form
// fixture id to the created customer's id, and a walk-in receipt has none.
async function createSeedSalesReceipt(
    pb: PocketBase,
    accountIds: Map<string, string>,
    customerIds: Map<string, string>,
    id: string
): Promise<string> {
    const fixture = SALES_RECEIPTS.find(row => row.id === id)
    if (fixture === undefined) throw new Error(`seed: sales receipt ${id} is not in SALES_RECEIPTS`)
    const customer = fixture.customer === '' ? '' : customerIds.get(fixture.customer)
    if (customer === undefined) {
        throw new Error(
            `seed: sales receipt ${id} names customer ${fixture.customer}, which was not created`
        )
    }
    const number = DEPOSIT_ACCOUNTS.find(row => row.id === fixture.deposit_to)?.number
    const depositTo = number === undefined ? undefined : accountIds.get(number)
    if (depositTo === undefined) {
        throw new Error(
            `seed: sales receipt ${id} deposits to ${fixture.deposit_to}, which was not created`
        )
    }
    const created = await pb.collection('books_sales_receipts').create({
        customer,
        status: 'draft',
        date: fixture.date,
        tax_rate: fixture.tax_rate,
        payment_method: fixture.payment_method,
        reference_no: fixture.reference_no,
        deposit_to: depositTo,
        message: fixture.message,
        memo: seedSalesReceiptMemo(id),
        bill_to: fixture.bill_to,
        email: fixture.email,
    })
    for (const line of SALES_RECEIPT_LINES.filter(row => row.sales_receipt === id)) {
        await pb.collection('books_sales_receipt_lines').create({
            sales_receipt: created.id,
            position: line.position,
            kind: line.kind,
            product: line.product,
            description: line.description,
            quantity: line.quantity,
            rate: line.rate,
            percent_ppm: line.percent_ppm,
            taxable: line.taxable,
        })
    }
    return created.id
}

// Posts the SALES_RECEIPT_SEED_IDS fixture receipts in order (spec §4.6: Check
// to 1200 Undeposited funds with a customer, then a walk-in Cash sale to 1000),
// so the server numbers each, computes every amount and writes the journal
// entry; then keeps SALES_RECEIPT_SEED_DRAFT_ID a draft.
// Returns the created id of each posted fixture receipt, by its fixture id, for the
// documents that name one (seedRefundReceipts).
export async function seedSalesReceipts(
    pb: PocketBase,
    ctx: SeedContext,
    accountIds: Map<string, string>,
    customerIds: Map<string, string>
): Promise<Map<string, string>> {
    const salesReceiptIds = new Map<string, string>()
    for (const id of SALES_RECEIPT_SEED_IDS) {
        const created = await createSeedSalesReceipt(pb, accountIds, customerIds, id)
        await postSeedDocument(pb, 'books_sales_receipts', created, ctx.user.id)
        salesReceiptIds.set(id, created)
    }
    await createSeedSalesReceipt(pb, accountIds, customerIds, SALES_RECEIPT_SEED_DRAFT_ID)
    return salesReceiptIds
}

// The memo of a seeded refund receipt names its role, so a spec finds it.
function seedRefundReceiptMemo(role: 'refund' | 'payout' | 'draft'): string {
    return `Seed refund receipt ${role}`
}

// Creates a fixture refund receipt as a draft with its lines, through the writes the
// refund receipt form makes: the header, then its lines in order. The Refund from account
// is a fixture id, so it resolves by its number; `customerIds` maps a customer-form
// fixture id to the created customer's id. `salesReceipt` and `creditMemo` are the
// created ids of its source ('' for none). The amounts and totals are the server's.
async function createSeedRefundReceipt(
    pb: PocketBase,
    input: {
        fixture: RefundReceiptRecord
        lines: readonly RefundReceiptLineRecord[]
        memo: string
        salesReceipt: string
        creditMemo: string
    },
    accountIds: Map<string, string>,
    customerIds: Map<string, string>
): Promise<string> {
    const { fixture } = input
    const customer = fixture.customer === '' ? '' : customerIds.get(fixture.customer)
    if (customer === undefined) {
        throw new Error(
            `seed: refund receipt ${fixture.id} names customer ${fixture.customer}, which was not created`
        )
    }
    const number = REFUND_FROM_ACCOUNTS.find(row => row.id === fixture.refund_from)?.number
    const refundFrom = number === undefined ? undefined : accountIds.get(number)
    if (refundFrom === undefined) {
        throw new Error(
            `seed: refund receipt ${fixture.id} refunds from ${fixture.refund_from}, which was not created`
        )
    }
    const created = await pb.collection('books_refund_receipts').create({
        customer,
        status: 'draft',
        date: fixture.date,
        tax_rate: fixture.tax_rate,
        payment_method: fixture.payment_method,
        reference_no: fixture.reference_no,
        refund_from: refundFrom,
        sales_receipt: input.salesReceipt,
        credit_memo: input.creditMemo,
        message: fixture.message,
        memo: input.memo,
        bill_to: fixture.bill_to,
        email: fixture.email,
    })
    const ordered = [...input.lines].sort((a, b) => a.position - b.position)
    for (const line of ordered) {
        await pb.collection('books_refund_receipt_lines').create({
            refund_receipt: created.id,
            position: line.position,
            kind: line.kind,
            product: line.product,
            description: line.description,
            quantity: line.quantity,
            rate: line.rate,
            percent_ppm: line.percent_ppm,
            taxable: line.taxable,
        })
    }
    return created.id
}

function refundFixture(id: string): RefundReceiptRecord {
    const row = REFUND_RECEIPTS.find(candidate => candidate.id === id)
    if (row === undefined) throw new Error(`seed: refund receipt ${id} is not in REFUND_RECEIPTS`)
    return row
}

// Spec §4.6, plan decision "Seed pick": posts the refund of the seeded sales receipt 1004
// (2026-11-12, Check from 1000 Business Checking); posts the seed-only credit memo of
// Aspen Ridge Dental (2026-11-16) through the credit memo form's writes, then the payout of
// part of it (2026-11-17, Bank transfer from 1000), so the server writes its credits row
// and lowers the memo's balance; then keeps REFUND_RECEIPT_SEED_DRAFT_ID a draft.
// `salesReceiptIds` maps a fixture sales receipt id to the created receipt's id.
export async function seedRefundReceipts(
    pb: PocketBase,
    ctx: SeedContext,
    accountIds: Map<string, string>,
    customerIds: Map<string, string>,
    salesReceiptIds: Map<string, string>
): Promise<void> {
    const refund = refundFixture(REFUND_RECEIPT_IDS.posted)
    const salesReceipt = salesReceiptIds.get(refund.sales_receipt)
    if (salesReceipt === undefined) {
        throw new Error(
            `seed: refund receipt ${refund.id} names sales receipt ${refund.sales_receipt}, which was not posted`
        )
    }
    const refundId = await createSeedRefundReceipt(
        pb,
        {
            fixture: refund,
            lines: REFUND_RECEIPT_LINES.filter(line => line.refund_receipt === refund.id),
            memo: seedRefundReceiptMemo('refund'),
            salesReceipt,
            creditMemo: '',
        },
        accountIds,
        customerIds
    )
    await postSeedDocument(pb, 'books_refund_receipts', refundId, ctx.user.id)

    const memoId = await createSeedRefundCreditMemo(pb, customerIds)
    await postSeedDocument(pb, 'books_credit_memos', memoId, ctx.user.id)
    const payoutId = await createSeedRefundReceipt(
        pb,
        {
            fixture: REFUND_SEED_PAYOUT,
            lines: REFUND_SEED_PAYOUT_LINES,
            memo: seedRefundReceiptMemo('payout'),
            salesReceipt: '',
            creditMemo: memoId,
        },
        accountIds,
        customerIds
    )
    await postSeedDocument(pb, 'books_refund_receipts', payoutId, ctx.user.id)

    const draft = refundFixture(REFUND_RECEIPT_SEED_DRAFT_ID)
    await createSeedRefundReceipt(
        pb,
        {
            fixture: draft,
            lines: REFUND_RECEIPT_LINES.filter(line => line.refund_receipt === draft.id),
            memo: seedRefundReceiptMemo('draft'),
            salesReceipt: '',
            creditMemo: '',
        },
        accountIds,
        customerIds
    )
}

// The seed-only credit memo the payout names, through the writes the credit memo form
// makes (createSeedCreditMemo's): the header with no invoice, then its lines in order.
async function createSeedRefundCreditMemo(
    pb: PocketBase,
    customerIds: Map<string, string>
): Promise<string> {
    const fixture = REFUND_SEED_CREDIT_MEMO
    const customer = customerIds.get(fixture.customer)
    if (customer === undefined) {
        throw new Error(
            `seed: credit memo ${fixture.id} names customer ${fixture.customer}, which was not created`
        )
    }
    const created = await pb.collection('books_credit_memos').create({
        customer,
        status: 'draft',
        date: fixture.date,
        bill_to: fixture.bill_to,
        email: fixture.email,
        tax_rate: fixture.tax_rate,
        message: fixture.message,
        memo: fixture.memo,
        invoice: '',
    })
    const ordered = [...REFUND_SEED_CREDIT_MEMO_LINES].sort((a, b) => a.position - b.position)
    for (const line of ordered) {
        await pb.collection('books_credit_memo_lines').create({
            credit_memo: created.id,
            position: line.position,
            kind: line.kind,
            product: line.product,
            description: line.description,
            quantity: line.quantity,
            rate: line.rate,
            percent_ppm: line.percent_ppm,
            taxable: line.taxable,
        })
    }
    return created.id
}

// Creates a sales tax liability fixture document as a draft, through the writes the
// invoice and sales receipt forms make. The fixture ids are valid PocketBase ids and
// are sent; the server numbers each document, so the fixture's numbers are not sent.
async function createSalesTaxDocument(
    pb: PocketBase,
    fixture: SalesDocumentFixture,
    accountIds: Map<string, string>,
    customerIds: Map<string, string>
): Promise<void> {
    const customer =
        fixture.customer_fixture_id === '' ? '' : customerIds.get(fixture.customer_fixture_id)
    if (customer === undefined) {
        throw new Error(
            `seed: sales tax document ${fixture.id} names customer ${fixture.customer_fixture_id}, which was not created`
        )
    }
    const header = {
        id: fixture.id,
        customer,
        status: 'draft',
        date: fixture.date,
        tax_rate: fixture.tax_rate,
        memo: salesTaxLiabilitySeedMemo(fixture.id),
    }
    if (fixture.kind === 'invoice') {
        await pb
            .collection('books_invoices')
            .create({ ...header, due_date: fixture.date, terms: 'due_on_receipt' })
    } else {
        const depositTo = accountIds.get('1000')
        if (depositTo === undefined) {
            throw new Error(
                `seed: sales tax receipt ${fixture.id} deposits to 1000, which was not created`
            )
        }
        await pb
            .collection('books_sales_receipts')
            .create({ ...header, deposit_to: depositTo, payment_method: 'cash' })
    }
    // A line's own taxable flag decides its tax, not the product's.
    const nonTaxable = fixture.subtotal - fixture.taxable
    const lines = [
        { rate: fixture.taxable, taxable: true },
        { rate: nonTaxable, taxable: false },
    ].filter(line => line.rate > 0)
    const linesCollection =
        fixture.kind === 'invoice' ? 'books_invoice_lines' : 'books_sales_receipt_lines'
    const parentField = fixture.kind === 'invoice' ? 'invoice' : 'sales_receipt'
    for (const [position, line] of lines.entries()) {
        await pb.collection(linesCollection).create({
            [parentField]: fixture.id,
            position,
            kind: 'item',
            product: 'prodbookkeep001',
            quantity: 1,
            rate: line.rate,
            taxable: line.taxable,
        })
    }
}

// Posts the SALES_TAX_DOCUMENTS fixture documents in order (spec §5: October 2026,
// a group rate over two agencies, a sales receipt with no customer, a 0% rate, a
// document with no taxable line), keeps the draft a draft, and voids
// SALES_TAX_LIABILITY_VOID_TARGET after its post, so a dev book shows a void drop out.
// The void is the update the invoice read view's Void sends: no revision (the server
// refuses a void that sends one). `accountIds` maps a seed account number to the
// created account's id; `customerIds` maps a customer-form fixture id to the created
// customer's id.
export async function seedSalesTaxLiability(
    pb: PocketBase,
    ctx: SeedContext,
    accountIds: Map<string, string>,
    customerIds: Map<string, string>
): Promise<void> {
    for (const fixture of SALES_TAX_DOCUMENTS) {
        await createSalesTaxDocument(pb, fixture, accountIds, customerIds)
        if (fixture.status === 'draft') continue
        const collection = fixture.kind === 'invoice' ? 'books_invoices' : 'books_sales_receipts'
        await postSeedDocument(pb, collection, fixture.id, ctx.user.id)
        if (fixture.id === SALES_TAX_LIABILITY_VOID_TARGET) {
            await pb
                .collection(collection)
                .update(fixture.id, { status: 'void', voided_by: ctx.user.id })
        }
    }
}

// Makes the fixture's inactive tax rows inactive once the documents under them are
// posted: groups, then rates, then agencies, because the rate guard refuses a rate in
// an active group and the agency guard an agency with active rates.
export async function retireSeededTax(pb: PocketBase): Promise<void> {
    for (const row of TAX_GROUPS.filter(g => g.inactive)) {
        await pb.collection('books_tax_rates').update(row.id, { inactive: true })
    }
    for (const row of TAX_RATES.filter(r => r.inactive)) {
        await pb.collection('books_tax_rates').update(row.id, { inactive: true })
    }
    for (const agency of TAX_AGENCIES.filter(a => a.inactive)) {
        await pb.collection('books_tax_agencies').update(agency.id, { inactive: true })
    }
}

// Creates the ESTIMATE_SEED_IDS fixture estimates, in order, through the writes the
// estimate form makes: create the estimate with its status, then its lines. The server
// numbers each at its create (1001 to 1005 on a fresh book; the fixture's numbers are
// the same), computes every amount and the totals, and writes no journal entry. A
// closed estimate is closed only by the first save of an invoice made from it, so the
// closed one is created Accepted and then closed by seedConvertedInvoice. The product
// and tax rate fixture ids are valid PocketBase ids and are sent as-is; `customerIds`
// maps a customer-form fixture id to the created customer's id.
export async function seedEstimates(
    pb: PocketBase,
    customerIds: Map<string, string>
): Promise<void> {
    const createdIds = new Map<string, string>()
    for (const id of ESTIMATE_SEED_IDS) {
        const fixture = ESTIMATES.find(row => row.id === id)
        if (fixture === undefined) throw new Error(`seed: estimate ${id} is not in ESTIMATES`)
        const customer = customerIds.get(fixture.customer)
        if (customer === undefined) {
            throw new Error(
                `seed: estimate ${id} names customer ${fixture.customer}, which was not created`
            )
        }
        const status = fixture.status === 'closed' ? 'accepted' : fixture.status
        const created = await pb.collection('books_estimates').create({
            customer,
            status,
            date: fixture.date,
            expiration_date: fixture.expiration_date,
            accepted_by: fixture.accepted_by,
            accepted_date: fixture.accepted_date,
            tax_rate: fixture.tax_rate,
            message: fixture.message,
            memo: fixture.memo,
            bill_to: fixture.bill_to,
            email: fixture.email,
        })
        for (const line of ESTIMATE_LINES.filter(row => row.estimate === id)) {
            await pb.collection('books_estimate_lines').create({
                estimate: created.id,
                position: line.position,
                kind: line.kind,
                product: line.product,
                description: line.description,
                quantity: line.quantity,
                rate: line.rate,
                percent_ppm: line.percent_ppm,
                taxable: line.taxable,
            })
        }
        createdIds.set(id, created.id)
    }
    await seedConvertedInvoice(pb, customerIds, createdIds)
}

function salesListCustomer(customerIds: Map<string, string>, fixtureId: string, owner: string) {
    if (fixtureId === '') return ''
    const customer = customerIds.get(fixtureId)
    if (customer === undefined) {
        throw new Error(`seed: ${owner} names customer ${fixtureId}, which was not created`)
    }
    return customer
}

// Creates the sales lists' draft documents (SALES_LIST_SEED_DRAFTS) with the create call
// each kind's seed makes for its draft step, and no post: a draft moves no ledger total
// and takes no number. The fixture ids are valid PocketBase ids and are sent as-is;
// `customerIds` maps a customer-form fixture id to the created customer's id. A sales
// receipt needs a deposit account even as a draft, so it takes 1200 Undeposited funds, as
// the seeded receipt drafts do; a draft payment has none and no application row.
export async function seedSalesListDrafts(
    pb: PocketBase,
    accountIds: Map<string, string>,
    customerIds: Map<string, string>
): Promise<void> {
    for (const row of SALES_LIST_SEED_DRAFTS.invoices) {
        await pb.collection('books_invoices').create({
            id: row.id,
            customer: salesListCustomer(customerIds, row.customer, `invoice ${row.id}`),
            status: 'draft',
            date: row.date,
            due_date: row.due_date,
            memo: row.memo,
        })
    }
    const depositTo = seededAccountId(accountIds, '1200', 'the sales list receipt drafts')
    for (const row of SALES_LIST_SEED_DRAFTS.salesReceipts) {
        await pb.collection('books_sales_receipts').create({
            id: row.id,
            customer: salesListCustomer(customerIds, row.customer, `sales receipt ${row.id}`),
            status: 'draft',
            date: row.date,
            deposit_to: depositTo,
            memo: row.memo,
        })
    }
    for (const row of SALES_LIST_SEED_DRAFTS.payments) {
        await pb.collection('books_payments').create({
            id: row.id,
            customer: salesListCustomer(customerIds, row.customer, `payment ${row.id}`),
            status: 'draft',
            date: row.date,
            amount: row.amount,
            memo: row.memo,
        })
    }
    for (const row of SALES_LIST_SEED_DRAFTS.creditMemos) {
        await pb.collection('books_credit_memos').create({
            id: row.id,
            customer: salesListCustomer(customerIds, row.customer, `credit memo ${row.id}`),
            status: 'draft',
            date: row.date,
            memo: row.memo,
        })
    }
}

// Creates party contacts as the contact dialog does, with server-assigned ids (the
// fixture's `id`, `created` and `updated` are not sent). Saving a primary contact clears
// the flag on its party's other contacts, so the primaries are created last and stay
// primary. `partyOf` gives the row's stored party columns, or throws for a party that was
// not created.
async function createPartyContacts(
    pb: PocketBase,
    contacts: readonly BooksPartyContacts[],
    partyOf: (contact: BooksPartyContacts) => Pick<BooksPartyContacts, 'customer' | 'vendor'>
): Promise<void> {
    const primariesLast = [
        ...contacts.filter(c => !c.is_primary),
        ...contacts.filter(c => c.is_primary),
    ]
    for (const contact of primariesLast) {
        const { id: _id, created: _created, updated: _updated, ...row } = contact
        await pb.collection('books_party_contacts').create({ ...row, ...partyOf(contact) })
    }
}

// Creates the customer page's contacts (CUSTOMER_PAGE_CONTACTS). `customerIds` maps a
// customer-form fixture id to the created customer's id.
export async function seedPartyContacts(
    pb: PocketBase,
    customerIds: Map<string, string>
): Promise<void> {
    await createPartyContacts(pb, CUSTOMER_PAGE_CONTACTS, contact => {
        const customer = customerIds.get(contact.customer)
        if (customer === undefined) {
            throw new Error(
                `seed: contact ${contact.id} names customer ${contact.customer}, which was not created`
            )
        }
        return { customer, vendor: contact.vendor }
    })
}

// Creates the vendor page's contacts (VENDOR_PAGE_CONTACTS). seedVendors keeps the
// vendor-form fixture ids, so a contact's vendor id is sent as it is.
export async function seedVendorContacts(pb: PocketBase): Promise<void> {
    const vendorIds = new Set(VENDORS.map(vendor => vendor.id))
    await createPartyContacts(pb, VENDOR_PAGE_CONTACTS, contact => {
        if (!vendorIds.has(contact.vendor)) {
            throw new Error(
                `seed: contact ${contact.name} names vendor ${contact.vendor}, which is not a seeded vendor`
            )
        }
        return { customer: contact.customer, vendor: contact.vendor }
    })
}

// The days a seeded declined estimate stays open before its customer's answer: the
// response guard refuses an answer on an expired estimate, so the expiration date is
// after the seed's today (the fixture's fixed date would make the seed fail later).
const DECLINE_SEED_OPEN_DAYS = 90

// Creates the DECLINE_ESTIMATES (1006 and 1007, right after seedEstimates' five) Pending
// with their lines, then saves each one's DECLINE_RESPONSES row as the superuser, not
// through a public request. The server's response guard runs on that create and sets the
// estimate to Rejected, so the seeded state is the one a real decline makes. The server
// gives each estimate its public token; the fixture's is never sent.
export async function seedDeclinedEstimates(
    pb: PocketBase,
    customerIds: Map<string, string>
): Promise<void> {
    const now = new Date()
    const expirationDate = isoDay(
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + DECLINE_SEED_OPEN_DAYS)
    )
    for (const fixture of DECLINE_ESTIMATES) {
        const customer = customerIds.get(fixture.customer)
        if (customer === undefined) {
            throw new Error(
                `seed: declined estimate ${fixture.id} names customer ${fixture.customer}, which was not created`
            )
        }
        const response = DECLINE_RESPONSES.find(row => row.estimate === fixture.id)
        if (response === undefined) {
            throw new Error(`seed: declined estimate ${fixture.id} has no DECLINE_RESPONSES row`)
        }
        const created = await pb.collection('books_estimates').create({
            customer,
            status: 'pending',
            date: fixture.date,
            expiration_date: expirationDate,
            tax_rate: fixture.tax_rate,
            message: fixture.message,
            memo: fixture.memo,
            bill_to: fixture.bill_to,
            email: fixture.email,
        })
        for (const line of DECLINE_ESTIMATE_LINES.filter(row => row.estimate === fixture.id)) {
            await pb.collection('books_estimate_lines').create({
                estimate: created.id,
                position: line.position,
                kind: line.kind,
                product: line.product,
                description: line.description,
                quantity: line.quantity,
                rate: line.rate,
                percent_ppm: line.percent_ppm,
                taxable: line.taxable,
            })
        }
        await pb.collection('books_estimate_responses').create({
            estimate: created.id,
            decision: response.decision,
            name: response.name,
            reason: response.reason,
        })
    }
}

// Saves CONVERTED_INVOICE as a draft that names its estimate, then its lines, as the
// invoice form made from an estimate does: the server closes the estimate at this first
// save. A draft posts nothing. `estimateIds` maps an estimate fixture id to the created
// estimate's id.
async function seedConvertedInvoice(
    pb: PocketBase,
    customerIds: Map<string, string>,
    estimateIds: Map<string, string>
): Promise<void> {
    const invoice = CONVERTED_INVOICE
    const customer = customerIds.get(invoice.customer)
    const estimate = estimateIds.get(invoice.estimate)
    if (customer === undefined || estimate === undefined) {
        throw new Error(
            `seed: the converted invoice names customer ${invoice.customer} and estimate ${invoice.estimate}; one was not created`
        )
    }
    const created = await pb.collection('books_invoices').create({
        customer,
        status: 'draft',
        date: invoice.date,
        due_date: invoice.due_date,
        terms: invoice.terms,
        tax_rate: invoice.tax_rate,
        message: invoice.message,
        memo: invoice.memo,
        bill_to: invoice.bill_to,
        email: invoice.email,
        estimate,
    })
    for (const line of CONVERTED_INVOICE_LINES) {
        await pb.collection('books_invoice_lines').create({
            invoice: created.id,
            position: line.position,
            kind: line.kind,
            product: line.product,
            description: line.description,
            quantity: line.quantity,
            rate: line.rate,
            percent_ppm: line.percent_ppm,
            taxable: line.taxable,
        })
    }
}

// Saves the BILL_SEED_IDS fixture bills, in order, through the writes the bill form
// makes: create the draft, create its lines, then post it, so the server numbers each
// (1001 void, 1002, 1003 on a fresh book, as the fixture shows), computes every product
// line's amount and the totals, and writes the journal entry; the void one is then
// voided, and the draft stays a draft. An account line's amount is typed, so it is sent;
// a product line's is the server's. A line names its account by seed account number;
// `accountIds` maps it to the created account's id. The vendor and product fixture ids
// are valid PocketBase ids and are sent as-is. Returns the created id of each fixture
// bill, by fixture id.
export async function seedBills(
    pb: PocketBase,
    ctx: SeedContext,
    accountIds: Map<string, string>
): Promise<Map<string, string>> {
    const billIds = new Map<string, string>()
    for (const id of BILL_SEED_IDS) {
        const fixture = BILLS.find(row => row.id === id)
        if (fixture === undefined) throw new Error(`seed: bill ${id} is not in BILLS`)
        const created = await pb.collection('books_bills').create({
            vendor: fixture.vendor,
            status: 'draft',
            date: fixture.date,
            due_date: fixture.due_date,
            terms: fixture.terms,
            ref_no: fixture.ref_no,
            memo: fixture.memo,
            mailing_address: fixture.mailing_address,
        })
        billIds.set(id, created.id)
        for (const line of BILL_LINES.filter(row => row.bill === id)) {
            const account = seededAccountId(accountIds, line.account_number, `bill line ${line.id}`)
            const typed =
                line.kind === 'account'
                    ? { account, amount: line.amount }
                    : { product: line.product, quantity: line.quantity, rate: line.rate }
            await pb.collection('books_bill_lines').create({
                bill: created.id,
                position: line.position,
                kind: line.kind,
                description: line.description,
                ...typed,
            })
        }
        if (fixture.status === 'draft') continue
        await postSeedDocument(pb, 'books_bills', created.id, ctx.user.id)
        if (fixture.status === 'void') {
            await pb
                .collection('books_bills')
                .update(created.id, { status: 'void', voided_by: ctx.user.id })
        }
    }
    for (const fixture of PAY_BILLS_SEED_BILLS) {
        const vendor = VENDORS.find(row => row.id === fixture.vendor)
        if (vendor === undefined) {
            throw new Error(
                `seed: bill ${fixture.key} names vendor ${fixture.vendor}, not in VENDORS`
            )
        }
        const created = await pb.collection('books_bills').create({
            vendor: fixture.vendor,
            status: 'draft',
            date: fixture.date,
            due_date: fixture.due_date,
            terms: vendor.terms,
            ref_no: fixture.ref_no,
            memo: fixture.memo,
            mailing_address: vendor.address,
        })
        await pb.collection('books_bill_lines').create({
            bill: created.id,
            position: 0,
            kind: 'account',
            description: '',
            account: seededAccountId(accountIds, fixture.accountNumber, `bill ${fixture.key}`),
            amount: fixture.amount,
        })
        await postSeedDocument(pb, 'books_bills', created.id, ctx.user.id)
    }
    return billIds
}

// Pays the bills PAY_BILLS_SEED_BILLS posted, per BILL_PAYMENT_SEED, through the write Pay
// Bills makes: ONE batch holds the payment create (status posted) and its line, and the
// server posts the payment from the create's request hook. The bill is found by the memo
// seedBills gave it, and Paid from by its seed account number. The payment id is set here
// because its line, in the same batch, must name it. The `void` row is then voided by a
// superuser write, which keeps the body's voided_by.
export async function seedBillPayments(
    pb: PocketBase,
    ctx: SeedContext,
    accountIds: Map<string, string>
): Promise<void> {
    for (const row of BILL_PAYMENT_SEED) {
        const bill = await pb
            .collection('books_bills')
            .getFirstListItem<{ id: string; vendor: string }>(
                pb.filter('memo = {:memo} && status = "posted"', { memo: row.billMemo }),
                { fields: 'id,vendor' }
            )
        // A PocketBase id is exactly 15 characters: 'bpseedpartial00', 'bpseedvoid00000'.
        const id = `bpseed${row.key}`.padEnd(15, '0')
        const batch = pb.createBatch()
        batch.collection('books_bill_payments').create({
            id,
            vendor: bill.vendor,
            paid_from: seededAccountId(accountIds, row.paidFromNumber, `bill payment ${row.key}`),
            payment_method: row.payment_method,
            reference_no: row.reference_no,
            status: 'posted',
            date: row.date,
            posted_by: ctx.user.id,
        })
        batch.collection('books_bill_payment_lines').create({
            payment: id,
            bill: bill.id,
            amount: row.amount,
            position: 0,
        })
        await batch.send()
        if (row.key === 'void') {
            await pb
                .collection('books_bill_payments')
                .update(id, { status: 'void', voided_by: ctx.user.id })
        }
    }
}

// Saves the EXPENSE_SEED_IDS fixture expenses, in order, through the writes the expense
// form makes, as seedBills does: create the draft, create its lines, then post it, so the
// server numbers each (1001 void, 1002, 1003 on a fresh book, as the fixture shows),
// computes every product line's amount and the totals, and writes the journal entry; the
// void one is then voided, and the draft stays a draft. Paid from and each account line
// name their account by seed account number; `accountIds` maps it to the created
// account's id. Returns the created id of each fixture expense, by fixture id.
export async function seedExpenses(
    pb: PocketBase,
    ctx: SeedContext,
    accountIds: Map<string, string>
): Promise<Map<string, string>> {
    const expenseIds = new Map<string, string>()
    for (const id of EXPENSE_SEED_IDS) {
        const fixture = EXPENSES.find(row => row.id === id)
        if (fixture === undefined) throw new Error(`seed: expense ${id} is not in EXPENSES`)
        const created = await pb.collection('books_expenses').create({
            vendor: fixture.vendor,
            status: 'draft',
            date: fixture.date,
            paid_from: seededAccountId(accountIds, fixture.paid_from_number, `expense ${id}`),
            payment_method: fixture.payment_method,
            reference_no: fixture.reference_no,
            memo: fixture.memo,
        })
        expenseIds.set(id, created.id)
        for (const line of EXPENSE_LINES.filter(row => row.expense === id)) {
            const account = seededAccountId(
                accountIds,
                line.account_number,
                `expense line ${line.id}`
            )
            const typed =
                line.kind === 'account'
                    ? { account, amount: line.amount }
                    : { product: line.product, quantity: line.quantity, rate: line.rate }
            await pb.collection('books_expense_lines').create({
                expense: created.id,
                position: line.position,
                kind: line.kind,
                description: line.description,
                ...typed,
            })
        }
        if (fixture.status === 'draft') continue
        await postSeedDocument(pb, 'books_expenses', created.id, ctx.user.id)
        if (fixture.status === 'void') {
            await pb
                .collection('books_expenses')
                .update(created.id, { status: 'void', voided_by: ctx.user.id })
        }
    }
    return expenseIds
}

// Saves the VENDOR_CREDIT_SEED_IDS fixture credits, in order, through the writes the vendor
// credit form makes, as seedBills does: create the draft, create its lines, then post it, so
// the server numbers each (1001 unapplied, 1002 partly, 1003 void on a fresh book, as the
// fixture shows), computes every product line's amount, the totals and the balance, and
// writes the journal entry; the void one is then voided, and the draft stays a draft. No
// application is written here. An account line names its account by seed account number;
// `accountIds` maps it to the created account's id. Returns the created id of each fixture
// credit, by fixture id.
export async function seedVendorCredits(
    pb: PocketBase,
    ctx: SeedContext,
    accountIds: Map<string, string>
): Promise<Map<string, string>> {
    const creditIds = new Map<string, string>()
    for (const id of VENDOR_CREDIT_SEED_IDS) {
        const fixture = VENDOR_CREDITS.find(row => row.id === id)
        if (fixture === undefined)
            throw new Error(`seed: vendor credit ${id} is not in VENDOR_CREDITS`)
        const created = await pb.collection('books_vendor_credits').create({
            vendor: fixture.vendor,
            status: 'draft',
            date: fixture.date,
            ref_no: fixture.ref_no,
            memo: fixture.memo,
        })
        creditIds.set(id, created.id)
        for (const line of VENDOR_CREDIT_LINES.filter(row => row.vendor_credit === id)) {
            const account = seededAccountId(
                accountIds,
                line.account_number,
                `vendor credit line ${line.id}`
            )
            const typed =
                line.kind === 'account'
                    ? { account, amount: line.amount }
                    : { product: line.product, quantity: line.quantity, rate: line.rate }
            await pb.collection('books_vendor_credit_lines').create({
                vendor_credit: created.id,
                position: line.position,
                kind: line.kind,
                description: line.description,
                ...typed,
            })
        }
        if (fixture.status === 'draft') continue
        await postSeedDocument(pb, 'books_vendor_credits', created.id, ctx.user.id)
        if (fixture.status === 'void') {
            await pb
                .collection('books_vendor_credits')
                .update(created.id, { status: 'void', voided_by: ctx.user.id })
        }
    }
    return creditIds
}

// Posts VENDOR_CREDIT_SEED_BILL through the writes seedBills makes (one account line), then
// applies the partly applied credit to it with the VENDOR_CREDIT_SEED_APPLICATION_IDS rows,
// through the REST create the apply dialog makes, so the server checks each application and
// lowers the credit's and the bill's balance. The bill is of a vendor with no other open
// bill and the application covers it in full, so it reads Paid and no Pay Bills row
// changes. `creditIds` maps a fixture credit id to the created one. The fixture's appliers
// are reference users the seed does not create: the superuser names the seeded user, and
// the request hook keeps the applier a superuser sends.
export async function seedVendorCreditApplications(
    pb: PocketBase,
    ctx: SeedContext,
    accountIds: Map<string, string>,
    creditIds: Map<string, string>
): Promise<void> {
    const vendor = VENDORS.find(row => row.id === VENDOR_CREDIT_SEED_BILL.vendor)
    if (vendor === undefined) {
        throw new Error(
            `seed: bill ${VENDOR_CREDIT_SEED_BILL.id} names vendor ${VENDOR_CREDIT_SEED_BILL.vendor}, not in VENDORS`
        )
    }
    const bill = await pb.collection('books_bills').create({
        vendor: VENDOR_CREDIT_SEED_BILL.vendor,
        status: 'draft',
        date: VENDOR_CREDIT_SEED_BILL.date,
        due_date: VENDOR_CREDIT_SEED_BILL.due_date,
        terms: vendor.terms,
        ref_no: VENDOR_CREDIT_SEED_BILL.ref_no,
        memo: VENDOR_CREDIT_SEED_BILL.memo,
        mailing_address: vendor.address,
    })
    await pb.collection('books_bill_lines').create({
        bill: bill.id,
        position: 0,
        kind: 'account',
        description: VENDOR_CREDIT_SEED_BILL.description,
        account: seededAccountId(
            accountIds,
            VENDOR_CREDIT_SEED_BILL.account_number,
            `bill ${VENDOR_CREDIT_SEED_BILL.id}`
        ),
        amount: VENDOR_CREDIT_SEED_BILL.total,
    })
    await postSeedDocument(pb, 'books_bills', bill.id, ctx.user.id)
    const billIds = new Map<string, string>([[VENDOR_CREDIT_SEED_BILL.id, bill.id]])
    for (const id of VENDOR_CREDIT_SEED_APPLICATION_IDS) {
        const fixture = VENDOR_CREDIT_APPLICATIONS.find(row => row.id === id)
        if (fixture === undefined) {
            throw new Error(`seed: application ${id} is not in VENDOR_CREDIT_APPLICATIONS`)
        }
        const credit = creditIds.get(fixture.vendor_credit)
        const appliedTo = billIds.get(fixture.bill)
        if (credit === undefined || appliedTo === undefined) {
            throw new Error(
                `seed: application ${id} names a credit or a bill the seed did not post`
            )
        }
        await pb.collection('books_vendor_credit_applications').create({
            id,
            vendor_credit: credit,
            bill: appliedTo,
            amount: fixture.amount,
            date: fixture.date,
            applied_by: ctx.user.id,
        })
    }
}

// Posts the one vendor credit of VENDOR_REFUND_SEED_CREDIT_IDS (Cascade Fuel & Fleet: no
// other seeded credit and no open bill) through the writes seedVendorCredits makes (draft,
// its one account line, then posted), then writes VENDOR_REFUND_SEED_IDS in that order as
// seedPayments writes a payment: the draft, its lines on the created credit, then the post
// with the seeded user as poster. The server numbers the posted ones (1001, 1002 on a fresh
// book), writes their entries and lowers the credit's balance; the void one is then voided,
// which gives its amount back, and the draft stays a draft. The credit ends with 275.00
// unapplied. A refund's Refunded to resolves by the fixture account's number in
// `accountIds`.
export async function seedVendorRefunds(
    pb: PocketBase,
    ctx: SeedContext,
    accountIds: Map<string, string>
): Promise<void> {
    const creditIds = new Map<string, string>()
    for (const id of VENDOR_REFUND_SEED_CREDIT_IDS) {
        const fixture = refundCreditById(id)
        if (fixture === undefined)
            throw new Error(`seed: vendor credit ${id} is not in the fixture`)
        const created = await pb.collection('books_vendor_credits').create({
            vendor: fixture.vendor,
            status: 'draft',
            date: fixture.date,
            ref_no: fixture.ref_no,
            memo: fixture.memo,
        })
        creditIds.set(id, created.id)
        const line = VENDOR_REFUND_SEED_CREDIT_LINE
        await pb.collection('books_vendor_credit_lines').create({
            vendor_credit: created.id,
            position: 0,
            kind: 'account',
            description: line.description,
            account: seededAccountId(accountIds, line.account_number, `vendor credit ${id}`),
            amount: line.amount,
        })
        await postSeedDocument(pb, 'books_vendor_credits', created.id, ctx.user.id)
    }
    for (const id of VENDOR_REFUND_SEED_IDS) {
        const fixture = VENDOR_REFUNDS.find(row => row.id === id)
        if (fixture === undefined)
            throw new Error(`seed: vendor refund ${id} is not in VENDOR_REFUNDS`)
        const accountNumber = REFUND_ACCOUNTS.find(row => row.id === fixture.refunded_to)?.number
        const refundedTo = seededAccountId(accountIds, accountNumber ?? '', `vendor refund ${id}`)
        const created = await pb.collection('books_vendor_refunds').create({
            vendor: fixture.vendor,
            status: 'draft',
            date: fixture.date,
            payment_method: fixture.payment_method,
            reference_no: fixture.reference_no,
            refunded_to: refundedTo,
            amount: fixture.amount,
            memo: fixture.memo,
        })
        for (const line of linesOfRefund(id)) {
            const credit = creditIds.get(line.vendor_credit)
            if (credit === undefined) {
                throw new Error(`seed: vendor refund ${id} names a credit the seed did not post`)
            }
            await pb.collection('books_vendor_refund_lines').create({
                refund: created.id,
                vendor_credit: credit,
                amount: line.amount,
                position: line.position,
            })
        }
        if (fixture.status === 'draft') continue
        await pb
            .collection('books_vendor_refunds')
            .update(created.id, { status: 'posted', posted_by: ctx.user.id })
        if (fixture.status === 'void') {
            await pb
                .collection('books_vendor_refunds')
                .update(created.id, { status: 'void', voided_by: ctx.user.id })
        }
    }
}

// The seeded bytes of one attachment, decoded with atob so the seed runs in plain node and
// in the app alike.
function seedFileBytes(id: (typeof SEED_ATTACHMENT_IDS)[number]) {
    return Uint8Array.from(atob(ATTACHMENT_SEED_FILES[id]), c => c.charCodeAt(0))
}

// Uploads the SEED_ATTACHMENT_IDS files, in order, through the REST create, so the server's
// upload hook checks and stamps each file the way an upload from the app is checked. The
// fixture's uploaders are invoice users the seed does not create: the superuser names the
// seeded user, and the hook keeps the uploader a superuser sends. `billIds` and `expenseIds`
// map a fixture document id to the created one.
export async function seedAttachments(
    pb: PocketBase,
    ctx: SeedContext,
    billIds: Map<string, string>,
    expenseIds: Map<string, string>
): Promise<void> {
    for (const id of SEED_ATTACHMENT_IDS) {
        const fixture = ATTACHMENTS.find(row => row.id === id)
        if (fixture === undefined) throw new Error(`seed: attachment ${id} is not in ATTACHMENTS`)
        const column = fixture.bill !== '' ? 'bill' : 'expense'
        const documentId =
            column === 'bill' ? billIds.get(fixture.bill) : expenseIds.get(fixture.expense)
        if (documentId === undefined) {
            throw new Error(`seed: attachment ${id} names a document the seed did not create`)
        }
        await pb.collection('books_attachments').create({
            [column]: documentId,
            field: fixture.field,
            uploaded_by: ctx.user.id,
            file: new File([seedFileBytes(id)], fixture.name, { type: fixture.mime_type }),
        })
    }
}

interface PostInput {
    date: string
    memo: string
    lines: SeedLine[]
    replaces?: string
}

async function postEntry(
    pb: PocketBase,
    ctx: SeedContext,
    ids: Map<string, string>,
    input: PostInput
): Promise<string> {
    const created = await pb.collection('books_journal_entries').create({
        date: input.date,
        memo: input.memo,
        status: 'draft',
        doc_type: 'journal',
        origin: 'manual',
        created_by: ctx.user.id,
        ...(input.replaces ? { replaces: input.replaces } : {}),
    })
    for (const [position, [key, debit, credit]] of input.lines.entries()) {
        await pb.collection('books_journal_lines').create({
            entry: created.id,
            account: ids.get(key),
            debit,
            credit,
            position,
        })
    }
    await postSeedDraft(pb, created.id, ctx.user.id)
    return created.id
}

// Dated relative to today so the register has rows in This month and This fiscal year on any date.
async function seedRegisterEntries(pb: PocketBase, ctx: SeedContext, ids: Map<string, string>) {
    const now = new Date()
    const today = isoDay(now)
    const settings = (await pb.collection('books_settings').getFullList({ perPage: 1 }))[0]
    const fiscalStart = fiscalYearStart(now, settings?.fiscal_year_start_month ?? 1)
    // A second day in This month, so the register's date order compares two days. On the 1st
    // the month has no earlier day.
    const monthStart = isoDay(new Date(now.getFullYear(), now.getMonth(), 1))
    if (monthStart !== today) {
        await postEntry(pb, ctx, ids, {
            date: monthStart,
            memo: 'Register month start',
            lines: [
                ['checking', 2000, 0],
                ['equity', 0, 2000],
            ],
        })
    }
    await postEntry(pb, ctx, ids, {
        date: today,
        memo: 'Register sale',
        lines: [
            ['checking', 125000, 0],
            ['receivable', 0, 125000],
        ],
    })
    await postEntry(pb, ctx, ids, {
        date: today,
        memo: 'Register split payment',
        lines: [
            ['checking', 0, 30000],
            ['rent', 20000, 0],
            ['software', 10000, 0],
        ],
    })
    await postEntry(pb, ctx, ids, {
        date: fiscalStart,
        memo: 'Register fiscal year start',
        lines: [
            ['checking', 50000, 0],
            ['equity', 0, 50000],
        ],
    })
    // Dated today, not at the fiscal start: e2e specs change the fiscal start month on the
    // shared DB, and today is inside This fiscal year for any start month.
    await postEntry(pb, ctx, ids, {
        date: today,
        memo: 'Register long memo '.repeat(12).trim(),
        lines: [
            ['checking', 100, 0],
            ['equity', 0, 100],
        ],
    })
    const original = await postEntry(pb, ctx, ids, {
        date: today,
        memo: 'Register void original',
        lines: [
            ['checking', 40000, 0],
            ['receivable', 0, 40000],
        ],
    })
    await postEntry(pb, ctx, ids, {
        date: today,
        memo: 'Register corrected',
        replaces: original,
        lines: [
            ['checking', 45000, 0],
            ['receivable', 0, 45000],
        ],
    })
}

// One entry per lifecycle state, dated today so the list's fiscal-year range shows them on any date.
async function seedJournalEntries(pb: PocketBase, ctx: SeedContext, ids: Map<string, string>) {
    const now = new Date()
    const today = isoDay(now)
    const nextMonth = isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 1))
    for (const seedEntry of JOURNAL_SEED) {
        const created = await pb.collection('books_journal_entries').create({
            date: today,
            memo: seedEntry.memo,
            status: 'draft',
            doc_type: 'journal',
            origin: 'manual',
            created_by: ctx.user.id,
            ...(seedEntry.autoReverse ? { auto_reverse_on: nextMonth } : {}),
        })
        for (const [position, [key, debit, credit]] of seedEntry.lines.entries()) {
            await pb.collection('books_journal_lines').create({
                entry: created.id,
                account: ids.get(key),
                debit,
                credit,
                position,
            })
        }
        if (seedEntry.state === 'draft') continue
        await postSeedDraft(pb, created.id, ctx.user.id)
        if (seedEntry.state === 'reversed') {
            // The server writes the mirrored lines when the reversal posts.
            const reversal = await pb.collection('books_journal_entries').create({
                date: today,
                memo: `Reversal of ${seedEntry.memo}`,
                status: 'draft',
                doc_type: 'journal',
                origin: 'reversal',
                reverses: created.id,
                created_by: ctx.user.id,
            })
            await postSeedDraft(pb, reversal.id, ctx.user.id)
        }
        if (seedEntry.state === 'voided') {
            await pb.collection('books_journal_entries').update(created.id, { status: 'void' })
        }
    }
}

// Entries whose lines name a customer or a vendor, so the Name column shows in the
// seeded book. Created after the customers and vendors they name. A customer fixture id
// holds `_`, so `customerIds` maps it to the created customer; a vendor keeps its
// fixture id (seedVendors).
const PARTY_ENTRY_DAYS = ['10-20', '10-14']

async function seedPartyEntries(
    pb: PocketBase,
    ctx: SeedContext,
    ids: Map<string, string>,
    customerIds: Map<string, string>
) {
    const year = new Date().getFullYear()
    for (const [index, seedEntry] of GENERAL_LEDGER_PARTY_SEED.entries()) {
        const lines = seedEntry.lines.map(line => {
            const account = ids.get(line.account)
            const customer = line.customer ? customerIds.get(line.customer) : ''
            if (account === undefined || customer === undefined) {
                throw new Error(
                    `seed: party entry "${seedEntry.memo}" names account ${line.account} or customer ${line.customer}, which was not created`
                )
            }
            return {
                account,
                debit: line.debit,
                credit: line.credit,
                memo: line.memo,
                customer,
                vendor: line.vendor,
            }
        })
        await postSeedJournalEntry(pb, ctx, {
            date: `${year}-${PARTY_ENTRY_DAYS[index]}`,
            memo: seedEntry.memo,
            lines,
        })
    }
}

interface SeedJournalLine {
    account: string
    debit: number
    credit: number
    memo?: string
    customer: string
    vendor?: string
}

// A draft manual journal entry with its lines in the given order, then posted. Each line
// names created records (account, customer), not seed keys or fixture ids.
async function postSeedJournalEntry(
    pb: PocketBase,
    ctx: SeedContext,
    entry: { date: string; memo: string; lines: SeedJournalLine[] }
): Promise<void> {
    const created = await pb.collection('books_journal_entries').create({
        date: entry.date,
        memo: entry.memo,
        status: 'draft',
        doc_type: 'journal',
        origin: 'manual',
        created_by: ctx.user.id,
    })
    for (const [position, line] of entry.lines.entries()) {
        await pb.collection('books_journal_lines').create({ entry: created.id, ...line, position })
    }
    await postSeedDraft(pb, created.id, ctx.user.id)
}

// The Customer Balance's seed rows (CUSTOMER_BALANCE_SEED, plan D2): an invoice for the
// sub-customer Harborview Kitchen, one for the long-named St. Jude gala, an Accounts
// receivable entry with no customer, and one that names the inactive Old Mill Bakery. The
// invoices are created as seedInvoices creates one (draft, one untaxed item line, then the
// post); the entries as seedPartyEntries creates one. `ids` maps a seed account key to the
// created account; `customerIds` maps a customer-form fixture id to the created customer.
export async function seedCustomerBalance(
    pb: PocketBase,
    ctx: SeedContext,
    ids: Map<string, string>,
    customerIds: Map<string, string>
): Promise<void> {
    const { kitchenInvoice, galaInvoice, noCustomerEntry, inactiveEntry } = CUSTOMER_BALANCE_SEED
    for (const invoice of [kitchenInvoice, galaInvoice]) {
        await postCustomerBalanceInvoice(pb, ctx, customerIds, invoice)
    }
    await postCustomerBalanceEntry(pb, ctx, ids, '', noCustomerEntry)

    const oldMill = customerIds.get(inactiveEntry.customer)
    if (oldMill === undefined) {
        throw new Error(
            `seed: customer balance entry names customer ${inactiveEntry.customer}, which was not created`
        )
    }
    // The line guard (checkLineParty, server/lines.go) refuses a new line that names an
    // inactive customer, so Old Mill Bakery is made active for the post and inactive again
    // after it, as retireSeededTax retires rates after the documents under them.
    await pb.collection('books_customers').update(oldMill, { inactive: false })
    await postCustomerBalanceEntry(pb, ctx, ids, oldMill, inactiveEntry)
    await pb.collection('books_customers').update(oldMill, { inactive: true })
}

// The sales reports' seed row (SALES_REPORTS_SEED, plan D4): the one sale of an inactive
// product, a posted sales receipt of Fax line setup for the inactive Old Mill Bakery, with
// no tax rate, deposited where the seeded posted receipt with a customer deposits. The
// line guard refuses an inactive product (server/products.go) and the document guard an
// inactive customer (checkLineParty, server/lines.go), so both are made active for the
// post and inactive again after it, as seedCustomerBalance does. `accountIds` maps a seed
// account number to the created account; `customerIds` maps a customer-form fixture id to
// the created customer.
export async function seedSalesReports(
    pb: PocketBase,
    ctx: SeedContext,
    accountIds: Map<string, string>,
    customerIds: Map<string, string>
): Promise<void> {
    const sale = SALES_REPORTS_SEED.inactiveSale
    const customer = customerIds.get(sale.customerId)
    if (customer === undefined) {
        throw new Error(
            `seed: sales reports receipt names customer ${sale.customerId}, which was not created`
        )
    }
    const withCustomer = SALES_RECEIPTS.find(row => row.id === SALES_RECEIPT_SEED_IDS[0])
    const number = DEPOSIT_ACCOUNTS.find(row => row.id === withCustomer?.deposit_to)?.number
    const depositTo = number === undefined ? undefined : accountIds.get(number)
    if (depositTo === undefined) {
        throw new Error('seed: the sales reports receipt has no deposit account')
    }
    await pb.collection('books_customers').update(customer, { inactive: false })
    await pb.collection('books_products').update(sale.productId, { inactive: false })
    const created = await pb.collection('books_sales_receipts').create({
        customer,
        status: 'draft',
        date: sale.date,
        payment_method: 'check',
        deposit_to: depositTo,
        memo: sale.memo,
    })
    await pb.collection('books_sales_receipt_lines').create({
        sales_receipt: created.id,
        position: 0,
        kind: 'item',
        product: sale.productId,
        quantity: 1,
        rate: sale.cents,
        taxable: false,
    })
    await postSeedDocument(pb, 'books_sales_receipts', created.id, ctx.user.id)
    await pb.collection('books_products').update(sale.productId, { inactive: true })
    await pb.collection('books_customers').update(customer, { inactive: true })
}

type CustomerBalanceInvoice = (typeof CUSTOMER_BALANCE_SEED)['kitchenInvoice' | 'galaInvoice']

async function postCustomerBalanceInvoice(
    pb: PocketBase,
    ctx: SeedContext,
    customerIds: Map<string, string>,
    invoice: CustomerBalanceInvoice
): Promise<void> {
    const customer = customerIds.get(invoice.customer)
    if (customer === undefined) {
        throw new Error(
            `seed: customer balance invoice "${invoice.memo}" names customer ${invoice.customer}, which was not created`
        )
    }
    const created = await pb.collection('books_invoices').create({
        customer,
        status: 'draft',
        date: invoice.date,
        due_date: invoice.date,
        terms: 'due_on_receipt',
        memo: invoice.memo,
    })
    await pb.collection('books_invoice_lines').create({
        invoice: created.id,
        position: 0,
        kind: 'item',
        product: 'prodbookkeep001',
        quantity: 1,
        rate: invoice.cents,
        taxable: false,
    })
    await postSeedDocument(pb, 'books_invoices', created.id, ctx.user.id)
}

type CustomerBalanceEntry = (typeof CUSTOMER_BALANCE_SEED)['noCustomerEntry' | 'inactiveEntry']

// A posted entry: a debit of `cents` on Accounts receivable naming `customer` ('' for
// none), credited to Consulting Income.
async function postCustomerBalanceEntry(
    pb: PocketBase,
    ctx: SeedContext,
    ids: Map<string, string>,
    customer: string,
    entry: CustomerBalanceEntry
): Promise<void> {
    const receivable = ids.get('receivable')
    const consulting = ids.get('consulting')
    if (receivable === undefined || consulting === undefined) {
        throw new Error(
            `seed: customer balance entry "${entry.memo}" names an account that was not created`
        )
    }
    await postSeedJournalEntry(pb, ctx, {
        date: entry.date,
        memo: entry.memo,
        lines: [
            { account: receivable, debit: entry.cents, credit: 0, customer },
            { account: consulting, debit: 0, credit: entry.cents, customer: '' },
        ],
    })
}

// A section longer than the General Ledger's first page of 200 lines, so its paging
// is reached in the seeded book.
async function seedLongSection(pb: PocketBase, ctx: SeedContext, ids: Map<string, string>) {
    const { account, offset, dates, linesPerEntry, cents, memo } = GENERAL_LEDGER_LONG_SECTION
    const debits: SeedLine[] = Array.from({ length: linesPerEntry }, () => [account, cents, 0])
    const lines: SeedLine[] = [...debits, [offset, 0, linesPerEntry * cents]]
    for (const date of dates) {
        await postEntry(pb, ctx, ids, { date, memo, lines })
    }
}

// Dated today, after the close date books-settings.spec.ts holds on the shared e2e DB.
// Line 0 credits From and line 1 debits To, the order server/transfers.go checks.
async function seedTransfer(pb: PocketBase, ctx: SeedContext, accountIds: Map<string, string>) {
    const from = accountIds.get(TRANSFER_SEED.fromNumber)
    const to = accountIds.get(TRANSFER_SEED.toNumber)
    if (from === undefined || to === undefined) {
        throw new Error(
            `seed: the seed transfer names ${TRANSFER_SEED.fromNumber} and ${TRANSFER_SEED.toNumber}, one of which was not created`
        )
    }
    const created = await pb.collection('books_journal_entries').create({
        date: isoDay(new Date()),
        memo: TRANSFER_SEED.memo,
        status: 'draft',
        doc_type: 'transfer',
        origin: 'manual',
        created_by: ctx.user.id,
    })
    const lines = [
        [from, 0, TRANSFER_SEED.amount],
        [to, TRANSFER_SEED.amount, 0],
    ] as const
    for (const [position, [account, debit, credit]] of lines.entries()) {
        await pb
            .collection('books_journal_lines')
            .create({ entry: created.id, account, debit, credit, position })
    }
    await postSeedDraft(pb, created.id, ctx.user.id)
}

// Through the REST create, so the server's upload hook validates and stamps the file the
// way an upload from the app is stamped. The superuser attributes it to the seeded user.
async function seedBanking(pb: PocketBase, ctx: SeedContext, accountIds: Map<string, string>) {
    const connectionIds = new Map<string, string>()
    for (const seedConnection of BANK_SEED.connections) {
        const account = accountIds.get(seedConnection.accountNumber)
        if (account === undefined) {
            throw new Error(
                `seed: bank connection names account ${seedConnection.accountNumber}, which was not created`
            )
        }
        const connection = await pb.collection('books_bank_connections').create({
            account,
            institution: seedConnection.institution,
            account_mask: seedConnection.account_mask,
            created_by: ctx.user.id,
        })
        connectionIds.set(seedConnection.accountNumber, connection.id)
        for (const seedFile of seedConnection.files) {
            await pb.collection('books_bank_files').create({
                connection: connection.id,
                uploaded_by: ctx.user.id,
                file: new File([seedFile.text], seedFile.name, { type: 'text/csv' }),
            })
        }
    }
    // The card statement stays waiting to import; the parser stamps its ledger balance.
    const statement = BANK_IMPORT_SEED_STATEMENT
    const cardConnection = connectionIds.get(statement.accountNumber)
    if (cardConnection === undefined) {
        throw new Error(
            `seed: bank statement names the connection of account ${statement.accountNumber}, which was not created`
        )
    }
    await pb.collection('books_bank_files').create({
        connection: cardConnection,
        uploaded_by: ctx.user.id,
        file: new File([statement.text], statement.name, { type: 'application/x-ofx' }),
    })
    await seedReviewStatement(pb, ctx, connectionIds)
}

// The parser's output as the upload hook stored it (server/bank_contents.go): one row per
// transaction, each with its file line. Read here without lib/bank-import.ts, which pulls
// form code into the seed graph.
function contentLines(rows: unknown): number[] {
    if (!Array.isArray(rows)) throw new Error('seed: the review statement has no parsed rows')
    return rows.map((row: unknown) => {
        if (typeof row !== 'object' || row === null || !('line' in row)) {
            throw new Error('seed: a parsed row of the review statement has no line')
        }
        const { line } = row
        if (typeof line !== 'number') {
            throw new Error('seed: a parsed row of the review statement has no line')
        }
        return line
    })
}

// Uploads and imports the For review statement on 1000 Business Checking, through the same
// upload and import hooks the app uses, then excludes four of its rows, so the e2e book and
// the help screenshots show For review and Excluded lists. Nothing is marked reviewed.
async function seedReviewStatement(
    pb: PocketBase,
    ctx: SeedContext,
    connectionIds: Map<string, string>
) {
    const statement = REVIEW_SEED_STATEMENT
    const connection = connectionIds.get(statement.accountNumber)
    if (connection === undefined) {
        throw new Error(
            `seed: review statement names the connection of account ${statement.accountNumber}, which was not created`
        )
    }
    const file = await pb.collection('books_bank_files').create({
        connection,
        uploaded_by: ctx.user.id,
        file: new File([statement.text], statement.name, { type: 'application/x-ofx' }),
    })
    const contents = await pb
        .collection('books_bank_file_contents')
        .getFirstListItem(pb.filter('file = {:f}', { f: file.id }))
    // The OFX fields of an import (lib/bank-import-form.ts OFX_IMPORT_FIELDS): OFX needs no
    // column mapping.
    await pb.collection('books_bank_imports').create({
        file: file.id,
        lines: contentLines(contents.rows),
        created_by: ctx.user.id,
        header_row: false,
        date_column: 0,
        date_format: '',
        description_column: 0,
        amount_columns: '',
        amount_column: 0,
        money_in_column: 0,
        money_out_column: 0,
        amount_sign: '',
    })
    const transactions = await pb.collection('books_bank_transactions').getFullList({
        filter: pb.filter('connection = {:c} && file = {:f}', { c: connection, f: file.id }),
    })
    const excluded = new Set<string>(statement.excludedFitids)
    const toExclude = transactions.filter(txn => excluded.has(txn.fitid))
    if (toExclude.length !== excluded.size) {
        throw new Error(
            `seed: the review import holds ${toExclude.length} of the ${excluded.size} rows to exclude`
        )
    }
    for (const txn of toExclude) {
        await pb.collection('books_bank_transactions').update(txn.id, { status: 'excluded' })
    }
}

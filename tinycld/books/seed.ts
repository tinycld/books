import type PocketBase from 'pocketbase'
import { BANK_SEED } from './lib/bank-connection-fixture'
import { BANK_IMPORT_SEED_STATEMENT } from './lib/bank-import-mapping-fixture'
import { CUSTOMERS } from './lib/customer-form-fixture'
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
import { BUNDLE_ITEMS, PRODUCTS } from './lib/products-services-fixture'
import { SEED_ACCOUNTS } from './lib/seed-accounts'
import { CUSTOMER_TAX_PATCHES, TAX_AGENCIES, TAX_IDS, TAX_RATE_ROWS } from './lib/tax-rates-fixture'
import { TRANSFER_SEED } from './lib/transfer-fixture'
import { PRIOR_YEAR_SEED } from './lib/trial-balance-fixture'
import { ACCOUNT_BOXES, VENDOR_1099_PATCHES } from './lib/vendor-1099-fixture'
import { VENDORS } from './lib/vendor-form-fixture'

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
            await pb
                .collection('books_journal_entries')
                .update(created.id, { status: 'posted', posted_by: ctx.user.id })
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
    await seedInvoices(pb, ctx, customerIds)
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
function seededAccountId(
    accountIds: Map<string, string>,
    number: string,
    productId: string
): string {
    const accountId = number ? accountIds.get(number) : ''
    if (accountId === undefined) {
        throw new Error(`seed: product ${productId} names account ${number}, which was not created`)
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
        const income_account = seededAccountId(accountIds, income, product.id)
        const expense_account = seededAccountId(accountIds, expense, product.id)
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
// agency is created active, then the rates and groups (rates first, so each
// group's components exist), and the inactive agencies are made inactive last:
// the rate guard refuses a rate whose agency is inactive when the rate is
// created, and an agency may go inactive once its rates are inactive.
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
        const { id, type, name, rate_ppm, agency, components, is_default, inactive } = row
        await pb.collection('books_tax_rates').create({
            id,
            type,
            name,
            rate_ppm,
            agency,
            components,
            is_default,
            inactive,
        })
    }
    for (const agency of TAX_AGENCIES.filter(a => a.inactive)) {
        await pb.collection('books_tax_agencies').update(agency.id, { inactive: true })
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
// server's, so none is sent.
export async function seedInvoices(
    pb: PocketBase,
    ctx: SeedContext,
    customerIds: Map<string, string>
): Promise<void> {
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
        await pb
            .collection('books_invoices')
            .update(created.id, { status: 'posted', posted_by: ctx.user.id })
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
    await pb
        .collection('books_journal_entries')
        .update(created.id, { status: 'posted', posted_by: ctx.user.id })
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
        await pb
            .collection('books_journal_entries')
            .update(created.id, { status: 'posted', posted_by: ctx.user.id })
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
            await pb
                .collection('books_journal_entries')
                .update(reversal.id, { status: 'posted', posted_by: ctx.user.id })
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
        const created = await pb.collection('books_journal_entries').create({
            date: `${year}-${PARTY_ENTRY_DAYS[index]}`,
            memo: seedEntry.memo,
            status: 'draft',
            doc_type: 'journal',
            origin: 'manual',
            created_by: ctx.user.id,
        })
        for (const [position, line] of seedEntry.lines.entries()) {
            const account = ids.get(line.account)
            const customer = line.customer ? customerIds.get(line.customer) : ''
            if (account === undefined || customer === undefined) {
                throw new Error(
                    `seed: party entry "${seedEntry.memo}" names account ${line.account} or customer ${line.customer}, which was not created`
                )
            }
            await pb.collection('books_journal_lines').create({
                entry: created.id,
                account,
                debit: line.debit,
                credit: line.credit,
                memo: line.memo,
                customer,
                vendor: line.vendor,
                position,
            })
        }
        await pb
            .collection('books_journal_entries')
            .update(created.id, { status: 'posted', posted_by: ctx.user.id })
    }
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
    await pb
        .collection('books_journal_entries')
        .update(created.id, { status: 'posted', posted_by: ctx.user.id })
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

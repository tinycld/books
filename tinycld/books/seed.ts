import type PocketBase from 'pocketbase'
import { CUSTOMERS } from './lib/customer-form-fixture'
import { JOURNAL_SEED } from './lib/journal-entries-fixture'
import { BUNDLE_ITEMS, PRODUCTS } from './lib/products-services-fixture'
import { SEED_ACCOUNTS } from './lib/seed-accounts'
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
    await seedCustomers(pb)
    await seedVendors(pb, accountIds)
    await seedProducts(pb, accountIds)
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
// A fixture row has no name_key (CustomerFixtureRecord omits it), so the seed
// never sends one: the server's guard sets it.
export async function seedCustomers(pb: PocketBase): Promise<void> {
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
// whose product is inactive when the row is created, so rows come first.
export async function seedProducts(pb: PocketBase, accountIds: Map<string, string>): Promise<void> {
    for (const product of PRODUCTS) {
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

import type PocketBase from 'pocketbase'

// Seed function invoked by core/scripts/seed-db.ts with a superuser `pb` and
// the seeded user. Entries are posted through the same update the app makes,
// so the server's posting hook validates them, numbers them and fills the
// balance rows. The superuser may attribute them to the seeded user.

interface SeedContext {
    user: { id: string; email: string; name: string }
}

interface SeedAccount {
    key: string
    name: string
    number: string
    type: string
    detail_type: string
    parent?: string
}

const ACCOUNTS: SeedAccount[] = [
    {
        key: 'checking',
        name: 'Business Checking',
        number: '1000',
        type: 'bank',
        detail_type: 'checking',
    },
    {
        key: 'receivable',
        name: 'Accounts receivable',
        number: '1100',
        type: 'accounts_receivable',
        detail_type: 'accounts_receivable',
    },
    {
        key: 'equipment',
        name: 'Office Equipment',
        number: '1500',
        type: 'fixed_asset',
        detail_type: 'machinery_equipment',
    },
    {
        key: 'card',
        name: 'Company Card',
        number: '2100',
        type: 'credit_card',
        detail_type: 'credit_card',
    },
    {
        key: 'equity',
        name: "Owner's Equity",
        number: '3000',
        type: 'equity',
        detail_type: 'owners_equity',
    },
    {
        key: 'consulting',
        name: 'Consulting Income',
        number: '4000',
        type: 'income',
        detail_type: 'service_income',
    },
    { key: 'rent', name: 'Rent', number: '6100', type: 'expense', detail_type: 'rent_lease' },
    {
        key: 'software',
        name: 'Software Subscriptions',
        number: '6200',
        type: 'expense',
        detail_type: 'dues_subscriptions',
    },
    {
        key: 'design-tools',
        name: 'Design Tools',
        number: '6210',
        type: 'expense',
        detail_type: 'dues_subscriptions',
        parent: 'software',
    },
]

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
    // The settings row keeps setup_completed false, so the seeded book (which already has accounts) shows the wizard's populated-book path.
    const year = new Date().getFullYear()
    const ids = new Map<string, string>()
    for (const account of ACCOUNTS) {
        const created = await pb.collection('books_accounts').create({
            name: account.name,
            number: account.number,
            type: account.type,
            detail_type: account.detail_type,
            parent: account.parent ? ids.get(account.parent) : '',
        })
        ids.set(account.key, created.id)
    }
    // Created active, then deactivated, because the app makes an account inactive by updating it.
    const petty = await pb.collection('books_accounts').create({
        name: 'Old Petty Cash',
        number: '6900',
        type: 'other_expense',
        detail_type: 'other_misc_expense',
        parent: '',
    })
    await pb.collection('books_accounts').update(petty.id, { inactive: true })
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
    await postEntry(pb, ctx, ids, {
        date: fiscalStart,
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

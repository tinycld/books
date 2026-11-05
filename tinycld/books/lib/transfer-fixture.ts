// Synthetic transfers for the helix reference route, the seed (TRANSFER_SEED) and tests.
// Plain data: typed against the generated record types so tsc checks every field.
// It imports only types, because the seed graph runs in plain node (tests/seed-node.test.ts).
// Amounts are integer minor units (cents). A transfer is a journal entry with two
// lines: position 0 credits the From account, position 1 debits the To account.
// Accounts are the seeded e2e book's (lib/seed-accounts.ts), by number.
import type { BooksAccounts, BooksJournalEntries, BooksJournalLines } from '../types'

export const TRANSFER_CURRENCY = 'USD'
// "Today" for the reference captures, so the default date is stable.
export const TRANSFER_TODAY = '2026-11-04'

const STAMP = '2026-01-05 09:00:00.000Z'

function account(
    seed: Pick<BooksAccounts, 'id' | 'name' | 'number' | 'type' | 'detail_type'> &
        Partial<Pick<BooksAccounts, 'inactive' | 'parent'>>
): BooksAccounts {
    return {
        description: '',
        inactive: false,
        currency: TRANSFER_CURRENCY,
        form_1099_box: '',
        created: STAMP,
        updated: STAMP,
        parent: '',
        ...seed,
    }
}

export const TRANSFER_ACCOUNT_IDS = {
    checking: 'acct_checking',
    savings: 'acct_savings',
    receivable: 'acct_receivable',
    equipment: 'acct_equipment',
    card: 'acct_card',
    equity: 'acct_equity',
    consulting: 'acct_consulting',
    rent: 'acct_rent',
    petty: 'acct_petty',
} as const

const IDS = TRANSFER_ACCOUNT_IDS

// A subset of the seeded chart (lib/seed-accounts.ts). Receivable, income and expense accounts
// are here so a picker built from this list shows that they are not offered.
export const TRANSFER_ACCOUNTS = [
    account({
        id: IDS.checking,
        name: 'Business Checking',
        number: '1000',
        type: 'bank',
        detail_type: 'checking',
    }),
    account({
        id: IDS.savings,
        name: 'Business Savings',
        number: '1010',
        type: 'bank',
        detail_type: 'savings',
    }),
    account({
        id: IDS.receivable,
        name: 'Accounts receivable',
        number: '1100',
        type: 'accounts_receivable',
        detail_type: 'accounts_receivable',
    }),
    account({
        id: IDS.equipment,
        name: 'Office Equipment',
        number: '1500',
        type: 'fixed_asset',
        detail_type: 'machinery_equipment',
    }),
    account({
        id: IDS.card,
        name: 'Company Card',
        number: '2100',
        type: 'credit_card',
        detail_type: 'credit_card',
    }),
    account({
        id: IDS.equity,
        name: "Owner's Equity",
        number: '3000',
        type: 'equity',
        detail_type: 'owners_equity',
    }),
    account({
        id: IDS.consulting,
        name: 'Consulting Income',
        number: '4000',
        type: 'income',
        detail_type: 'service_income',
    }),
    account({
        id: IDS.rent,
        name: 'Rent',
        number: '6100',
        type: 'expense',
        detail_type: 'rent_lease',
    }),
    // Inactive and of a type a transfer cannot use: an old draft that names it shows
    // it by name in the trigger, and the server refuses the post with a line message.
    account({
        id: IDS.petty,
        name: 'Old Petty Cash',
        number: '6900',
        type: 'other_expense',
        detail_type: 'other_misc_expense',
        inactive: true,
    }),
] satisfies BooksAccounts[]

// Each account's own posted balance, normal side positive (the Chart of Accounts
// figure). Checking is overdrawn and the card is paid past zero, so both are negative.
export const TRANSFER_BALANCES: Record<string, number> = {
    [IDS.checking]: -21_540,
    [IDS.savings]: 800_000,
    [IDS.receivable]: 345_000,
    [IDS.equipment]: 1_240_000,
    [IDS.card]: -12_000,
    [IDS.equity]: 2_500_000,
    [IDS.consulting]: 1_875_000,
    [IDS.rent]: 600_000,
    [IDS.petty]: 0,
}

export const TRANSFER_USER_NAMES: Record<string, string> = {
    user_ana: 'Ana Ruiz',
    user_dev: 'Dev Patel',
}

type EntrySeed = Pick<BooksJournalEntries, 'id' | 'date' | 'number' | 'memo' | 'total'> &
    Partial<Pick<BooksJournalEntries, 'status' | 'replaces' | 'posted_at' | 'voided_at'>>

function transfer(seed: EntrySeed): BooksJournalEntries {
    const status = seed.status ?? 'posted'
    const isDraft = status === 'draft'
    return {
        doc_type: 'transfer',
        status,
        origin: 'manual',
        sequence: Number(seed.number.replace(/\D/g, '')) || 0,
        currency: TRANSFER_CURRENCY,
        auto_reverse_on: '',
        posted_at: isDraft ? '' : `${seed.date} 19:14:00.000Z`,
        posted_by: isDraft ? '' : 'user_ana',
        voided_at: status === 'void' ? `${seed.date} 21:02:00.000Z` : '',
        voided_by: status === 'void' ? 'user_dev' : '',
        created_by: 'user_ana',
        close_override: '',
        created: `${seed.date} 08:00:00.000Z`,
        updated: `${seed.date} 08:00:00.000Z`,
        reverses: '',
        replaces: '',
        ...seed,
    }
}

export const TRANSFER_IDS = {
    posted: 'tr_posted_3',
    draft: 'tr_draft_1',
    void: 'tr_void_2',
    original: 'tr_original_1',
    correction: 'tr_correction_1',
    editDraft: 'tr_edit_3',
} as const

export const MEMO_LONG =
    'Move the September retainer from Acme Logistics out of checking into savings, less the $250.00 kept back for the October card payment, as agreed with the owner on the call of September 28'

export const TRANSFERS = [
    transfer({
        id: TRANSFER_IDS.posted,
        date: '2026-10-21',
        number: 'TR-3',
        memo: 'Move surplus cash to savings',
        total: 50_000,
    }),
    transfer({
        id: TRANSFER_IDS.draft,
        date: TRANSFER_TODAY,
        number: '',
        memo: 'Pay down the card for October',
        total: 125_000,
        status: 'draft',
    }),
    transfer({
        id: TRANSFER_IDS.void,
        date: '2026-09-30',
        number: 'TR-2',
        memo: MEMO_LONG,
        total: 300_000,
        status: 'void',
    }),
    // A correction keeps the original's number; the original is voided by the post.
    transfer({
        id: TRANSFER_IDS.original,
        date: '2026-08-14',
        number: 'TR-1',
        memo: 'Owner contribution to savings',
        total: 1_000_000,
        status: 'void',
    }),
    transfer({
        id: TRANSFER_IDS.correction,
        date: '2026-08-14',
        number: 'TR-1',
        memo: 'Owner contribution to savings',
        total: 100_000,
        replaces: TRANSFER_IDS.original,
    }),
    // An edit of TR-3 in progress: a draft that replaces it and has no number yet.
    transfer({
        id: TRANSFER_IDS.editDraft,
        date: '2026-10-21',
        number: '',
        memo: 'Move surplus cash to savings',
        total: 45_000,
        status: 'draft',
        replaces: TRANSFER_IDS.posted,
    }),
] satisfies BooksJournalEntries[]

function lines(
    entry: BooksJournalEntries,
    from: string,
    to: string
): [BooksJournalLines, BooksJournalLines] {
    const isPosted = entry.status !== 'draft'
    const base = {
        entry: entry.id,
        memo: '',
        posted: isPosted,
        date: isPosted ? entry.date : '',
        currency: TRANSFER_CURRENCY,
        created: entry.created,
        updated: entry.updated,
    }
    return [
        { ...base, id: `${entry.id}_0`, account: from, position: 0, debit: 0, credit: entry.total },
        { ...base, id: `${entry.id}_1`, account: to, position: 1, debit: entry.total, credit: 0 },
    ]
}

const [POSTED, DRAFT, VOID, ORIGINAL, CORRECTION, EDIT_DRAFT] = TRANSFERS

export const TRANSFER_LINES = {
    [POSTED.id]: lines(POSTED, IDS.checking, IDS.savings),
    [DRAFT.id]: lines(DRAFT, IDS.checking, IDS.card),
    [VOID.id]: lines(VOID, IDS.checking, IDS.savings),
    [ORIGINAL.id]: lines(ORIGINAL, IDS.equity, IDS.savings),
    [CORRECTION.id]: lines(CORRECTION, IDS.equity, IDS.savings),
    [EDIT_DRAFT.id]: lines(EDIT_DRAFT, IDS.checking, IDS.savings),
} satisfies Record<string, BooksJournalLines[]>

// The seed (seed.ts) posts this transfer, and the e2e specs find it by its memo.
// Numbers are seed-accounts.ts accounts: Business Checking to Business Savings.
export const TRANSFER_SEED = {
    memo: 'Seed transfer to savings',
    amount: 150_000,
    fromNumber: '1000',
    toNumber: '1010',
} as const satisfies Pick<BooksJournalEntries, 'memo'> & {
    amount: number
    fromNumber: string
    toNumber: string
}

// The form's values as it holds them: account ids and the typed text.
export interface TransferFormFixture {
    from: string
    to: string
    amount: string
    date: string
    memo: string
}

export const BLANK_FORM: TransferFormFixture = {
    from: '',
    to: '',
    amount: '',
    date: TRANSFER_TODAY,
    memo: '',
}

// Covering an overdraft: the To balance is negative.
export const FILLED_FORM: TransferFormFixture = {
    from: IDS.savings,
    to: IDS.checking,
    amount: '1,500.00',
    date: TRANSFER_TODAY,
    memo: 'Cover the checking overdraft from the November rent',
}

export const DRAFT_FORM: TransferFormFixture = {
    from: IDS.checking,
    to: IDS.card,
    amount: '1,250.00',
    date: TRANSFER_TODAY,
    memo: 'Pay down the card for October',
}

export const EDIT_FORM: TransferFormFixture = {
    from: IDS.checking,
    to: IDS.savings,
    amount: '450.00',
    date: '2026-10-21',
    memo: 'Move surplus cash to savings',
}

// Post pressed on a blank form.
export const ERRORS_BLANK_FORM: TransferFormFixture = { ...BLANK_FORM }

// One account on both sides, an amount over the limit, a day that does not exist.
export const ERRORS_SAME_FORM: TransferFormFixture = {
    from: IDS.checking,
    to: IDS.checking,
    // Over the 10^15-cent limit, yet still a number the parser reads.
    amount: '20,000,000,000,000.00',
    date: '2026-11-31',
    memo: 'Move surplus cash to savings',
}

// An old draft dated inside the closed period.
export const CLOSED_FORM: TransferFormFixture = {
    from: IDS.checking,
    to: IDS.card,
    amount: '1,250.00',
    date: '2026-06-15',
    memo: 'Pay down the card for June',
}

// An old draft whose To account became inactive and changed type.
export const LINE_REFUSAL_FORM: TransferFormFixture = {
    from: IDS.checking,
    to: IDS.petty,
    amount: '75.00',
    date: TRANSFER_TODAY,
    memo: 'Refill the petty cash box',
}

export const TRANSFER_MESSAGES = {
    fromEmpty: 'Choose the account the money comes from',
    toEmpty: 'Choose the account the money goes to',
    sameAccount: 'Choose two different accounts',
    amountNotNumber: 'Enter an amount like 1,234.50',
    amountNotPositive: 'Enter an amount more than 0',
    amountTooLarge: 'The amount is too large',
    dateInvalid: 'Enter a date as YYYY-MM-DD',
    memoTooLong: 'A memo can have at most 4000 characters',
} as const

// Server refusals, as the server writes them (with the final period).
export const CLOSED_REFUSAL =
    'The books are closed through 2026-06-30. Ask a Books admin for a close-date override to post on 2026-06-15.'
export const LINE_TYPE_REFUSAL =
    'Line 2: Old Petty Cash cannot be used in a transfer. Choose a bank, credit card, asset, liability or equity account.'

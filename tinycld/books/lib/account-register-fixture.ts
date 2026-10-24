// Synthetic ledger for the account register helix reference route and, later, the seed.
// Typed against the generated record types so tsc checks every field.
// Amounts are integer minor units (cents).
import type {
    BooksAccountBalances,
    BooksJournalEntries,
    BooksJournalLines,
    BooksSettings,
} from '../types'

export const REGISTER_ACCOUNT_ID = 'acct_bank_0002'
// "Today" for the reference captures, so "This month" is stable.
export const REGISTER_TODAY = '2026-10-23'

// Names of the accounts on the other side of the entries.
export const OTHER_ACCOUNT_NAMES: Record<string, string> = {
    acct_eq_00001: 'Opening balance equity',
    acct_inc_0001: 'Sales',
    acct_inc_0002: 'Consulting services',
    acct_ar_00001: 'Accounts receivable',
    acct_ap_00001: 'Accounts payable',
    acct_exp_0003: 'Wages',
    acct_exp_0006: 'Payroll taxes',
    acct_exp_0007: 'Rent',
    acct_exp_0008: 'Utilities',
    acct_exp_0009: 'Legal and professional fees',
    acct_exp_0010: 'Travel, lodging and conference registration for the annual partner summit',
    acct_exp_0011: 'Bank charges',
    acct_bank_0003: 'Reserve savings',
}

export const SETTINGS = {
    id: 'settings_001',
    close_date: '',
    fiscal_year_start_month: 1,
    currency: 'USD',
    business_name: '',
    // PocketBase stores an unset select as '', which the generated type omits.
    ownership: '' as BooksSettings['ownership'],
    tax_id: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    setup_completed: false,
    created: '2026-01-01 00:00:00.000Z',
    updated: '2026-01-01 00:00:00.000Z',
} satisfies BooksSettings

type EntrySeed = Pick<BooksJournalEntries, 'id' | 'date' | 'number' | 'memo'> &
    Partial<
        Pick<
            BooksJournalEntries,
            'status' | 'origin' | 'reverses' | 'replaces' | 'total' | 'posted_at'
        >
    >

function entry(seed: EntrySeed): BooksJournalEntries {
    const status = seed.status ?? 'posted'
    return {
        doc_type: 'journal',
        status,
        origin: 'manual',
        sequence: Number(seed.number.replace(/\D/g, '')) || 0,
        total: 0,
        currency: 'USD',
        auto_reverse_on: '',
        posted_at: status === 'draft' ? '' : `${seed.date} 09:00:00.000Z`,
        posted_by: 'user_0001',
        voided_at: status === 'void' ? `${seed.date} 17:30:00.000Z` : '',
        voided_by: status === 'void' ? 'user_0001' : '',
        created_by: 'user_0001',
        close_override: '',
        created: `${seed.date} 08:00:00.000Z`,
        updated: `${seed.date} 08:00:00.000Z`,
        reverses: '',
        replaces: '',
        ...seed,
    }
}

type LineSeed = Pick<BooksJournalLines, 'entry' | 'account'> &
    Partial<Pick<BooksJournalLines, 'debit' | 'credit' | 'memo' | 'position'>>

let lineCounter = 0

// A line is posted when its entry is; the date is stamped at posting.
function line(seed: LineSeed, parent: BooksJournalEntries): BooksJournalLines {
    lineCounter += 1
    const isPosted = parent.status !== 'draft'
    return {
        id: `line_${String(lineCounter).padStart(4, '0')}`,
        debit: 0,
        credit: 0,
        memo: '',
        position: 0,
        posted: isPosted,
        date: isPosted ? parent.date : '',
        currency: 'USD',
        created: parent.created,
        updated: parent.updated,
        ...seed,
    }
}

const ME = REGISTER_ACCOUNT_ID

interface Posting {
    entry: BooksJournalEntries
    lines: BooksJournalLines[]
}

// One entry with this account on one side and one other account on the other.
function simple(
    seed: EntrySeed,
    side: 'debit' | 'credit',
    amount: number,
    other: string,
    memos: { line?: string } = {}
): Posting {
    const parent = entry({ ...seed, total: amount })
    const mine = side === 'debit' ? { debit: amount } : { credit: amount }
    const theirs = side === 'debit' ? { credit: amount } : { debit: amount }
    return {
        entry: parent,
        lines: [
            line(
                { entry: parent.id, account: ME, position: 0, memo: memos.line ?? '', ...mine },
                parent
            ),
            line({ entry: parent.id, account: other, position: 1, ...theirs }, parent),
        ],
    }
}

// Payroll: one credit to the bank, split over wages and payroll taxes.
const payrollEntry = entry({
    id: 'je_1050',
    date: '2026-10-15',
    number: 'JE-1050',
    memo: 'October 15 payroll run, net pay and employer taxes',
    total: 3_100_000,
})
const payroll: Posting = {
    entry: payrollEntry,
    lines: [
        line({ entry: payrollEntry.id, account: ME, credit: 3_100_000, position: 0 }, payrollEntry),
        line(
            {
                entry: payrollEntry.id,
                account: 'acct_exp_0003',
                debit: 2_650_000,
                position: 1,
                memo: 'Gross wages',
            },
            payrollEntry
        ),
        line(
            {
                entry: payrollEntry.id,
                account: 'acct_exp_0006',
                debit: 450_000,
                position: 2,
                memo: 'Employer payroll taxes',
            },
            payrollEntry
        ),
    ],
}

// The voided original, its void reversal (same number) and the corrected entry.
const voidedOriginal = simple(
    {
        id: 'je_1046',
        date: '2026-10-08',
        number: 'JE-1046',
        memo: 'Deposit for Harbor Freight Co',
        status: 'void',
    },
    'debit',
    750_000,
    'acct_ar_00001'
)
const voidReversal = simple(
    {
        id: 'je_1046v',
        date: '2026-10-09',
        number: 'JE-1046',
        memo: 'Void of JE-1046',
        origin: 'void_reversal',
        reverses: 'je_1046',
    },
    'credit',
    750_000,
    'acct_ar_00001'
)
const corrected = simple(
    {
        id: 'je_1047',
        date: '2026-10-09',
        number: 'JE-1047',
        memo: 'Deposit for Harbor Freight Co (corrected amount)',
        replaces: 'je_1046',
    },
    'debit',
    705_000,
    'acct_ar_00001'
)

// A draft never reaches the register: its line is not posted.
const draftEntry = simple(
    { id: 'je_1060', date: '2026-10-24', number: '', memo: 'Draft, not posted', status: 'draft' },
    'credit',
    99_900,
    'acct_exp_0008'
)

const POSTINGS: Posting[] = [
    // August: opening balance and an uneven month (5 lines).
    simple(
        { id: 'je_1001', date: '2026-08-03', number: 'JE-1001', memo: 'Opening balance' },
        'debit',
        5_000_000,
        'acct_eq_00001'
    ),
    simple(
        { id: 'je_1002', date: '2026-08-12', number: 'JE-1002', memo: 'August rent' },
        'credit',
        1_200_000,
        'acct_exp_0007'
    ),
    simple(
        { id: 'je_1003', date: '2026-08-15', number: 'JE-1003', memo: 'Invoice 2041 payment' },
        'debit',
        2_350_000,
        'acct_ar_00001'
    ),
    simple(
        { id: 'je_1004', date: '2026-08-20', number: 'JE-1004', memo: 'August 20 payroll' },
        'credit',
        3_100_000,
        'acct_exp_0003'
    ),
    simple(
        { id: 'je_1005', date: '2026-08-28', number: 'JE-1005', memo: 'Office supplies' },
        'credit',
        184_250,
        'acct_ap_00001'
    ),
    // September: 8 lines, two on the same date.
    simple(
        { id: 'je_1010', date: '2026-09-02', number: 'JE-1010', memo: 'Invoice 2047 payment' },
        'debit',
        1_800_000,
        'acct_ar_00001'
    ),
    simple(
        { id: 'je_1011', date: '2026-09-05', number: 'JE-1011', memo: 'September rent' },
        'credit',
        1_200_000,
        'acct_exp_0007'
    ),
    simple(
        { id: 'je_1012', date: '2026-09-05', number: 'JE-1012', memo: 'Monthly account fee' },
        'credit',
        45_000,
        'acct_exp_0011'
    ),
    simple(
        { id: 'je_1013', date: '2026-09-12', number: 'JE-1013', memo: 'Consulting retainer' },
        'debit',
        640_000,
        'acct_inc_0002'
    ),
    simple(
        { id: 'je_1014', date: '2026-09-19', number: 'JE-1014', memo: 'September 19 payroll' },
        'credit',
        3_100_000,
        'acct_exp_0003'
    ),
    simple(
        { id: 'je_1015', date: '2026-09-22', number: 'JE-1015', memo: 'Legal retainer' },
        'credit',
        310_000,
        'acct_exp_0009'
    ),
    simple(
        { id: 'je_1016', date: '2026-09-26', number: 'JE-1016', memo: 'Invoice 2052 payment' },
        'debit',
        925_500,
        'acct_ar_00001'
    ),
    simple(
        { id: 'je_1017', date: '2026-09-30', number: 'JE-1017', memo: 'Electric and water' },
        'credit',
        150_000,
        'acct_exp_0008'
    ),
    // October: 17 lines on the register, one void pair, one split, a negative stretch.
    simple(
        { id: 'je_1040', date: '2026-10-01', number: 'JE-1040', memo: 'October rent' },
        'credit',
        1_200_000,
        'acct_exp_0007'
    ),
    simple(
        {
            id: 'je_1041',
            date: '2026-10-01',
            number: 'JE-1041',
            memo: 'Annual accounting software subscription',
        },
        'credit',
        28_000,
        'acct_exp_0008'
    ),
    simple(
        { id: 'je_1042', date: '2026-10-02', number: 'JE-1042', memo: 'Vendor payment, bill 8812' },
        'credit',
        410_000,
        'acct_ap_00001'
    ),
    simple(
        { id: 'je_1043', date: '2026-10-05', number: 'JE-1043', memo: 'Courier and freight' },
        'credit',
        95_500,
        'acct_ap_00001'
    ),
    simple(
        { id: 'je_1045', date: '2026-10-06', number: 'JE-1045', memo: 'Invoice 2058 payment' },
        'debit',
        500_000,
        'acct_ar_00001'
    ),
    voidedOriginal,
    voidReversal,
    corrected,
    simple(
        { id: 'je_1048', date: '2026-10-12', number: 'JE-1048', memo: 'Consulting milestone 3' },
        'debit',
        1_420_000,
        'acct_inc_0002'
    ),
    payroll,
    simple(
        { id: 'je_1051', date: '2026-10-16', number: 'JE-1051', memo: 'Product sales batch' },
        'debit',
        2_200_000,
        'acct_inc_0001'
    ),
    simple(
        {
            id: 'je_1052',
            date: '2026-10-19',
            number: 'JE-1052',
            memo: 'Partner summit registration, lodging and flights for the full leadership team and two guests',
        },
        'credit',
        64_320,
        'acct_exp_0010',
        {
            line: 'Registration, lodging and flights booked together through the conference travel desk',
        }
    ),
    simple(
        { id: 'je_1053', date: '2026-10-19', number: 'JE-1053', memo: 'Wire fee' },
        'credit',
        1_899,
        'acct_exp_0011'
    ),
    simple(
        { id: 'je_1054', date: '2026-10-20', number: 'JE-1054', memo: 'Invoice 2061 payment' },
        'debit',
        380_000,
        'acct_ar_00001'
    ),
    simple(
        { id: 'je_1055', date: '2026-10-21', number: 'JE-1055', memo: 'Transfer to reserve' },
        'credit',
        215_000,
        'acct_bank_0003'
    ),
    simple(
        { id: 'je_1056', date: '2026-10-22', number: 'JE-1056', memo: 'Walk-in sale' },
        'debit',
        90_000,
        'acct_inc_0001'
    ),
    simple(
        { id: 'je_1057', date: '2026-10-23', number: 'JE-1057', memo: 'Postage' },
        'credit',
        12_500,
        'acct_exp_0008'
    ),
    draftEntry,
]

export const ENTRIES: BooksJournalEntries[] = POSTINGS.map(p => p.entry)
export const LINES: BooksJournalLines[] = POSTINGS.flatMap(p => p.lines)

// Monthly balance rows, the opening-balance source (the ledger updates them when it posts).
// August: debits 7 350 000, credits 4 484 250. September: debits 3 365 500, credits 4 805 000.
// October: debits 6 045 000, credits 5 877 219 (the void pair counts in both).
export const BALANCES = [
    {
        id: 'bal_bank_0002_202608',
        account: ME,
        period: '2026-08',
        debit_total: 7_350_000,
        credit_total: 4_484_250,
        currency: 'USD',
        created: '2026-08-01 00:00:00.000Z',
        updated: '2026-08-28 09:00:00.000Z',
    },
    {
        id: 'bal_bank_0002_202609',
        account: ME,
        period: '2026-09',
        debit_total: 3_365_500,
        credit_total: 4_805_000,
        currency: 'USD',
        created: '2026-09-01 00:00:00.000Z',
        updated: '2026-09-30 09:00:00.000Z',
    },
    {
        id: 'bal_bank_0002_202610',
        account: ME,
        period: '2026-10',
        debit_total: 6_045_000,
        credit_total: 5_877_219,
        currency: 'USD',
        created: '2026-10-01 00:00:00.000Z',
        updated: '2026-10-23 09:00:00.000Z',
    },
] satisfies BooksAccountBalances[]

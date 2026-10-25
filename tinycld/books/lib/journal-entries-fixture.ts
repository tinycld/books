// Synthetic journal entries for the helix reference route.
// Typed against the generated record types so tsc checks every field.
// Amounts are integer minor units (cents).
import type { BooksJournalEntries, BooksJournalLines } from '../types'

export const ENTRIES_CURRENCY = 'USD'
// "Today" for the reference captures, so default dates are stable.
export const ENTRIES_TODAY = '2026-10-31'

export interface PickerAccount {
    id: string
    number: string
    name: string
    // Sub-accounts are indented in the picker.
    depth: number
}

export const PICKER_ACCOUNTS: PickerAccount[] = [
    { id: 'acct_bank_0001', number: '1010', name: 'Operating checking', depth: 0 },
    { id: 'acct_ar_00001', number: '1200', name: 'Accounts receivable', depth: 0 },
    { id: 'acct_fa_00001', number: '1500', name: 'Equipment', depth: 0 },
    { id: 'acct_fa_00002', number: '1590', name: 'Accumulated depreciation', depth: 1 },
    { id: 'acct_ap_00001', number: '2000', name: 'Accounts payable', depth: 0 },
    { id: 'acct_wp_00001', number: '2300', name: 'Wages payable', depth: 0 },
    { id: 'acct_eq_00001', number: '3000', name: 'Owner contribution', depth: 0 },
    { id: 'acct_exp_0003', number: '6000', name: 'Wages', depth: 0 },
    { id: 'acct_exp_0006', number: '6050', name: 'Payroll taxes', depth: 1 },
    { id: 'acct_exp_0007', number: '6100', name: 'Depreciation expense', depth: 0 },
]

const ACCOUNT_BY_ID = new Map(PICKER_ACCOUNTS.map(account => [account.id, account]))

export function accountLabel(accountId: string): string {
    const account = ACCOUNT_BY_ID.get(accountId)
    return account ? `${account.number} ${account.name}` : ''
}

type EntrySeed = Pick<BooksJournalEntries, 'id' | 'date' | 'number' | 'memo' | 'total'> &
    Partial<
        Pick<
            BooksJournalEntries,
            'status' | 'origin' | 'reverses' | 'replaces' | 'auto_reverse_on' | 'voided_at'
        >
    >

function entry(seed: EntrySeed): BooksJournalEntries {
    const status = seed.status ?? 'posted'
    return {
        doc_type: 'journal',
        status,
        origin: 'manual',
        sequence: Number(seed.number.replace(/\D/g, '')) || 0,
        currency: ENTRIES_CURRENCY,
        auto_reverse_on: '',
        posted_at: status === 'draft' ? '' : `${seed.date} 16:12:00.000Z`,
        posted_by: status === 'draft' ? '' : 'user_0001',
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

export const ENTRIES: BooksJournalEntries[] = [
    entry({
        id: 'je_draft_1',
        date: '2026-10-31',
        number: '',
        memo: 'Accrue October wages',
        total: 482_000,
        status: 'draft',
        auto_reverse_on: '2026-11-01',
    }),
    entry({
        id: 'je_1052',
        date: '2026-10-31',
        number: 'JE-1052',
        memo: 'Accrue October wages',
        total: 482_000,
        auto_reverse_on: '2026-11-01',
    }),
    entry({
        id: 'je_1051',
        date: '2026-10-01',
        number: 'JE-1051',
        memo: 'Reversal of JE-1046 September wages accrual',
        total: 465_000,
        origin: 'auto_reversal',
        reverses: 'je_1046',
    }),
    entry({
        id: 'je_1050',
        date: '2026-09-30',
        number: 'JE-1050',
        memo: 'Record September depreciation for office computers and the delivery van, including the partial month for the new laptops received on the 18th',
        total: 40_000,
        auto_reverse_on: '2026-10-01',
    }),
    entry({
        id: 'je_1049',
        date: '2026-09-15',
        number: 'JE-1049',
        memo: 'Owner contribution (entered twice)',
        total: 2_500_000,
        status: 'void',
    }),
    entry({
        id: 'je_1048',
        date: '2026-09-15',
        number: 'JE-1048',
        memo: 'Void of JE-1049',
        total: 2_500_000,
        origin: 'void_reversal',
        reverses: 'je_1049',
    }),
    entry({
        id: 'je_1047',
        date: '2026-08-31',
        number: 'JE-1047',
        memo: 'Accrue August payroll taxes',
        total: 91_250,
    }),
    entry({
        id: 'je_1046',
        date: '2026-09-30',
        number: 'JE-1046',
        memo: 'September wages accrual',
        total: 465_000,
        auto_reverse_on: '2026-10-01',
    }),
]

type LineSeed = Pick<BooksJournalLines, 'entry' | 'account' | 'position'> &
    Partial<Pick<BooksJournalLines, 'debit' | 'credit' | 'memo'>>

function line(seed: LineSeed, isPosted: boolean): BooksJournalLines {
    return {
        id: `line_${seed.entry}_${seed.position}`,
        debit: 0,
        credit: 0,
        memo: '',
        posted: isPosted,
        date: isPosted ? '2026-09-30' : '',
        currency: ENTRIES_CURRENCY,
        created: '2026-09-30 08:00:00.000Z',
        updated: '2026-09-30 08:00:00.000Z',
        ...seed,
    }
}

export const ENTRY_LINES: Record<string, BooksJournalLines[]> = {
    je_draft_1: [
        line({ entry: 'je_draft_1', account: 'acct_exp_0003', position: 0, debit: 482_000 }, false),
        line(
            { entry: 'je_draft_1', account: 'acct_wp_00001', position: 1, credit: 482_000 },
            false
        ),
    ],
    je_1050: [
        line(
            {
                entry: 'je_1050',
                account: 'acct_exp_0007',
                position: 0,
                debit: 40_000,
                memo: 'Office computers and van',
            },
            true
        ),
        line(
            {
                entry: 'je_1050',
                account: 'acct_fa_00002',
                position: 1,
                credit: 40_000,
                memo: 'Office computers and van',
            },
            true
        ),
    ],
    je_1049: [
        line({ entry: 'je_1049', account: 'acct_bank_0001', position: 0, debit: 2_500_000 }, true),
        line({ entry: 'je_1049', account: 'acct_eq_00001', position: 1, credit: 2_500_000 }, true),
    ],
}

// The new-entry form's starting values, as the form holds them: text for the
// amount cells and the cent sums the totals strip would derive.
export interface FormLine {
    account: string
    debit: string
    credit: string
    memo: string
}

export const BALANCED_LINES: FormLine[] = [
    {
        account: 'acct_exp_0007',
        debit: '$400.00',
        credit: '',
        memo: 'Office computers and van',
    },
    {
        account: 'acct_fa_00002',
        debit: '',
        credit: '$400.00',
        memo: 'Office computers and van',
    },
    { account: '', debit: '', credit: '', memo: '' },
]

export const UNBALANCED_LINES: FormLine[] = [
    { ...BALANCED_LINES[0] },
    { ...BALANCED_LINES[1], credit: '$350.00' },
    { account: '', debit: '', credit: '', memo: '' },
]

export const BALANCED_TOTALS = { debits: 40_000, credits: 40_000 }
export const UNBALANCED_TOTALS = { debits: 40_000, credits: 35_000 }

export const MEMO_LONG =
    'Record September depreciation for office computers and the delivery van, including the partial month for the new laptops received on the 18th'

// The reverse dialog's server refusal (closed-through message).
export const CLOSED_BOOKS_MESSAGE =
    'The books are closed through 09/30/2026. Ask a Books admin for a close-date override to post on 09/30/2026.'

// Memos of the entries `seed.ts` posts through the server (dated today).
export const ENTRIES_SEED = {
    draft: 'Entries seed draft',
    posted: 'Entries seed posted',
    reversed: 'Entries seed reversed',
    voided: 'Entries seed voided',
    auto: 'Entries seed auto reverse',
} as const

export type JournalSeedEntry = Pick<BooksJournalEntries, 'memo'> & {
    key: keyof typeof ENTRIES_SEED
    state: 'draft' | 'posted' | 'reversed' | 'voided'
    autoReverse: boolean
    // [account key from seed.ts, debit cents, credit cents]
    lines: [string, number, number][]
}

export const JOURNAL_SEED = [
    {
        key: 'draft',
        memo: ENTRIES_SEED.draft,
        state: 'draft',
        autoReverse: false,
        lines: [
            ['rent', 25000, 0],
            ['checking', 0, 25000],
        ],
    },
    {
        key: 'posted',
        memo: ENTRIES_SEED.posted,
        state: 'posted',
        autoReverse: false,
        lines: [
            ['checking', 80000, 0],
            ['equity', 0, 80000],
        ],
    },
    {
        key: 'reversed',
        memo: ENTRIES_SEED.reversed,
        state: 'reversed',
        autoReverse: false,
        lines: [
            ['software', 12000, 0],
            ['checking', 0, 12000],
        ],
    },
    {
        key: 'voided',
        memo: ENTRIES_SEED.voided,
        state: 'voided',
        autoReverse: false,
        lines: [
            ['receivable', 15000, 0],
            ['equity', 0, 15000],
        ],
    },
    {
        key: 'auto',
        memo: ENTRIES_SEED.auto,
        state: 'posted',
        autoReverse: true,
        lines: [
            ['rent', 30000, 0],
            ['checking', 0, 30000],
        ],
    },
] satisfies readonly JournalSeedEntry[]

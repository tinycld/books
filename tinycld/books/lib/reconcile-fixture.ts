// Synthetic data for the helix reference route of Reconcile, and the seed plan of its
// migration checkpoint. Plain data, and it imports only types and other plain data, because
// the seed graph runs in plain node (tests/seed-node.test.ts). Amounts are integer minor
// units (cents). Accounts are the seeded e2e book's (lib/seed-accounts.ts), by number.
//
// Records are typed with `satisfies` against the generated types of the migration
// `<number>_create_books_reconciliations.js`, so tsc checks every field.
// books_reconciliations: `statement_balance` is signed, in the account's own balance sense
// (money in a bank account, owed on a card); `_out` is the credit side (a bank payment, a
// card charge) and `_in` the debit side. books_reconcile_lines, the view: one posted line
// of a bank or credit card account; `reconciliation` is the id of the reconciliation that
// holds the line (cleared), else ''.
import type { BooksAccounts, BooksReconcileLines, BooksReconciliations } from '../types'
import { BANK_ACCOUNT_IDS, BANK_ACCOUNTS, BANK_USERS } from './bank-connection-fixture'
import { GENERAL_LEDGER_LONG_SECTION } from './general-ledger-fixture'

export const RECONCILE_CURRENCY = 'USD'

const STAMP = '2026-10-03 16:20:00.000Z'

export const RECONCILE_USERS = [BANK_USERS.ana, BANK_USERS.ben]

export const RECONCILE_ACCOUNT_IDS = {
    checking: BANK_ACCOUNT_IDS.checking,
    savings: BANK_ACCOUNT_IDS.savings,
    card: BANK_ACCOUNT_IDS.card,
    reserve: 'acct_reserve',
    pettyCash: 'acct_pettycash',
} as const

const ACCOUNTS = RECONCILE_ACCOUNT_IDS

// 80 characters: an account row must put the name on one line with an ellipsis.
export const RECONCILE_LONG_ACCOUNT_NAME =
    'Payroll and Tax Reserve Account at First Community Bank of the Pacific Northwest'

function extraAccount(
    seed: Pick<BooksAccounts, 'id' | 'name' | 'number' | 'detail_type'>
): BooksAccounts {
    return {
        type: 'bank',
        description: '',
        inactive: false,
        currency: RECONCILE_CURRENCY,
        form_1099_box: '',
        created: STAMP,
        updated: STAMP,
        parent: '',
        full_name: seed.name,
        ...seed,
    }
}

const RECONCILABLE_TYPES = new Set<string>(['bank', 'credit_card'])

// Every account that can be reconciled, by number: the seeded bank and card accounts, a
// money market account with a long name and a cash on hand account (every detail type of
// a bank account can be reconciled).
export const RECONCILE_ACCOUNTS = [
    ...BANK_ACCOUNTS.filter(account => RECONCILABLE_TYPES.has(account.type)),
    extraAccount({
        id: ACCOUNTS.reserve,
        name: RECONCILE_LONG_ACCOUNT_NAME,
        number: '1020',
        detail_type: 'money_market',
    }),
    extraAccount({
        id: ACCOUNTS.pettyCash,
        name: 'Petty cash',
        number: '1030',
        detail_type: 'cash_on_hand',
    }),
].sort((a, b) => a.number.localeCompare(b.number)) satisfies BooksAccounts[]

// The balance in Books of each account, in its own sense (the card: the amount owed).
export const RECONCILE_ACCOUNT_BALANCES: Record<string, number> = {
    [ACCOUNTS.checking]: 2_418_055,
    [ACCOUNTS.savings]: 1_240_000,
    [ACCOUNTS.reserve]: 3_650_000,
    [ACCOUNTS.pettyCash]: 21_450,
    [ACCOUNTS.card]: 105_320,
}

export const RECONCILIATION_IDS = {
    checkingSeptember: 'recncheckingsep',
    checkingOctober: 'recncheckingoct',
    savingsAugust: 'recnsavingsaug0',
    savingsEmpty: 'recnsavingsoct0',
    cardOctober: 'recncardoct0000',
} as const

const IDS = RECONCILIATION_IDS

function reconciliation(
    fields: Pick<
        BooksReconciliations,
        'id' | 'account' | 'statement_date' | 'statement_balance' | 'beginning_balance' | 'status'
    > &
        Partial<BooksReconciliations>
) {
    return {
        has_statement_totals: false,
        statement_out: 0,
        statement_in: 0,
        cleared_out: 0,
        cleared_in: 0,
        cleared_out_count: 0,
        cleared_in_count: 0,
        created_by: BANK_USERS.ana.id,
        finished_by: '',
        finished_by_name: '',
        finished_at: '',
        currency: RECONCILE_CURRENCY,
        created: STAMP,
        updated: STAMP,
        ...fields,
    } satisfies BooksReconciliations
}

// The finished statement of September on 1000 Business Checking:
// $4,555.00 − $550.00 (3 payments) + $175.00 (1 deposit) = $4,180.00.
export const RECONCILIATION_FINISHED = reconciliation({
    id: IDS.checkingSeptember,
    account: ACCOUNTS.checking,
    statement_date: '2026-09-30',
    statement_balance: 418_000,
    beginning_balance: 455_500,
    status: 'finished',
    cleared_out: 55_000,
    cleared_in: 17_500,
    cleared_out_count: 3,
    cleared_in_count: 1,
    finished_by: BANK_USERS.ana.id,
    finished_by_name: BANK_USERS.ana.name,
    finished_at: '2026-10-03 16:20:00.000Z',
})

// The statement of October on 1000 Business Checking, in progress. With the cleared rows of
// RECONCILE_LINES: cleared payments $1,923.84 (6), cleared deposits $4,050.00 (3), cleared
// balance $4,180.00 − $1,923.84 + $4,050.00 = $6,306.16, difference $6,333.16 − $6,306.16
// = $27.00. The statement's own totals say payments are $27.00 over: Expense 15 is $85.00
// in Books and $58.00 on the statement (two digits swapped), so only the swapped-digits
// hint applies.
export const RECONCILIATION_IN_PROGRESS = reconciliation({
    id: IDS.checkingOctober,
    account: ACCOUNTS.checking,
    statement_date: '2026-10-31',
    statement_balance: 633_316,
    beginning_balance: 418_000,
    status: 'in_progress',
    has_statement_totals: true,
    statement_out: 189_684,
    statement_in: 405_000,
})

// The same statement after Expense 15 was corrected to the bank's $58.00: here the
// statement agrees with the cleared rows as they are, so the difference is $0.00.
export const RECONCILIATION_BALANCED = reconciliation({
    ...RECONCILIATION_IN_PROGRESS,
    statement_balance: 630_616,
    statement_out: 192_384,
})

// 1010 Business Savings: one finished statement (the accounts screen's second "Reconciled
// through"), and a variant in progress with no transaction to clear, which can be finished
// because its statement balance equals its beginning balance. The variant is not in
// RECONCILE_ACCOUNT_ROWS.
export const RECONCILIATION_SAVINGS_FINISHED = reconciliation({
    id: IDS.savingsAugust,
    account: ACCOUNTS.savings,
    statement_date: '2026-08-31',
    statement_balance: 1_240_000,
    beginning_balance: 0,
    status: 'finished',
    cleared_in: 1_240_000,
    cleared_in_count: 2,
    finished_by: BANK_USERS.ben.id,
    finished_by_name: BANK_USERS.ben.name,
    finished_at: '2026-09-04 10:02:00.000Z',
})

export const RECONCILIATION_EMPTY = reconciliation({
    id: IDS.savingsEmpty,
    account: ACCOUNTS.savings,
    statement_date: '2026-10-31',
    statement_balance: 1_240_000,
    beginning_balance: 1_240_000,
    status: 'in_progress',
})

// 2100 Company Card has never been reconciled (RECONCILE_ACCOUNT_ROWS). This variant shows
// the card's words and signs: balances are the amount owed, a charge raises it. Cleared
// charges $864.20 (4), no cleared payment: $0.00 + $864.20 − $0.00 = $864.20 against a
// statement of $664.20, difference −$200.00. Clearing Transfer 9 ($200.00) makes it zero.
export const RECONCILIATION_CARD = reconciliation({
    id: IDS.cardOctober,
    account: ACCOUNTS.card,
    statement_date: '2026-10-31',
    statement_balance: 66_420,
    beginning_balance: 0,
    status: 'in_progress',
})

export const RECONCILIATIONS = [
    RECONCILIATION_FINISHED,
    RECONCILIATION_IN_PROGRESS,
    RECONCILIATION_SAVINGS_FINISHED,
] satisfies BooksReconciliations[]

// The accounts screen: each account with its reconciliation in progress and its latest
// finished one (the two `materialize()` reads of spec §4 "Reads").
export const RECONCILE_ACCOUNT_ROWS = RECONCILE_ACCOUNTS.map(account => ({
    account,
    balance: RECONCILE_ACCOUNT_BALANCES[account.id] ?? 0,
    inProgress: RECONCILIATIONS.find(
        row => row.account === account.id && row.status === 'in_progress'
    ),
    lastFinished: RECONCILIATIONS.find(
        row => row.account === account.id && row.status === 'finished'
    ),
}))

// The start dialog's values from the latest OFX statement file (useStatementBalance).
export const RECONCILE_OFX_STATEMENT = {
    fileName: 'checking-2026-10.ofx',
    statement_balance: 633_316,
    statement_date: '2026-10-31',
} as const

// 78 characters: a row must put the payee on one line with an ellipsis.
export const RECONCILE_LONG_PAYEE =
    'Northwind Card Services and Merchant Processing of the Pacific Northwest, LLC'

// 60 characters: a row must put the memo on one line with an ellipsis.
export const RECONCILE_LONG_MEMO = 'Quarterly lumber order 4471, split delivery, net 30 less 2%.'

type Flag = 'cleared' | 'matched'

// [day of the month, doc type, number, payee, memo, credit side, debit side, flags]
type Posted = readonly [
    number,
    BooksReconcileLines['doc_type'],
    string,
    string,
    string,
    number,
    number,
    ...Flag[],
]

function serialId(prefix: string, n: number): string {
    return `${prefix}${n.toString().padStart(15 - prefix.length, '0')}`
}

// A journal entry or a transfer is posted by hand; every other doc type is posted from its
// document, whose id the entry carries.
const HAND_POSTED = new Set<BooksReconcileLines['doc_type']>(['journal', 'transfer'])

function linesOf(
    prefix: string,
    held: Pick<BooksReconciliations, 'id' | 'account' | 'statement_date'>,
    posted: readonly Posted[]
) {
    const month = held.statement_date.slice(0, 8)
    return posted.map(([day, docType, number, payee, memo, credit, debit, ...flags], index) => {
        const id = serialId(`${prefix}ln`, index + 1)
        const byHand = HAND_POSTED.has(docType)
        return {
            id,
            line: id,
            account: held.account,
            entry: serialId(`${prefix}en`, index + 1),
            date: `${month}${day.toString().padStart(2, '0')}`,
            debit,
            credit,
            memo,
            number,
            doc_type: docType,
            origin: byHand ? 'manual' : 'document',
            document: byHand ? '' : serialId(`${prefix}dc`, index + 1),
            payee,
            reconciliation: flags.includes('cleared') ? held.id : '',
            finished: false,
            bank_matched: flags.includes('matched'),
        } satisfies BooksReconcileLines
    })
}

// October on 1000 Business Checking, oldest first: 26 transactions (17 payments, 9
// deposits), 9 cleared, 6 matched to a bank transaction (3 of them not cleared yet).
const CHECKING_POSTED: readonly Posted[] = [
    [1, 'expense', '12', 'Robertson & Associates', 'Retainer for October', 25_000, 0, 'cleared'],
    [1, 'payment', '1003', 'Harbor Design', 'Invoice 1017', 0, 50_000, 'cleared'],
    [
        2,
        'bill_payment',
        '1041',
        'Hartwell Insurance',
        'Policy 44-1907, monthly premium',
        31_240,
        0,
        'cleared',
        'matched',
    ],
    [5, 'expense', '13', 'Comcast Business', 'Internet and phone', 18_999, 0, 'cleared', 'matched'],
    [
        5,
        'sales_receipt',
        '1009',
        'Lumen Labs',
        'Workshop, half day',
        0,
        120_000,
        'cleared',
        'matched',
    ],
    [6, 'expense', '14', 'Pacific Power', 'Electric, 1200 Harbor St', 14_218, 0, 'matched'],
    [8, 'transfer', '7', '', 'To Business Savings', 100_000, 0, 'cleared'],
    [9, 'expense', '15', RECONCILE_LONG_PAYEE, 'Card processing fees', 8_500, 0, 'cleared'],
    [9, 'payment', '1004', 'Brightline Studio', 'Invoice 1019', 0, 235_000, 'cleared'],
    [12, 'bill_payment', '1042', 'Cedar & Pine LLC', RECONCILE_LONG_MEMO, 64_000, 0],
    [13, 'expense', '16', 'Staples', 'Printer paper and toner', 8_645, 0, 'cleared'],
    [14, 'payment', '1005', 'Cedar & Pine LLC', 'Invoices 1020 and 1021', 0, 87_550],
    [15, 'expense', '17', 'City of Portland', 'Business license renewal', 12_000, 0],
    [16, 'journal', '1048', '', 'Bank service charge', 1_500, 0, 'matched'],
    [16, 'sales_receipt', '1010', '', 'Walk-in sale', 0, 6_400],
    [19, 'expense', '18', 'Shell', 'Fuel', 6_130, 0],
    [20, 'bill_payment', '1043', 'Lumen Office Supply', 'Invoice 8841', 23_375, 0],
    [21, 'journal', '1049', '', 'Interest earned', 0, 214],
    [22, 'expense', '19', 'Delta Air Lines', 'Flight to client site, Denver', 41_820, 0],
    [23, 'expense', '20', 'Adobe', 'Creative Cloud, monthly', 5_999, 0, 'matched'],
    [23, 'payment', '1006', 'Harbor Design', 'Invoice 1022', 0, 148_000],
    [26, 'bill_payment', '1044', 'Hartwell Insurance', "Workers' comp, fourth quarter", 50_500, 0],
    [27, 'vendor_refund', '3', 'Staples', 'Returned toner', 0, 4_120],
    [28, 'expense', '21', 'Robertson & Associates', 'Filing fee', 7_500, 0],
    [29, 'payment', '1007', 'Lumen Labs', 'Invoice 1024, deposit', 0, 90_000],
    [30, 'transfer', '8', '', 'To Business Savings', 50_000, 0],
]

export const RECONCILE_LINES = linesOf('rcck', RECONCILIATION_IN_PROGRESS, CHECKING_POSTED)

export const EMPTY_RECONCILE_LINES: BooksReconcileLines[] = []

// The four lines of the finished September statement of 1000 (3 payments $550.00, 1
// deposit $175.00), for the register's Status column: "Reconciled".
const SEPTEMBER_POSTED: readonly Posted[] = [
    [4, 'expense', '9', 'Robertson & Associates', 'Retainer for September', 25_000, 0, 'cleared'],
    [11, 'bill_payment', '1038', 'Hartwell Insurance', 'Policy 44-1907', 22_000, 0, 'cleared'],
    [18, 'sales_receipt', '1006', 'Lumen Labs', 'Site visit', 0, 17_500, 'cleared'],
    [25, 'expense', '10', 'Staples', 'Shelving', 8_000, 0, 'cleared'],
]

export const RECONCILE_RECONCILED_LINES = linesOf(
    'rcsp',
    RECONCILIATION_FINISHED,
    SEPTEMBER_POSTED
).map(line => ({ ...line, finished: true }))

// October on 2100 Company Card: the opening balance is a transaction to clear, because the
// card has never been reconciled.
const CARD_POSTED: readonly Posted[] = [
    [1, 'journal', '1001', '', 'Opening balance', 40_215, 0, 'cleared'],
    [4, 'expense', '23', 'Delta Air Lines', 'Flight to Denver', 31_840, 0, 'cleared'],
    [11, 'expense', '24', 'Adobe', 'Stock images', 7_900, 0, 'cleared'],
    [18, 'expense', '25', 'Shell', 'Fuel', 6_465, 0, 'cleared'],
    [20, 'transfer', '9', '', 'Card payment from Business Checking', 0, 20_000],
    [25, 'expense', '26', 'Staples', 'Desk chair', 18_900, 0],
]

export const RECONCILE_CARD_LINES = linesOf('rccd', RECONCILIATION_CARD, CARD_POSTED)

// The count of the account's bank transactions still in For review up to the statement
// date (the first hint), for the state that shows several hints.
export const RECONCILE_REVIEW_COUNT = 3
export const RECONCILE_REVIEW_CONNECTION_ID = 'bankconncheckng'

// The 260 "Daily sweep" debits of the General Ledger's long section on 1010 (seed.ts
// seedLongSection, dated 2020-09): $260.00. The finished seed reconciliation clears them
// too, so the one in progress opens on its own rows.
const SWEEP = GENERAL_LEDGER_LONG_SECTION
const SWEEP_CENTS = SWEEP.dates.length * SWEEP.linesPerEntry * SWEEP.cents

// What seed.ts posts for Reconcile (spec §4 "Fixture and seed", settled difference 10):
// four entries of its own on 1010 Business Savings with unique memos and fixed past dates
// (debit 1010, credit 3000 Owner's Equity), one finished reconciliation that clears the
// sweep lines and the first two entries ($0.00 + $260.00 + $2,500.00 + $4.12 = $2,764.12),
// and one in progress that clears the third and leaves the fourth: $2,764.12 + $4.31 =
// $2,768.43 against a statement of $2,783.43, a difference of $15.00 (the fee refund).
// `clears` are indexes into `entries`; the sweep lines are found by their memo and dates.
// The reconciliations are written as superuser through the same Go hooks; their fixed ids
// are how a second seed run knows it ran.
export const RECONCILE_SEED = {
    accountNumber: '1010',
    entries: [
        { date: '2026-08-05', memo: 'Reconcile seed: opening deposit', amount: 250_000 },
        { date: '2026-08-20', memo: 'Reconcile seed: interest earned, August', amount: 412 },
        { date: '2026-09-18', memo: 'Reconcile seed: interest earned, September', amount: 431 },
        { date: '2026-09-25', memo: 'Reconcile seed: fee refund', amount: 1_500 },
    ],
    finished: {
        id: 'recnseedfinish1',
        statement_date: '2026-08-31',
        statement_balance: SWEEP_CENTS + 250_412,
        clears: [0, 1],
    },
    inProgress: {
        id: 'recnseedprogrs1',
        statement_date: '2026-09-30',
        statement_balance: SWEEP_CENTS + 252_343,
        clears: [2],
    },
} as const

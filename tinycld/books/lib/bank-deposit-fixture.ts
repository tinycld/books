// Synthetic bank deposits for the helix reference route, the seed (seed.ts) and tests.
// Plain data: it imports other fixtures and types only, because the seed graph runs in
// plain node (tests/seed-node.test.ts).
//
// Amounts are integer minor units (cents) and signed: money in is above zero, money out
// (a refund receipt paid from Undeposited funds, a bank fee) is below zero. A deposit's
// `items_total`, `lines_total` and `total` are the values the server writes at posting
// (spec §3.7).
//
// The record types are the generated ones of migration 2100000036 (`BooksDeposits`,
// `BooksDepositItems`, `BooksDepositLines`, `BooksUndepositedItems`); every `satisfies`
// below makes a fixture row that drifts from the schema fail tsc.

import type {
    BooksDepositItems,
    BooksDepositLines,
    BooksDeposits,
    BooksUndepositedItems,
} from '../types'
import { CUSTOMER_IDS } from './customer-form-fixture'
import type { DepositAccountRow } from './deposit-accounts'
import { VENDOR_IDS } from './vendor-form-fixture'

export const DEPOSIT_CURRENCY = 'USD'
// "Today" for the reference captures, so default dates are stable.
export const DEPOSIT_TODAY = '2026-11-20'

const STAMP = '2026-11-20 09:00:00.000Z'

// books_deposits (spec §4.1).
export type DepositRecord = BooksDeposits

// books_deposit_items (spec §4.1): one ticked item. The server fills the copy fields
// (`entry` to `reference_no`) from the line, its entry and its source document.
export type DepositItemRecord = BooksDepositItems

// books_deposit_lines (spec §4.1): an other funds line.
export type DepositLineRecord = BooksDepositLines

// books_undeposited_items (spec §4.1): the view's row, one per undeposited item; `id` is
// the journal line's id.
export type UndepositedItemRecord = BooksUndepositedItems

// An account the deposit form lists, with its own posted balance (the Chart of Accounts
// figure the form shows under Deposit to).
export type DepositFixtureAccount = DepositAccountRow & { balance: number }

// The ids are fixture ids: the seed resolves an account by its number.
export const DEPOSIT_FIXTURE_ACCOUNT_IDS = {
    checking: 'acctfixcheck001',
    savings: 'acctfixsaving01',
    undeposited: 'acctfixundep001',
    // A second Undeposited funds account, for the variant that names the account under
    // the Transaction link (spec §3.4). Not in the seeded book.
    cardTerminal: 'acctfixundep002',
    // Other funds accounts, seeded as 4900, 6300 and 4000 (lib/seed-accounts.ts).
    interest: 'acctfixintrst01',
    bankCharges: 'acctfixbankch01',
    consulting: 'acctfixconsul01',
} as const

const ACCT = DEPOSIT_FIXTURE_ACCOUNT_IDS

// In chart order. 1000, 1010, 1200 and 4000 carry the seeded book's numbers and names
// (lib/seed-accounts.ts).
export const DEPOSIT_FIXTURE_ACCOUNTS: DepositFixtureAccount[] = [
    {
        id: ACCT.checking,
        number: '1000',
        name: 'Business Checking',
        type: 'bank',
        detail_type: 'checking',
        parent: '',
        inactive: false,
        balance: 562_738,
    },
    {
        id: ACCT.savings,
        number: '1010',
        name: 'Business Savings',
        type: 'bank',
        detail_type: 'savings',
        parent: '',
        inactive: false,
        balance: -4_210,
    },
    {
        id: ACCT.undeposited,
        number: '1200',
        name: 'Undeposited funds',
        type: 'other_current_asset',
        detail_type: 'undeposited_funds',
        parent: '',
        inactive: false,
        balance: 1_234_629_280,
    },
    {
        id: ACCT.cardTerminal,
        number: '1210',
        name: 'Card terminal clearing',
        type: 'other_current_asset',
        detail_type: 'undeposited_funds',
        parent: '',
        inactive: false,
        balance: 31_800,
    },
    {
        id: ACCT.consulting,
        number: '4000',
        name: 'Consulting Income',
        type: 'income',
        detail_type: 'service_income',
        parent: '',
        inactive: false,
        balance: 8_450_000,
    },
    {
        id: ACCT.interest,
        number: '4900',
        name: 'Interest earned',
        type: 'other_income',
        detail_type: 'interest_earned',
        parent: '',
        inactive: false,
        balance: 3_720,
    },
    {
        id: ACCT.bankCharges,
        number: '6300',
        name: 'Bank charges and fees',
        type: 'expense',
        detail_type: 'bank_charges',
        parent: '',
        inactive: false,
        balance: 4_500,
    },
]

// The users the read view names in "Posted by" and "Voided by".
export const DEPOSIT_USER_IDS = { ana: 'userdepanaruiz1', omar: 'userdepomarbel1' } as const
export const DEPOSIT_USER_NAMES: Record<string, string> = {
    [DEPOSIT_USER_IDS.ana]: 'Ana Ruiz',
    [DEPOSIT_USER_IDS.omar]: 'Omar Bell',
}

const CUSTOMER = {
    harborview: CUSTOMER_IDS.harborview,
    northwind: CUSTOMER_IDS.northwind,
    // The long name: it must ellipsize in its cell and on a card's first line.
    stJude: CUSTOMER_IDS.stJude,
    // Customer-form fixture rows with no CUSTOMER_IDS key.
    aspen: 'cust_aspen_0001',
    bluefin: 'cust_bluef_0001',
    cedarPine: 'cust_cedar_0001',
} as const

// The journal lines on an Undeposited funds account that the fixture names.
export const UNDEPOSITED_LINE_IDS = {
    // Listed: no posted deposit holds them.
    payment: 'jlundeppay10010',
    salesReceipt: 'jlundepsrc10120',
    vendorRefund: 'jlundepvrf10020',
    refundReceipt: 'jlundeprrc10030',
    journal: 'jlundepje105200',
    // On the second Undeposited funds account.
    cardSale: 'jlundepsrc10130',
    // Held by posted Deposit 1002: a draft that names it is refused at posting.
    taken: 'jlundeppay09980',
    // Held by posted Deposit 1004.
    heldPayment: 'jlundeppay10030',
    heldReceipt: 'jlundepsrc10090',
    heldRefund: 'jlundeprrc10020',
    // Held by Deposit 1003 (the void original, then its correction).
    fixedPayment: 'jlundeppay10020',
    fixedReceipt: 'jlundepsrc10080',
} as const

const LINE = UNDEPOSITED_LINE_IDS

type ItemSeed = Pick<UndepositedItemRecord, 'id' | 'date' | 'doc_type' | 'number' | 'amount'> &
    Partial<UndepositedItemRecord>

function item(seed: ItemSeed): UndepositedItemRecord {
    return {
        line: seed.id,
        entry: `je${seed.id.slice(2)}`,
        account: ACCT.undeposited,
        origin: 'document',
        document: `doc${seed.id.slice(3)}`,
        customer: '',
        vendor: '',
        payment_method: '',
        reference_no: '',
        memo: '',
        ...seed,
    }
}

// What waits in Undeposited funds (spec §3.1), oldest date first, then number: a payment
// by check, a sales receipt by card with a long customer name, a long reference no. and a
// large amount, a vendor refund, a refund receipt as money out, and a journal entry with
// no party and a long memo.
export const UNDEPOSITED_ITEMS = [
    item({
        id: LINE.payment,
        date: '2026-10-02',
        doc_type: 'payment',
        number: '1001',
        customer: CUSTOMER.harborview,
        amount: 51_250,
        payment_method: 'check',
        reference_no: '10442',
    }),
    item({
        id: LINE.salesReceipt,
        date: '2026-10-17',
        doc_type: 'sales_receipt',
        number: '1012',
        customer: CUSTOMER.stJude,
        amount: 1_234_567_890,
        payment_method: 'credit_card',
        reference_no: 'AUTH 448120-7731-0093-SETTLEMENT-BATCH-2026-10-17',
    }),
    item({
        id: LINE.vendorRefund,
        date: '2026-11-03',
        doc_type: 'vendor_refund',
        number: '1002',
        vendor: VENDOR_IDS.officeSupply,
        amount: 8_640,
        payment_method: 'check',
        reference_no: '7741',
    }),
    item({
        id: LINE.refundReceipt,
        date: '2026-11-10',
        doc_type: 'refund_receipt',
        number: '1003',
        customer: CUSTOMER.harborview,
        amount: -2_000,
        payment_method: 'cash',
    }),
    item({
        id: LINE.journal,
        date: '2026-11-12',
        doc_type: 'journal',
        origin: 'manual',
        number: 'JE-1052',
        document: '',
        amount: 3_500,
        memo: 'Cash count correction for the October farmers market float, counted by Omar and Ana on the 12th',
    }),
] satisfies UndepositedItemRecord[]

// One more item, on the second Undeposited funds account: with it the chart has two such
// accounts with items, so each row names its account under the Transaction link.
export const UNDEPOSITED_ITEMS_TWO_ACCOUNTS = [
    ...UNDEPOSITED_ITEMS,
    item({
        id: LINE.cardSale,
        date: '2026-11-13',
        doc_type: 'sales_receipt',
        number: '1013',
        account: ACCT.cardTerminal,
        customer: CUSTOMER.northwind,
        amount: 31_800,
        payment_method: 'debit_card',
        reference_no: 'TERM 0042',
    }),
] satisfies UndepositedItemRecord[]

// The empty state: nothing waits in Undeposited funds.
export const NO_UNDEPOSITED_ITEMS: UndepositedItemRecord[] = []

export const DEPOSIT_IDS = {
    // Draft: two items ticked and one other funds line. A third stored item (`taken`) is
    // held by Deposit 1002 since the draft was saved.
    draft: 'depsdraft000001',
    // Posted 1004: three items (one is money out) and two other funds lines (interest in,
    // a bank fee as a negative amount).
    posted: 'deps10040000001',
    // Void 1003, replaced by its correction (same number).
    voided: 'deps10030000001',
    correction: 'deps1003fix0001',
} as const

const IDS = DEPOSIT_IDS

type DepositSeed = Pick<DepositRecord, 'id' | 'status' | 'date'> & Partial<DepositRecord>

function deposit(seed: DepositSeed): DepositRecord {
    return {
        number: '',
        sequence: 0,
        deposit_to: ACCT.checking,
        memo: '',
        total: 0,
        items_total: 0,
        lines_total: 0,
        currency: DEPOSIT_CURRENCY,
        entry: '',
        replaces: '',
        replaced_by: '',
        posted_by: '',
        posted_at: '',
        voided_by: '',
        voided_at: '',
        sort_key: '',
        created: STAMP,
        updated: STAMP,
        ...seed,
    }
}

export const DEPOSITS = [
    deposit({
        id: IDS.draft,
        status: 'draft',
        // Before the vendor refund's date (Nov 3): the date refusal shows under that row.
        date: '2026-11-01',
        memo: 'Friday night drop, bag 0417',
    }),
    deposit({
        id: IDS.posted,
        status: 'posted',
        number: '1004',
        sequence: 1004,
        date: '2026-11-14',
        memo: 'Counter deposit at the Burnside branch. The teller kept the $15.00 coin-counting fee from the cash.',
        items_total: 58_889,
        lines_total: -260,
        total: 58_629,
        entry: 'jedeposit100401',
        posted_by: DEPOSIT_USER_IDS.ana,
        posted_at: '2026-11-14 23:12:00.000Z',
    }),
    deposit({
        id: IDS.voided,
        status: 'void',
        number: '1003',
        sequence: 1003,
        date: '2026-11-08',
        items_total: 45_000,
        total: 45_000,
        entry: 'jedeposit100301',
        replaced_by: IDS.correction,
        posted_by: DEPOSIT_USER_IDS.ana,
        posted_at: '2026-11-08 17:40:00.000Z',
        voided_by: DEPOSIT_USER_IDS.omar,
        voided_at: '2026-11-10 09:05:00.000Z',
    }),
    deposit({
        id: IDS.correction,
        status: 'posted',
        number: '1003',
        sequence: 1003,
        date: '2026-11-08',
        deposit_to: ACCT.savings,
        memo: 'The Bluefin receipt was in the same bag; first entry left it out',
        items_total: 57_500,
        total: 57_500,
        entry: 'jedeposit100302',
        replaces: IDS.voided,
        posted_by: DEPOSIT_USER_IDS.omar,
        posted_at: '2026-11-10 09:05:00.000Z',
    }),
] satisfies DepositRecord[]

type DepositItemSeed = Pick<DepositItemRecord, 'line' | 'date' | 'doc_type' | 'number' | 'amount'> &
    Partial<DepositItemRecord>

function depositItems(
    depositId: string,
    tag: string,
    posted: boolean,
    seeds: DepositItemSeed[]
): DepositItemRecord[] {
    return seeds.map((seed, position) => ({
        id: `dpit${tag}${String(position).padStart(2, '0')}`.padEnd(15, '0'),
        deposit: depositId,
        position,
        entry: `je${seed.line.slice(2)}`,
        account: ACCT.undeposited,
        customer: '',
        vendor: '',
        document: `doc${seed.line.slice(3)}`,
        payment_method: '',
        reference_no: '',
        posted,
        created: STAMP,
        updated: STAMP,
        ...seed,
    }))
}

// A listed item as a deposit's stored row (the copy fields are the view row's).
function storedItem(lineId: string): DepositItemSeed {
    const row = UNDEPOSITED_ITEMS.find(candidate => candidate.id === lineId)
    if (!row) throw new Error(`deposit fixture: ${lineId} is not a listed item`)
    return {
        line: row.line,
        entry: row.entry,
        account: row.account,
        customer: row.customer,
        vendor: row.vendor,
        amount: row.amount,
        date: row.date,
        doc_type: row.doc_type,
        number: row.number,
        document: row.document,
        payment_method: row.payment_method,
        reference_no: row.reference_no,
    }
}

const FIXED_PAYMENT: DepositItemSeed = {
    line: LINE.fixedPayment,
    date: '2026-11-05',
    doc_type: 'payment',
    number: '1002',
    customer: CUSTOMER.cedarPine,
    amount: 45_000,
    payment_method: 'check',
    reference_no: '3318',
}

export const DEPOSIT_ITEMS = [
    ...depositItems(IDS.draft, 'drft', false, [
        storedItem(LINE.payment),
        storedItem(LINE.vendorRefund),
        {
            line: LINE.taken,
            date: '2026-09-29',
            doc_type: 'payment',
            number: '0998',
            customer: CUSTOMER.bluefin,
            amount: 12_500,
            payment_method: 'cash',
        },
    ]),
    ...depositItems(IDS.posted, 'post', true, [
        {
            line: LINE.heldPayment,
            date: '2026-10-31',
            doc_type: 'payment',
            number: '1003',
            customer: CUSTOMER.aspen,
            amount: 56_089,
            payment_method: 'check',
            reference_no: '2210',
        },
        // A walk-in sale: the line names no customer, so Received from reads "—".
        {
            line: LINE.heldReceipt,
            date: '2026-11-07',
            doc_type: 'sales_receipt',
            number: '1009',
            amount: 4_800,
            payment_method: 'cash',
        },
        {
            line: LINE.heldRefund,
            date: '2026-11-09',
            doc_type: 'refund_receipt',
            number: '1002',
            customer: CUSTOMER.northwind,
            amount: -2_000,
            payment_method: 'cash',
        },
    ]),
    // The void original released its item (`posted` false); the correction holds it.
    ...depositItems(IDS.voided, 'void', false, [FIXED_PAYMENT]),
    ...depositItems(IDS.correction, 'fixd', true, [
        FIXED_PAYMENT,
        {
            line: LINE.fixedReceipt,
            date: '2026-11-06',
            doc_type: 'sales_receipt',
            number: '1008',
            customer: CUSTOMER.bluefin,
            amount: 12_500,
            payment_method: 'credit_card',
            reference_no: 'AUTH 771204',
        },
    ]),
] satisfies DepositItemRecord[]

type DepositLineSeed = Pick<DepositLineRecord, 'account' | 'amount'> & Partial<DepositLineRecord>

function depositLines(
    depositId: string,
    tag: string,
    seeds: DepositLineSeed[]
): DepositLineRecord[] {
    return seeds.map((seed, position) => ({
        id: `dpln${tag}${String(position).padStart(2, '0')}`.padEnd(15, '0'),
        deposit: depositId,
        customer: '',
        vendor: '',
        description: '',
        position,
        created: STAMP,
        updated: STAMP,
        ...seed,
    }))
}

export const DEPOSIT_LINES = [
    ...depositLines(IDS.draft, 'drft', [
        { account: ACCT.interest, description: 'October interest', amount: 1_240 },
    ]),
    ...depositLines(IDS.posted, 'post', [
        { account: ACCT.interest, description: 'October interest', amount: 1_240 },
        {
            account: ACCT.bankCharges,
            description:
                'Coin-counting fee the teller kept from the cash, per the branch fee schedule',
            amount: -1_500,
        },
    ]),
] satisfies DepositLineRecord[]

export function depositById(depositId: string): DepositRecord {
    const row = DEPOSITS.find(candidate => candidate.id === depositId)
    if (!row) throw new Error(`deposit fixture: no deposit ${depositId}`)
    return row
}

export function depositItemsOf(depositId: string): DepositItemRecord[] {
    return DEPOSIT_ITEMS.filter(row => row.deposit === depositId).sort(
        (a, b) => a.position - b.position
    )
}

export function depositLinesOf(depositId: string): DepositLineRecord[] {
    return DEPOSIT_LINES.filter(row => row.deposit === depositId).sort(
        (a, b) => a.position - b.position
    )
}

/**
 * The form states the reference shows (spec §3.3 to §3.6), as the form would hold them:
 * the header fields, the ticked items by line id, and the other funds lines with their
 * amounts as typed text.
 */
export interface DepositFormFixture {
    // '' for a new deposit; else the stored draft, or the posted original of a correction.
    deposit: string
    depositTo: string
    date: string
    ticked: string[]
    lines: {
        customer: string
        vendor: string
        account: string
        description: string
        amount: string
    }[]
    memo: string
}

export const DEPOSIT_FORM_STATES = {
    // A new deposit: three of the five items ticked (one is money out) and two other funds
    // lines (one names a customer). $512.50 + $86.40 − $20.00 = $578.90 selected,
    // $12.40 + $80.00 = $92.40 other funds, $671.30 in all.
    populated: {
        deposit: '',
        depositTo: ACCT.checking,
        date: DEPOSIT_TODAY,
        ticked: [LINE.payment, LINE.vendorRefund, LINE.refundReceipt],
        lines: [
            {
                customer: '',
                vendor: '',
                account: ACCT.interest,
                description: 'October interest',
                amount: '12.40',
            },
            {
                customer: CUSTOMER.northwind,
                vendor: '',
                account: ACCT.consulting,
                description: 'Workshop seat paid in cash at the door',
                amount: '80.00',
            },
        ],
        memo: '',
    },
    // A new deposit with nothing waiting and no line yet.
    blank: {
        deposit: '',
        depositTo: ACCT.checking,
        date: DEPOSIT_TODAY,
        ticked: [],
        lines: [],
        memo: '',
    },
    // The stored draft after a refused Post: its date is before a ticked item's, and one
    // stored item is in another deposit by now.
    refused: {
        deposit: IDS.draft,
        depositTo: ACCT.savings,
        date: '2026-11-01',
        ticked: [LINE.payment, LINE.vendorRefund, LINE.taken],
        lines: [
            {
                customer: '',
                vendor: '',
                account: ACCT.interest,
                description: 'October interest',
                amount: '12.40',
            },
        ],
        memo: 'Friday night drop, bag 0417',
    },
    // Edit of posted Deposit 1004: its own items are ticked, the waiting items listed too.
    correction: {
        deposit: IDS.posted,
        depositTo: ACCT.checking,
        date: '2026-11-14',
        ticked: [LINE.heldPayment, LINE.heldReceipt, LINE.heldRefund],
        lines: [
            {
                customer: '',
                vendor: '',
                account: ACCT.interest,
                description: 'October interest',
                amount: '12.40',
            },
            {
                customer: '',
                vendor: '',
                account: ACCT.bankCharges,
                description:
                    'Coin-counting fee the teller kept from the cash, per the branch fee schedule',
                amount: '-15.00',
            },
        ],
        memo: 'Counter deposit at the Burnside branch. The teller kept the $15.00 coin-counting fee from the cash.',
    },
} satisfies Record<string, DepositFormFixture>

// The refusals of the `refused` state (spec §3.6, §3.7): by line id under the item's row,
// and the rest in the form's summary. PocketBase adds the final period.
export const DEPOSIT_REFUSALS = {
    items: {
        [LINE.vendorRefund]: 'Vendor refund 1002 is dated Nov 3, 2026, after the deposit date.',
        [LINE.taken]: 'Payment 0998 is already in Deposit 1002.',
    } as Record<string, string>,
    summary: 'Books are closed through Oct 31, 2026.',
} as const

// A deposited payment's read view (spec §3.10): the notice names the deposit that holds it.
export const IN_DEPOSIT_FIXTURE = {
    paymentNumber: '1003',
    amount: 56_089,
    deposit: IDS.posted,
    depositNumber: '1004',
} as const

// Texts the reference shows (spec §3.3 to §3.10).
export const DEPOSIT_TEXTS = {
    noBankAccount: 'Add a bank account to the chart of accounts',
    listEmpty:
        'Nothing waits in Undeposited funds. Payments and sales receipts that you deposit to Undeposited funds show here.',
    listLoadFailed: 'Books could not load the undeposited items.',
    otherFundsHint:
        'Money in this deposit that is not from a listed payment, such as interest or a refund. A negative amount takes money out, such as a fee or cash kept back.',
    memoHint: 'Only your team sees this. Saved as the journal entry memo.',
    noAccess: 'You need bookkeeper access to record deposits',
    loadError: 'Books could not load this deposit.',
    notFound: 'This deposit does not exist',
    cannotEdit: 'This deposit cannot be edited',
    voidBody:
        'A reversing entry is posted in the original period. The number is kept. The items it deposited wait in Undeposited funds again.',
    inDeposit: 'To edit or void this payment, remove it from the deposit first.',
    deleteDraftBody: "Delete this draft deposit? This can't be undone.",
} as const

/**
 * What seed.ts posts (spec §4.6, seedDeposits): two more sales receipts to 1200
 * Undeposited funds and one deposit to 1000 Business Checking that holds the first of them
 * plus an interest line. The seeded payments stay undeposited. Every row is dated the seed
 * run's day: Trial Balance pins its rows as of the end of last month, which such a row
 * never enters, and no spec pins a today or this-month total of the shared database.
 */
export const DEPOSIT_SEED = {
    receipts: [
        { key: 'deposited', amount: 18_000, payment_method: 'check' },
        { key: 'waiting', amount: 6_400, payment_method: 'cash' },
    ],
    deposit: {
        depositNumber: '1000',
        holds: 'deposited',
        line: { accountNumber: '4900', description: 'October interest', amount: 1_240 },
        memo: 'Seeded deposit',
    },
} as const

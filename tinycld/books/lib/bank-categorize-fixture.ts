// Synthetic data for the helix reference route of categorize, split and transfer (the e2e
// book gets its added transaction from seed.ts, through the real Go hook). Plain data, and
// it imports only types and other plain data, because the seed graph runs in plain node
// (tests/seed-node.test.ts). Amounts are integer minor units (cents); a bank amount is
// signed, money in is positive. Accounts are the seeded e2e book's (lib/seed-accounts.ts),
// by number, and one account that only this file has (CAT_LONG_ACCOUNT_NUMBER). Every bank
// transaction here is on 1000 Business Checking.
import type {
    BooksAccounts,
    BooksBankCategorizations,
    BooksBankMatches,
    BooksBankTransactions,
    BooksJournalEntries,
    BooksJournalLines,
} from '../types'
import { BANK_USERS } from './bank-connection-fixture'
import {
    REVIEW_ACCOUNTS,
    REVIEW_CONNECTION_IDS,
    REVIEW_CURRENCY,
    REVIEW_FILES,
    REVIEW_LONG_DESCRIPTION,
} from './for-review-fixture'
import { SEED_ACCOUNTS } from './seed-accounts'

export const CAT_CURRENCY = REVIEW_CURRENCY
export const CAT_CONNECTION_ID = REVIEW_CONNECTION_IDS.checking
export const CAT_USERS = [BANK_USERS.ana, BANK_USERS.ben]

function serialId(prefix: string, n: number): string {
    return `${prefix}${n.toString().padStart(8, '0')}`
}

function accountId(number: string): string {
    return `catacct${number.padStart(8, '0')}`
}

type FixtureAccount = Pick<
    BooksAccounts,
    'id' | 'name' | 'number' | 'type' | 'detail_type' | 'parent' | 'inactive'
>

// The one account the seeded chart does not have: 61 characters with its number, so a
// picker trigger and a posted line must put it on one line with an ellipsis.
export const CAT_LONG_ACCOUNT_NUMBER = '6310'
const LONG_ACCOUNT: FixtureAccount = {
    id: accountId(CAT_LONG_ACCOUNT_NUMBER),
    name: 'Bank charges, merchant processing and payment gateway fees',
    number: CAT_LONG_ACCOUNT_NUMBER,
    type: 'expense',
    detail_type: 'bank_charges',
    parent: '',
    inactive: false,
}

function parentId(key: string | undefined): string {
    const parent = SEED_ACCOUNTS.find(account => account.key === key)
    return parent ? accountId(parent.number) : ''
}

// The chart the pickers read: the seeded accounts (1100 Accounts receivable and the
// inactive 6900 among them, which the Categorize picker must not offer) and the long one.
export const CAT_ACCOUNTS = [
    ...SEED_ACCOUNTS.map(account => ({
        id: accountId(account.number),
        name: account.name,
        number: account.number,
        type: account.type,
        detail_type: account.detail_type,
        parent: parentId(account.parent),
        inactive: account.inactive === true,
    })),
    LONG_ACCOUNT,
] satisfies FixtureAccount[]

export const CAT_ACCOUNT_IDS = {
    checking: accountId('1000'),
    savings: accountId('1010'),
    card: accountId('2100'),
    consulting: accountId('4000'),
    rent: accountId('6100'),
    software: accountId('6200'),
    designTools: accountId('6210'),
    bankFees: accountId(CAT_LONG_ACCOUNT_NUMBER),
} as const

// The connection's own account: no picker offers it.
export const CAT_ACCOUNT_ID = CAT_ACCOUNT_IDS.checking
export const CAT_ACCOUNT_LABEL = '1000 Business Checking'

// 78 characters: a payee trigger and the Books transaction row must truncate it.
export const CAT_LONG_VENDOR_NAME =
    'Northwind Card Services and Merchant Processing of the Pacific Northwest, LLC'

export const CAT_PARTIES = [
    { id: 'catcustbright00', kind: 'customer', name: 'Brightline Studio' },
    { id: 'catcustcedar000', kind: 'customer', name: 'Cedar & Pine LLC' },
    { id: 'catcustharbor00', kind: 'customer', name: 'Harbor Design' },
    { id: 'catcustlumen000', kind: 'customer', name: 'Lumen Labs' },
    { id: 'catvendadobe000', kind: 'vendor', name: 'Adobe' },
    { id: 'catvendfigma000', kind: 'vendor', name: 'Figma' },
    { id: 'catvendnorthwin', kind: 'vendor', name: CAT_LONG_VENDOR_NAME },
    { id: 'catvendoffdepot', kind: 'vendor', name: 'Office Depot' },
] as const

export type CatPartyId = (typeof CAT_PARTIES)[number]['id']

const FILE_ID = REVIEW_FILES.find(file => file.name === 'checking-2026-10.csv')?.id ?? ''

type Status = BooksBankTransactions['status']

// [date, description, cents, memo, check number]
type BankLine = readonly [string, string, number, string?, string?]

let txnSerial = 0

function txns(status: Status, lines: readonly BankLine[]): BooksBankTransactions[] {
    return lines.map(([date, description, amount, memo = '', checkNumber = '']) => {
        txnSerial += 1
        return {
            id: serialId('cattxn0', txnSerial),
            connection: CAT_CONNECTION_ID,
            file: FILE_ID,
            bank_import: 'revimpchk0oct00',
            line: txnSerial + 1,
            date,
            description,
            memo,
            amount,
            fitid: '',
            check_number: checkNumber,
            dedupe_hash: (3000 + txnSerial).toString(16).padStart(64, '0'),
            status,
            created: `${date} 12:00:00.000Z`,
            updated: `${date} 12:00:00.000Z`,
        }
    })
}

// For review, newest first: nothing in Books (Spent), a deposit that is an invoice less
// two fees (the split), one suggestion, a card payment (a transfer out), nothing in Books
// (Received), the 70-character description, money in from savings (a transfer in), a
// check with a memo and a number, and two small rows.
const FOR_REVIEW = txns('for_review', [
    ['2026-11-12', 'Card purchase - Office Depot #2231', -8_647],
    ['2026-11-10', 'Deposit - Brightline Studio', 97_000, 'INV-1052 less wire and app fees'],
    ['2026-11-09', 'Online transfer to savings 7730', -86_815, 'Ref 00412'],
    ['2026-11-06', 'Payment to Company Card 0937', -50_000],
    ['2026-11-05', 'Zelle from Lumen Labs', 187_500],
    ['2026-11-04', REVIEW_LONG_DESCRIPTION, -120_000],
    ['2026-11-03', 'Online transfer from savings 7730', 250_000],
    ['2026-11-02', 'Check 1052', -45_000, 'Sign installation deposit', '1052'],
    ['2026-10-30', 'Monthly service fee', -1_200],
    ['2026-10-28', 'Card purchase - Adobe Creative Cloud', -5_999],
])

// Reviewed, newest first: added as a journal entry of one line, as a split, as a
// transfer, and one that was matched (p4-match), so the In Books column shows both words.
const REVIEWED = txns('reviewed', [
    ['2026-10-27', 'Card purchase - Figma Inc', -4_500],
    ['2026-10-22', 'Deposit - Cedar & Pine LLC', 48_500, 'INV-1049'],
    ['2026-10-20', 'Payment to Company Card 0937', -120_000],
    ['2026-10-15', 'ACH - Comcast Business', -18_995],
])

export const CAT_TRANSACTIONS = [...FOR_REVIEW, ...REVIEWED] satisfies BooksBankTransactions[]
export const CAT_FOR_REVIEW_ROWS = FOR_REVIEW
export const CAT_REVIEWED_ROWS = REVIEWED

function txnIdOf(date: string, amount: number): string {
    return CAT_TRANSACTIONS.find(row => row.date === date && row.amount === amount)?.id ?? ''
}

// The rows the reference opens or chooses.
export const CAT_TXN_IDS = {
    spent: txnIdOf('2026-11-12', -8_647),
    split: txnIdOf('2026-11-10', 97_000),
    oneSuggestion: txnIdOf('2026-11-09', -86_815),
    transferOut: txnIdOf('2026-11-06', -50_000),
    received: txnIdOf('2026-11-05', 187_500),
    longDescription: txnIdOf('2026-11-04', -120_000),
    transferIn: txnIdOf('2026-11-03', 250_000),
    serviceFee: txnIdOf('2026-10-30', -1_200),
    adobe: txnIdOf('2026-10-28', -5_999),
    addedOne: txnIdOf('2026-10-27', -4_500),
    addedSplit: txnIdOf('2026-10-22', 48_500),
    addedTransfer: txnIdOf('2026-10-20', -120_000),
    matched: txnIdOf('2026-10-15', -18_995),
} as const

type FixtureEntry = Pick<
    BooksJournalEntries,
    'id' | 'date' | 'status' | 'doc_type' | 'origin' | 'document' | 'number' | 'memo' | 'total'
>

type FixtureLine = Pick<
    BooksJournalLines,
    | 'id'
    | 'entry'
    | 'account'
    | 'debit'
    | 'credit'
    | 'memo'
    | 'position'
    | 'posted'
    | 'date'
    | 'currency'
    | 'customer'
    | 'vendor'
>

// One line of a posted entry: [account, signed cents (a debit is positive), memo].
type Posted = readonly [string, number, string?]

type Booked = {
    date: string
    docType: BooksJournalEntries['doc_type']
    number: string
    memo: string
    party: CatPartyId | ''
    // Line 1 is the line on 1000 Business Checking.
    lines: readonly Posted[]
}

function partyKind(id: string): 'customer' | 'vendor' | '' {
    return CAT_PARTIES.find(party => party.id === id)?.kind ?? ''
}

const IDS = CAT_ACCOUNT_IDS

// The Books transactions: the three that categorize and transfer posted (dated the bank
// date, memo from the form, the payee on every line), the transfer that is the one
// suggestion of the Nov 9 row, and the expense the Oct 15 row was matched to.
const BOOKED: readonly Booked[] = [
    {
        date: '2026-10-27',
        docType: 'journal',
        number: '1042',
        memo: 'Card purchase - Figma Inc',
        party: 'catvendfigma000',
        lines: [
            [IDS.checking, -4_500],
            [IDS.designTools, 4_500],
        ],
    },
    {
        date: '2026-10-22',
        docType: 'journal',
        number: '1043',
        memo: 'Deposit - Cedar & Pine LLC',
        party: 'catcustcedar000',
        lines: [
            [IDS.checking, 48_500],
            [IDS.consulting, -50_000, 'INV-1049'],
            [IDS.bankFees, 1_500, 'Incoming wire fee'],
        ],
    },
    {
        date: '2026-10-20',
        docType: 'transfer',
        number: '1008',
        memo: 'Payment to Company Card 0937',
        party: '',
        lines: [
            [IDS.checking, -120_000],
            [IDS.card, 120_000],
        ],
    },
    {
        date: '2026-11-09',
        docType: 'transfer',
        number: '1007',
        memo: 'To savings',
        party: '',
        lines: [
            [IDS.checking, -86_815],
            [IDS.savings, 86_815],
        ],
    },
    {
        date: '2026-10-14',
        docType: 'expense',
        number: '1029',
        memo: '',
        party: '',
        lines: [
            [IDS.checking, -18_995],
            [IDS.software, 18_995],
        ],
    },
]

function entryOf(booked: Booked, n: number): FixtureEntry {
    const isDocument = booked.docType !== 'journal' && booked.docType !== 'transfer'
    return {
        id: serialId('catent0', n),
        date: booked.date,
        status: 'posted',
        doc_type: booked.docType,
        origin: isDocument ? 'document' : 'manual',
        document: isDocument ? serialId('catdoc0', n) : '',
        number: booked.number,
        memo: booked.memo,
        total: Math.abs(booked.lines[0]?.[1] ?? 0),
    }
}

function linesOf(booked: Booked, n: number): FixtureLine[] {
    const kind = partyKind(booked.party)
    return booked.lines.map(([account, cents, memo = ''], position) => ({
        id: serialId('catlin0', n * 10 + position),
        entry: serialId('catent0', n),
        account,
        debit: cents > 0 ? cents : 0,
        credit: cents < 0 ? -cents : 0,
        memo,
        position,
        posted: true,
        date: booked.date,
        currency: CAT_CURRENCY,
        customer: kind === 'customer' ? booked.party : '',
        vendor: kind === 'vendor' ? booked.party : '',
    }))
}

export const CAT_ENTRIES = BOOKED.map((booked, index) =>
    entryOf(booked, index + 1)
) satisfies FixtureEntry[]

export const CAT_LINES = BOOKED.flatMap((booked, index) =>
    linesOf(booked, index + 1)
) satisfies FixtureLine[]

function entryIdOf(docType: BooksJournalEntries['doc_type'], number: string): string {
    return CAT_ENTRIES.find(row => row.doc_type === docType && row.number === number)?.id ?? ''
}

function bankLineIdOf(entryId: string): string {
    return CAT_LINES.find(line => line.entry === entryId && line.position === 0)?.id ?? ''
}

export const CAT_ENTRY_IDS = {
    addedOne: entryIdOf('journal', '1042'),
    addedSplit: entryIdOf('journal', '1043'),
    addedTransfer: entryIdOf('transfer', '1008'),
    suggested: entryIdOf('transfer', '1007'),
    matched: entryIdOf('expense', '1029'),
} as const

// The one suggestion of the reference: Transfer 1007 for the Nov 9 row.
export const CAT_SUGGESTION = {
    id: `${CAT_TXN_IDS.oneSuggestion}${bankLineIdOf(CAT_ENTRY_IDS.suggested)}`,
    bank_transaction: CAT_TXN_IDS.oneSuggestion,
    line: bankLineIdOf(CAT_ENTRY_IDS.suggested),
    entry: CAT_ENTRY_IDS.suggested,
} as const

// One line of a categorization: `amount` is signed for the transaction's own direction (a
// positive amount goes on the side opposite the bank line). The spec's Data section.
export interface BankCategorizationLine {
    account: string
    amount: number
    memo: string
}

const ADDED_AT = '2026-11-18 15:42:00.000Z'

type Added = {
    txn: string
    kind: BooksBankCategorizations['kind']
    entry: string
    lines: BankCategorizationLine[]
    by: string
}

const ADDED: readonly Added[] = [
    {
        txn: CAT_TXN_IDS.addedOne,
        kind: 'categorize',
        entry: CAT_ENTRY_IDS.addedOne,
        lines: [{ account: IDS.designTools, amount: 4_500, memo: '' }],
        by: BANK_USERS.ana.id,
    },
    {
        txn: CAT_TXN_IDS.addedSplit,
        kind: 'categorize',
        entry: CAT_ENTRY_IDS.addedSplit,
        lines: [
            { account: IDS.consulting, amount: 50_000, memo: 'INV-1049' },
            { account: IDS.bankFees, amount: -1_500, memo: 'Incoming wire fee' },
        ],
        by: BANK_USERS.ana.id,
    },
    {
        txn: CAT_TXN_IDS.addedTransfer,
        kind: 'transfer',
        entry: CAT_ENTRY_IDS.addedTransfer,
        lines: [{ account: IDS.card, amount: 120_000, memo: '' }],
        by: BANK_USERS.ben.id,
    },
]

function bookedOf(entryId: string): Booked | undefined {
    return BOOKED[CAT_ENTRIES.findIndex(entry => entry.id === entryId)]
}

function partyField(entryId: string, kind: 'customer' | 'vendor'): string {
    const party = bookedOf(entryId)?.party ?? ''
    return partyKind(party) === kind ? party : ''
}

export const CAT_CATEGORIZATIONS = ADDED.map((added, index) => ({
    id: serialId('catcat0', index + 1),
    bank_transaction: added.txn,
    kind: added.kind,
    customer: partyField(added.entry, 'customer'),
    vendor: partyField(added.entry, 'vendor'),
    memo: bookedOf(added.entry)?.memo ?? '',
    lines: added.lines,
    connection: CAT_CONNECTION_ID,
    entry: added.entry,
    created_by: added.by,
    created: ADDED_AT,
    updated: ADDED_AT,
})) satisfies BooksBankCategorizations[]

// The match row each reviewed transaction has: the Go hook saves one for an added
// transaction too (the entry's line on the connection's account), and p4-match made the
// last one.
const MATCHED_ENTRIES: readonly (readonly [string, string])[] = [
    ...ADDED.map(added => [added.txn, added.entry] as const),
    [CAT_TXN_IDS.matched, CAT_ENTRY_IDS.matched],
]

export const CAT_MATCHES = MATCHED_ENTRIES.map(([bankTransaction, entryId], index) => ({
    id: serialId('catmat0', index + 1),
    bank_transaction: bankTransaction,
    lines: [bankLineIdOf(entryId)],
    connection: CAT_CONNECTION_ID,
    created_by: BANK_USERS.ana.id,
    created: ADDED_AT,
    updated: ADDED_AT,
})) satisfies BooksBankMatches[]

// What the reference shows typed in the forms. An amount is the text of the field: no
// sign for the transaction's own direction, a minus for the other one.
export type CatFormLine = { account: string; amount: string; memo: string }
export type CatForm = { payee: CatPartyId | ''; memo: string; lines: readonly CatFormLine[] }

function descriptionOf(txnId: string): string {
    return CAT_TRANSACTIONS.find(row => row.id === txnId)?.description ?? ''
}

export const CAT_FORMS = {
    // As the Categorize way opens: no payee, no account, the memo is the bank description.
    empty: {
        payee: '',
        memo: descriptionOf(CAT_TXN_IDS.spent),
        lines: [{ account: '', amount: '', memo: '' }],
    },
    filled: {
        payee: 'catvendoffdepot',
        memo: descriptionOf(CAT_TXN_IDS.spent),
        lines: [{ account: IDS.software, amount: '', memo: '' }],
    },
    // $970.00 received: the invoice of $1,000.00 less two fees.
    split: {
        payee: 'catcustbright00',
        memo: descriptionOf(CAT_TXN_IDS.split),
        lines: [
            { account: IDS.consulting, amount: '1,000.00', memo: 'INV-1052' },
            { account: IDS.bankFees, amount: '-25.00', memo: 'Incoming wire fee' },
            { account: IDS.software, amount: '-5.00', memo: 'Payment app fee' },
        ],
    },
    // Two lines that leave $120.00: the second line has no account yet.
    splitShort: {
        payee: 'catcustbright00',
        memo: descriptionOf(CAT_TXN_IDS.split),
        lines: [
            { account: IDS.consulting, amount: '850.00', memo: 'INV-1052' },
            { account: '', amount: '', memo: '' },
        ],
    },
    // The long description, the long vendor and the long account in one form.
    long: {
        payee: 'catvendnorthwin',
        memo: REVIEW_LONG_DESCRIPTION,
        lines: [{ account: IDS.bankFees, amount: '', memo: '' }],
    },
} as const satisfies Record<string, CatForm>

export type CatFormName = keyof typeof CAT_FORMS

// The Transfer way: the other account and the memo.
export const CAT_TRANSFER_FORMS = {
    empty: { account: '', memo: descriptionOf(CAT_TXN_IDS.transferOut) },
    out: { account: IDS.card, memo: descriptionOf(CAT_TXN_IDS.transferOut) },
    in: { account: IDS.savings, memo: descriptionOf(CAT_TXN_IDS.transferIn) },
} as const

export type CatTransferFormName = keyof typeof CAT_TRANSFER_FORMS

// Chosen on For review for the selection bar and the Categorize dialog: three money-out
// rows, $158.46 together.
export const CAT_CHOSEN_IDS = [CAT_TXN_IDS.spent, CAT_TXN_IDS.serviceFee, CAT_TXN_IDS.adobe]
// After a batch in which two of the three were refused: they stay chosen.
export const CAT_FAILED_IDS = CAT_CHOSEN_IDS.slice(0, 2)

// The account strip's cards; the checking card counts this file's For review rows.
export const CAT_STRIP_ACCOUNTS = REVIEW_ACCOUNTS.map(account => ({
    ...account,
    reviewCount: account.id === CAT_CONNECTION_ID ? FOR_REVIEW.length : account.reviewCount,
}))

export const CAT_REFERENCE_TEXT = {
    // server/bank_match.go msgBankMatchReviewed: another user reviewed the row first.
    refusal: 'This transaction is already reviewed.',
    addedResult: 'Added Journal entry 1044.',
    batchDone: 'Categorized 3 transactions.',
    batchFailed: '2 of 3 transactions could not be categorized. Try again.',
    undone: 'Undone. Journal entry 1042 is void and the transaction is back in For review.',
} as const

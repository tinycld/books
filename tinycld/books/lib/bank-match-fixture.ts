// Synthetic data for the helix reference route of bank matching (the seed and the e2e book
// get their matches from a real import and real posted entries, not from this file). Plain
// data, and it imports only types and other plain data, because the seed graph runs in plain
// node (tests/seed-node.test.ts). Amounts are integer minor units (cents); a bank amount is
// signed, money in is positive. Accounts are the seeded e2e book's (lib/seed-accounts.ts), by
// number: every row here is on 1000 Business Checking.
import type {
    BooksBankMatches,
    BooksBankMatchLines,
    BooksBankMatchSuggestions,
    BooksBankTransactions,
    BooksJournalEntries,
    BooksJournalLines,
} from '../types'
import { BANK_ACCOUNT_IDS, BANK_USERS } from './bank-connection-fixture'
import {
    REVIEW_ACCOUNTS,
    REVIEW_CONNECTION_IDS,
    REVIEW_CURRENCY,
    REVIEW_FILES,
    REVIEW_LONG_DESCRIPTION,
} from './for-review-fixture'

export const MATCH_CURRENCY = REVIEW_CURRENCY
export const MATCH_CONNECTION_ID = REVIEW_CONNECTION_IDS.checking
export const MATCH_ACCOUNT_ID = BANK_ACCOUNT_IDS.checking
export const MATCH_ACCOUNT_LABEL = '1000 Business Checking'
export const MATCH_USERS = [BANK_USERS.ana, BANK_USERS.ben]

// The suggestion window of the spec (lib/bank-match.ts will own these constants).
export const FIXTURE_DAYS_BEFORE = 90
export const FIXTURE_DAYS_AFTER = 7

// 78 characters: a Books transaction row must put the name on one line with an ellipsis.
export const MATCH_LONG_VENDOR_NAME =
    'Northwind Card Services and Merchant Processing of the Pacific Northwest, LLC'

export const MATCH_PARTIES = [
    { id: 'mtchcustharbor0', kind: 'customer', name: 'Harbor Design' },
    { id: 'mtchcustlumen00', kind: 'customer', name: 'Lumen Labs' },
    { id: 'mtchcustbright0', kind: 'customer', name: 'Brightline Studio' },
    { id: 'mtchcustcedar00', kind: 'customer', name: 'Cedar & Pine LLC' },
    { id: 'mtchvendhartwel', kind: 'vendor', name: 'Hartwell Insurance' },
    { id: 'mtchvendnorthwi', kind: 'vendor', name: MATCH_LONG_VENDOR_NAME },
    { id: 'mtchvendcomcast', kind: 'vendor', name: 'Comcast Business' },
] as const

type PartyId = (typeof MATCH_PARTIES)[number]['id']

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

// [date, doc type, number, signed cents on the bank account (money in is positive), party, memo]
type Booked = readonly [
    string,
    BooksJournalEntries['doc_type'],
    string,
    number,
    (PartyId | '')?,
    string?,
]

function serialId(prefix: string, n: number): string {
    return `${prefix}${n.toString().padStart(8, '0')}`
}

function partyKind(id: string): 'customer' | 'vendor' | '' {
    return MATCH_PARTIES.find(party => party.id === id)?.kind ?? ''
}

// A document's entry opens on its document's screen; a transfer and a journal entry are
// made by hand.
function originOf(docType: BooksJournalEntries['doc_type']): BooksJournalEntries['origin'] {
    return docType === 'transfer' || docType === 'journal' ? 'manual' : 'document'
}

function entryOf([date, docType, number, cents, , memo = '']: Booked, n: number): FixtureEntry {
    const id = serialId('mtchent', n)
    const origin = originOf(docType)
    return {
        id,
        date,
        status: 'posted',
        doc_type: docType,
        origin,
        document: origin === 'document' ? serialId('mtchdoc', n) : '',
        number,
        memo,
        total: Math.abs(cents),
    }
}

// The entry's line on the bank account: money in is its debit, money out its credit.
function bankLineOf([date, , , cents, party = '', memo = '']: Booked, n: number): FixtureLine {
    const kind = partyKind(party)
    return {
        id: serialId('mtchlin', n),
        entry: serialId('mtchent', n),
        account: MATCH_ACCOUNT_ID,
        debit: cents > 0 ? cents : 0,
        credit: cents < 0 ? -cents : 0,
        memo,
        position: 0,
        posted: true,
        date,
        currency: MATCH_CURRENCY,
        customer: kind === 'customer' ? party : '',
        vendor: kind === 'vendor' ? party : '',
    }
}

// The Books transactions on 1000 Business Checking. Three payments of $3,100.00 fit one bank
// deposit; three other receipts add up to a deposit of $2,755.00 that no single one equals;
// the July rows are matched already.
const BOOKED: readonly Booked[] = [
    ['2026-09-03', 'transfer', '1007', -86_815, '', 'To savings'],
    ['2026-09-01', 'payment', '1012', 310_000, 'mtchcustharbor0'],
    ['2026-08-25', 'payment', '1009', 310_000, 'mtchcustharbor0'],
    ['2026-09-02', 'sales_receipt', '1004', 310_000, 'mtchcustlumen00'],
    ['2026-08-17', 'payment', '1006', 120_000, 'mtchcustbright0'],
    ['2026-08-18', 'payment', '1007', 95_500, 'mtchcustcedar00'],
    ['2026-08-18', 'sales_receipt', '1003', 60_000, 'mtchcustlumen00', 'Workshop, half day'],
    ['2026-08-13', 'bill_payment', '1031', -120_000, 'mtchvendnorthwi'],
    ['2026-08-26', 'expense', '1033', -36_240, 'mtchvendhartwel', 'Policy BOP-22871'],
    ['2026-08-24', 'payment', '1008', 187_500, 'mtchcustlumen00'],
    ['2026-08-25', 'sales_receipt', '1002', 187_500, 'mtchcustlumen00'],
    ['2026-08-12', 'journal', '1040', 41_800, '', 'Owner contribution'],
    ['2026-08-20', 'expense', '1034', -4_312, '', 'Printer paper'],
    ['2026-07-15', 'transfer', '1003', -50_000, '', 'To savings'],
    ['2026-07-20', 'payment', '1001', 150_000, 'mtchcustbright0'],
    ['2026-07-21', 'payment', '1002', 162_500, 'mtchcustharbor0'],
    ['2026-07-21', 'payment', '1003', 90_000, 'mtchcustcedar00'],
    ['2026-07-27', 'expense', '1029', -18_995, 'mtchvendcomcast'],
]

export const MATCH_ENTRIES = BOOKED.map((booked, index) =>
    entryOf(booked, index + 1)
) satisfies FixtureEntry[]

export const MATCH_LINES = BOOKED.map((booked, index) =>
    bankLineOf(booked, index + 1)
) satisfies FixtureLine[]

function lineIdOf(docType: BooksJournalEntries['doc_type'], number: string): string {
    const entry = MATCH_ENTRIES.find(row => row.doc_type === docType && row.number === number)
    return MATCH_LINES.find(line => line.entry === entry?.id)?.id ?? ''
}

const FILE_ID = REVIEW_FILES.find(file => file.name === 'checking-2026-08.csv')?.id ?? ''

type Status = BooksBankTransactions['status']

// [date, description, cents, memo, check number]
type BankLine = readonly [string, string, number, string?, string?]

let txnSerial = 0

function txns(status: Status, lines: readonly BankLine[]): BooksBankTransactions[] {
    return lines.map(([date, description, amount, memo = '', checkNumber = '']) => {
        txnSerial += 1
        return {
            id: serialId('mtchtxn', txnSerial),
            connection: MATCH_CONNECTION_ID,
            file: FILE_ID,
            bank_import: 'revimpchk0aug00',
            line: txnSerial + 1,
            date,
            description,
            memo,
            amount,
            fitid: '',
            check_number: checkNumber,
            dedupe_hash: (2000 + txnSerial).toString(16).padStart(64, '0'),
            status,
            created: `${date} 12:00:00.000Z`,
            updated: `${date} 12:00:00.000Z`,
        }
    })
}

// For review, newest first: one suggestion (the spec's example), three of one amount, none
// with a memo and a check number, one whose memo the mark replaces, two of one amount, none,
// one that only three Books transactions together equal, the 70-character description, and
// two small rows with nothing in Books.
const FOR_REVIEW = txns('for_review', [
    ['2026-09-03', 'Online transfer to savings 7730', -86_815, 'Ref 00412'],
    ['2026-09-02', 'Deposit - Harbor Design client payment', 310_000, 'INV-1041'],
    ['2026-09-01', 'Check 1043', -20_000, 'Window cleaning, Q3', '1043'],
    ['2026-08-28', 'Check 1050', -36_240, 'Hartwell Insurance, policy BOP-22871', '1050'],
    ['2026-08-25', 'Zelle from Lumen Labs', 187_500],
    ['2026-08-21', 'Card purchase - Office Depot #2231', -8_647],
    ['2026-08-19', 'Deposit', 275_500, 'Branch deposit 0412'],
    ['2026-08-14', REVIEW_LONG_DESCRIPTION, -120_000],
    ['2026-08-10', 'Interest payment', 418],
    ['2026-08-04', 'Monthly service fee', -1_200],
])

// Reviewed, newest first: matched to one expense, to three payments, to one transfer.
const REVIEWED = txns('reviewed', [
    ['2026-07-28', 'ACH - Comcast Business', -18_995],
    ['2026-07-22', 'Deposit', 402_500, 'Branch deposit 0398'],
    ['2026-07-15', 'Transfer to savings', -50_000],
])

export const MATCH_TRANSACTIONS = [...FOR_REVIEW, ...REVIEWED] satisfies BooksBankTransactions[]
export const MATCH_FOR_REVIEW_ROWS = FOR_REVIEW
export const MATCH_REVIEWED_ROWS = REVIEWED

function txnIdOf(date: string, amount: number): string {
    return MATCH_TRANSACTIONS.find(row => row.date === date && row.amount === amount)?.id ?? ''
}

// The rows the reference opens or chooses, by what Books found for each.
export const MATCH_TXN_IDS = {
    oneSuggestion: txnIdOf('2026-09-03', -86_815),
    threeSuggestions: txnIdOf('2026-09-02', 310_000),
    memoKept: txnIdOf('2026-09-01', -20_000),
    memoReplaced: txnIdOf('2026-08-28', -36_240),
    twoSuggestions: txnIdOf('2026-08-25', 187_500),
    noSuggestion: txnIdOf('2026-08-21', -8_647),
    threeTogether: txnIdOf('2026-08-19', 275_500),
    longDescription: txnIdOf('2026-08-14', -120_000),
    matchedOne: txnIdOf('2026-07-28', -18_995),
    matchedThree: txnIdOf('2026-07-22', 402_500),
    matchedTransfer: txnIdOf('2026-07-15', -50_000),
} as const

const MATCHED_AT = '2026-11-18 15:42:00.000Z'

// [bank transaction, the matched lines, who matched it]
const MATCHED: readonly (readonly [string, readonly [string, ...string[]], string])[] = [
    [MATCH_TXN_IDS.matchedOne, [lineIdOf('expense', '1029')], BANK_USERS.ana.id],
    [
        MATCH_TXN_IDS.matchedThree,
        [lineIdOf('payment', '1001'), lineIdOf('payment', '1002'), lineIdOf('payment', '1003')],
        BANK_USERS.ana.id,
    ],
    [MATCH_TXN_IDS.matchedTransfer, [lineIdOf('transfer', '1003')], BANK_USERS.ben.id],
]

export const MATCH_MATCHES = MATCHED.map(([bankTransaction, lines, createdBy], index) => ({
    id: serialId('mtchmat', index + 1),
    bank_transaction: bankTransaction,
    lines: [...lines],
    connection: MATCH_CONNECTION_ID,
    created_by: createdBy,
    created: MATCHED_AT,
    updated: MATCHED_AT,
})) satisfies BooksBankMatches[]

function lineAmountOf(lineId: string): number {
    const line = MATCH_LINES.find(row => row.id === lineId)
    return line ? line.debit + line.credit : 0
}

export const MATCH_MATCH_LINES = MATCH_MATCHES.flatMap(match =>
    match.lines.map(lineId => ({
        id: serialId('mtchmln', Number(lineId.slice(-8))),
        match: match.id,
        bank_transaction: match.bank_transaction,
        line: lineId,
        entry: MATCH_LINES.find(row => row.id === lineId)?.entry ?? '',
        amount: lineAmountOf(lineId),
        created: MATCHED_AT,
        updated: MATCHED_AT,
    }))
) satisfies BooksBankMatchLines[]

const DAY_MS = 86_400_000

function daysBetween(from: string, to: string): number {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

const MATCHED_LINE_IDS = new Set(MATCH_MATCH_LINES.map(row => row.line))

// What the view `books_bank_match_suggestions` answers for the rows above: a line that is
// not matched, on the same side, of exactly the bank amount, dated from 90 days before to 7
// days after the bank date; nearest date first, then entry number.
function suggestionsOf(txn: BooksBankTransactions): BooksBankMatchSuggestions[] {
    return MATCH_LINES.filter(line => {
        const signed = line.debit - line.credit
        const after = daysBetween(txn.date, line.date)
        return (
            signed === txn.amount &&
            !MATCHED_LINE_IDS.has(line.id) &&
            after <= FIXTURE_DAYS_AFTER &&
            after >= -FIXTURE_DAYS_BEFORE
        )
    })
        .map(line => ({
            id: `${txn.id}${line.id}`,
            bank_transaction: txn.id,
            connection: txn.connection,
            line: line.id,
            entry: line.entry,
            date: line.date,
            days_apart: Math.abs(daysBetween(txn.date, line.date)),
        }))
        .sort((a, b) => a.days_apart - b.days_apart || a.entry.localeCompare(b.entry))
}

export const MATCH_SUGGESTIONS = FOR_REVIEW.flatMap(
    suggestionsOf
) satisfies BooksBankMatchSuggestions[]

// The find mode of the $2,755.00 deposit: the three receipts that add up to it, and two of
// them, which leave a difference of $600.00.
export const MATCH_FIND_EXACT_LINE_IDS = [
    lineIdOf('payment', '1006'),
    lineIdOf('payment', '1007'),
    lineIdOf('sales_receipt', '1003'),
]
export const MATCH_FIND_SHORT_LINE_IDS = MATCH_FIND_EXACT_LINE_IDS.slice(0, 2)

// Chosen on For review for the selection bar: four rows with exactly one suggestion would
// be the spec's example; this book has three, and two chosen rows that need a choice.
export const MATCH_CHOSEN_IDS = [
    MATCH_TXN_IDS.oneSuggestion,
    MATCH_TXN_IDS.threeSuggestions,
    MATCH_TXN_IDS.memoReplaced,
    MATCH_TXN_IDS.noSuggestion,
    MATCH_TXN_IDS.longDescription,
]
// After the batch: the three rows with one suggestion are matched and gone, the other two
// stay chosen.
export const MATCH_SKIPPED_IDS = [MATCH_TXN_IDS.threeSuggestions, MATCH_TXN_IDS.noSuggestion]

// The account strip's cards; the checking card counts this file's For review rows.
export const MATCH_ACCOUNTS = REVIEW_ACCOUNTS.map(account => ({
    ...account,
    reviewCount: account.id === MATCH_CONNECTION_ID ? FOR_REVIEW.length : account.reviewCount,
}))

export const MATCH_REFERENCE_TEXT = {
    refusal: 'Transfer 1007 is already matched to another bank transaction.',
    findSearch: 'lumen',
    findNoResultSearch: 'payroll',
} as const

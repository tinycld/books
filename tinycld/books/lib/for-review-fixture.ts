// Synthetic bank transactions for the helix reference route of the For review queue (the
// seed and the e2e book get their transactions from a real import, not from this file).
// Plain data, and it imports only types and other plain data, because the seed graph runs
// in plain node (tests/seed-node.test.ts). Amounts are signed integer minor units (cents):
// money in is positive. Accounts are the seeded e2e book's (lib/seed-accounts.ts), by number.
import type { BooksBankFiles, BooksBankImports, BooksBankTransactions } from '../types'
import { BANK_CURRENCY, BANK_USERS } from './bank-connection-fixture'

export const REVIEW_CURRENCY = BANK_CURRENCY

export const REVIEW_CONNECTION_IDS = {
    checking: 'revconnchecking',
    savings: 'revconnsavings0',
    card: 'revconncard0000',
} as const

const CONN = REVIEW_CONNECTION_IDS

// The account strip's cards. `reviewCount` is what the connections query adds.
export const REVIEW_ACCOUNTS = [
    {
        id: CONN.checking,
        accountNumber: '1000',
        accountName: 'Business Checking',
        accountType: 'bank',
        institution: 'First Community Bank',
        accountMask: '4821',
        debitTotal: 3_000_000,
        creditTotal: 581_945,
        waitingCount: 2,
        reviewCount: 34,
    },
    {
        id: CONN.savings,
        accountNumber: '1010',
        accountName: 'Business Savings',
        accountType: 'bank',
        institution: 'First Community Bank',
        accountMask: '7730',
        debitTotal: 6_000_000,
        creditTotal: 0,
        waitingCount: 1,
        reviewCount: 0,
    },
    {
        id: CONN.card,
        accountNumber: '2100',
        accountName: 'Company Card',
        accountType: 'credit_card',
        institution: 'Northwind Card Services',
        accountMask: '0937',
        debitTotal: 171_000,
        creditTotal: 512_017,
        waitingCount: 0,
        reviewCount: 0,
    },
] as const

export type ReviewAccount = (typeof REVIEW_ACCOUNTS)[number]

const FILE_IDS = {
    aug: 'revfilechk0aug0',
    sep: 'revfilechk0sep0',
    oct: 'revfilechk0oct0',
    nov: 'revfilechk0nov0',
    dec: 'revfilechk0dec0',
    savings: 'revfilesav0oct0',
    card: 'revfilecard0oct',
} as const

function contentHash(n: number): string {
    return n.toString(16).padStart(64, '0')
}

function file(
    seed: Pick<
        BooksBankFiles,
        'id' | 'connection' | 'name' | 'format' | 'size' | 'status' | 'uploaded_by' | 'created'
    >,
    n: number
): BooksBankFiles {
    return {
        file: `${seed.id}.bin`,
        content_hash: contentHash(n),
        statement_balance: 0,
        statement_date: '',
        updated: seed.created,
        ...seed,
    }
}

// Newest upload first. Checking has three imported files and two waiting; savings one
// waiting; the card one imported.
export const REVIEW_FILES = [
    file(
        {
            id: FILE_IDS.dec,
            connection: CONN.checking,
            name: 'checking-2026-11-partial.csv',
            format: 'csv',
            size: 8_704,
            status: 'uploaded',
            uploaded_by: BANK_USERS.ben.id,
            created: '2026-11-06 14:10:00.000Z',
        },
        15
    ),
    file(
        {
            id: FILE_IDS.nov,
            connection: CONN.checking,
            name: 'checking-2026-11.ofx',
            format: 'ofx',
            size: 19_456,
            status: 'uploaded',
            uploaded_by: BANK_USERS.ana.id,
            created: '2026-11-05 09:30:00.000Z',
        },
        14
    ),
    file(
        {
            id: FILE_IDS.oct,
            connection: CONN.checking,
            name: 'checking-2026-10.csv',
            format: 'csv',
            size: 49_152,
            status: 'imported',
            uploaded_by: BANK_USERS.ana.id,
            created: '2026-11-03 16:20:00.000Z',
        },
        13
    ),
    file(
        {
            id: FILE_IDS.sep,
            connection: CONN.checking,
            name: 'checking-2026-09.ofx',
            format: 'ofx',
            size: 22_528,
            status: 'imported',
            uploaded_by: BANK_USERS.ana.id,
            created: '2026-10-04 09:12:00.000Z',
        },
        12
    ),
    file(
        {
            id: FILE_IDS.aug,
            connection: CONN.checking,
            name: 'checking-2026-08.csv',
            format: 'csv',
            size: 41_984,
            status: 'imported',
            uploaded_by: BANK_USERS.ben.id,
            created: '2026-09-03 08:40:00.000Z',
        },
        11
    ),
    file(
        {
            id: FILE_IDS.savings,
            connection: CONN.savings,
            name: 'savings-2026-10.csv',
            format: 'csv',
            size: 3_072,
            status: 'uploaded',
            uploaded_by: BANK_USERS.ana.id,
            created: '2026-11-03 16:24:00.000Z',
        },
        16
    ),
    file(
        {
            id: FILE_IDS.card,
            connection: CONN.card,
            name: 'company-card-2026-10.ofx',
            format: 'ofx',
            size: 12_288,
            status: 'imported',
            uploaded_by: BANK_USERS.ben.id,
            created: '2026-11-04 11:02:00.000Z',
        },
        17
    ),
] satisfies BooksBankFiles[]

// The importer and the time of each import; the drawer's "Imported" line reads them.
export const REVIEW_IMPORTS = [
    { id: 'revimpchk0aug00', file: FILE_IDS.aug, created_by: BANK_USERS.ben.id },
    { id: 'revimpchk0sep00', file: FILE_IDS.sep, created_by: BANK_USERS.ana.id },
    { id: 'revimpchk0oct00', file: FILE_IDS.oct, created_by: BANK_USERS.ana.id },
    { id: 'revimpcard0oct0', file: FILE_IDS.card, created_by: BANK_USERS.ben.id },
].map(seed => {
    const created = REVIEW_FILES.find(f => f.id === seed.file)?.created ?? ''
    return { ...seed, created: created.replace(':00.000Z', ':45.000Z') }
}) satisfies Pick<BooksBankImports, 'id' | 'file' | 'created_by' | 'created'>[]

export const REVIEW_USERS = [BANK_USERS.ana, BANK_USERS.ben]

// 70 characters, so a row must truncate it on one line and the drawer must wrap it.
export const REVIEW_LONG_DESCRIPTION =
    'ACH DEBIT NORTHWIND CARD SERVICES AUTOPAY PPD ID 9100042271 REF 882134'

type Status = BooksBankTransactions['status']

// [date, description, cents, memo, check number]
type Line = readonly [string, string, number, string?, string?]

const IMPORT_OF_FILE: Record<string, string> = {
    [FILE_IDS.aug]: 'revimpchk0aug00',
    [FILE_IDS.sep]: 'revimpchk0sep00',
    [FILE_IDS.oct]: 'revimpchk0oct00',
    [FILE_IDS.card]: 'revimpcard0oct0',
}

let serial = 0

function txns(
    connection: string,
    fileId: string,
    status: Status,
    firstLine: number,
    lines: readonly Line[]
): BooksBankTransactions[] {
    return lines.map(([date, description, amount, memo = '', checkNumber = ''], index) => {
        serial += 1
        const id = `revtxn${serial.toString().padStart(9, '0')}`
        return {
            id,
            connection,
            file: fileId,
            bank_import: IMPORT_OF_FILE[fileId] ?? '',
            line: firstLine + index,
            date,
            description,
            memo,
            amount,
            fitid: '',
            check_number: checkNumber,
            dedupe_hash: contentHash(1000 + serial),
            status,
            created: `${date} 12:00:00.000Z`,
            updated: `${date} 12:00:00.000Z`,
        }
    })
}

// 1000 Business Checking, For review: 7 in August, 10 in September, 17 in October.
const CHECKING_REVIEW = [
    ...txns(CONN.checking, FILE_IDS.aug, 'for_review', 2, [
        ['2026-08-03', 'Deposit - Harbor Design client payment', 425_000, 'INV-1041'],
        ['2026-08-06', 'Card purchase - Office Depot #2231', -8_647],
        ['2026-08-11', 'Check 1038', -120_000, 'August rent - Suite 400', '1038'],
        ['2026-08-14', 'Zelle from Lumen Labs', 187_500],
        ['2026-08-19', 'Card purchase - Adobe Creative Cloud', -5_999],
        ['2026-08-25', 'ACH - Gusto payroll', -1_284_310, 'Payroll Aug 15-31'],
        ['2026-08-31', 'Monthly service fee', -1_200],
    ]),
    ...txns(CONN.checking, FILE_IDS.sep, 'for_review', 1, [
        ['2026-09-02', 'Deposit - Harbor Design client payment', 310_000],
        ['2026-09-04', 'Card purchase - Staples 0419', -12_583],
        ['2026-09-08', 'Check 1043', -20_000, 'Window cleaning, Q3', '1043'],
        ['2026-09-09', REVIEW_LONG_DESCRIPTION, -120_000],
        ['2026-09-12', 'Card purchase - Uber trip', -2_814],
        ['2026-09-15', 'Transfer to savings', -50_000],
        ['2026-09-18', 'Deposit - Brightline Studio', 96_000, 'INV-1047 partial'],
        ['2026-09-22', 'Card purchase - Office Depot #2231', -4_312],
        ['2026-09-26', 'Interest payment', 418],
        ['2026-09-30', 'Monthly service fee', -1_200],
    ]),
    ...txns(CONN.checking, FILE_IDS.oct, 'for_review', 1, [
        ['2026-10-01', 'Deposit - Harbor Design client payment', 310_000],
        ['2026-10-02', 'Card purchase - Office Depot #2231', -8_647],
        ['2026-10-03', 'ACH - Comcast Business', -18_995],
        ['2026-10-06', 'Check 1047', -45_000, 'Sign installation deposit', '1047'],
        ['2026-10-07', 'Card purchase - Shell Oil 57442', -6_418],
        ['2026-10-08', 'Zelle from Lumen Labs', 224_000],
        ['2026-10-09', 'Card purchase - Home Depot 4410', -21_976],
        ['2026-10-12', 'ACH - Gusto payroll', -1_284_310, 'Payroll Oct 1-15'],
        ['2026-10-14', 'Card purchase - Amazon Marketplace', -3_455],
        ['2026-10-15', 'Transfer to savings', -50_000],
        ['2026-10-16', 'Deposit - Cedar & Pine LLC', 125_000],
        ['2026-10-20', 'Card purchase - FedEx Office 1182', -1_960],
        ['2026-10-21', 'Check 1049', -8_000, '', '1049'],
        ['2026-10-23', 'Card purchase - Zoom.us', -1_499],
        ['2026-10-27', 'Check 1050', -36_240, 'Hartwell Insurance, policy BOP-22871', '1050'],
        ['2026-10-29', 'Card purchase - Office Depot #2231', -20_000],
        ['2026-10-31', 'Monthly service fee', -1_200],
    ]),
]

const CHECKING_REVIEWED = txns(CONN.checking, FILE_IDS.aug, 'reviewed', 9, [
    ['2026-08-28', 'Deposit - Brightline Studio', 150_000],
    ['2026-08-29', 'Card purchase - Staples 0419', -3_120],
    ['2026-08-30', 'ACH - Comcast Business', -18_995],
    ['2026-09-01', 'Transfer to savings', -50_000],
    ['2026-09-01', 'Card purchase - Shell Oil 57442', -5_204],
    ['2026-09-01', 'Zelle from Lumen Labs', 60_000],
])

const CHECKING_EXCLUDED = txns(CONN.checking, FILE_IDS.oct, 'excluded', 18, [
    ['2026-10-30', 'Card purchase - Netflix.com', -1_549, 'Personal - not a business cost'],
    ['2026-10-22', 'Zelle to Marco Ruiz', -20_000],
    ['2026-10-13', 'Card purchase - Office Depot #2231', 8_647, 'Refund of duplicate charge'],
    ['2026-10-05', 'Card purchase - Trader Joes 118', -6_731],
])

const CARD_REVIEWED = txns(CONN.card, FILE_IDS.card, 'reviewed', 1, [
    ['2026-10-04', 'Payment - thank you', 120_000],
    ['2026-10-11', 'Delta Air Lines 0062', -48_210],
    ['2026-10-18', 'Hilton Garden Inn Austin', -31_644],
])

function newestFirst(rows: BooksBankTransactions[]): BooksBankTransactions[] {
    return [...rows].sort((a, b) => b.date.localeCompare(a.date) || a.line - b.line)
}

export const REVIEW_TRANSACTIONS = [
    ...CHECKING_REVIEW,
    ...CHECKING_REVIEWED,
    ...CHECKING_EXCLUDED,
    ...CARD_REVIEWED,
] satisfies BooksBankTransactions[]

// Each list as the screen orders it: newest first, then file line.
export const FOR_REVIEW_ROWS = newestFirst(CHECKING_REVIEW)
export const FOR_REVIEW_OLDEST_FIRST = [...FOR_REVIEW_ROWS].reverse()
export const REVIEWED_ROWS = newestFirst(CHECKING_REVIEWED)
export const EXCLUDED_ROWS = newestFirst(CHECKING_EXCLUDED)
export const CARD_REVIEWED_ROWS = newestFirst(CARD_REVIEWED)

function idOf(date: string, amount: number): string {
    return CHECKING_REVIEW.find(row => row.date === date && row.amount === amount)?.id ?? ''
}

// Three money-out rows whose sum is $412.30: the selection bar's example.
export const CHOSEN_IDS = [
    idOf('2026-10-02', -8_647),
    idOf('2026-09-04', -12_583),
    idOf('2026-10-29', -20_000),
]

// The row the drawer shows: a check with a memo, high enough in the list that its open
// highlight is on screen.
export const DRAWER_TXN_ID = idOf('2026-10-27', -36_240)
export const DRAWER_LONG_TXN_ID = idOf('2026-09-09', -120_000)

// After "Exclude" on the chosen three, the rows that stay.
export const AFTER_EXCLUDE_ROWS = FOR_REVIEW_ROWS.filter(row => !CHOSEN_IDS.includes(row.id))

// Two of the three chosen rows failed: they stay chosen and in the list.
export const FAILED_IDS = CHOSEN_IDS.slice(0, 2)
export const AFTER_PARTIAL_ROWS = FOR_REVIEW_ROWS.filter(row => row.id !== CHOSEN_IDS[2])

// The search "office depot" with Type "Money out": what the filtered list shows.
export const FILTERED_SEARCH = 'office depot'
export const FILTERED_ROWS = FOR_REVIEW_ROWS.filter(
    row => row.description.toLowerCase().includes(FILTERED_SEARCH) && row.amount < 0
)

export const REVIEW_REFERENCE_TEXT = {
    excluded: 'Excluded 3 transactions.',
    partial: '2 of 3 transactions could not be excluded. Try again.',
    refusedSearch: 'zelle to marco',
} as const

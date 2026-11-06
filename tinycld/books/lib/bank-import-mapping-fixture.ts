// Synthetic bank files, their contents and their imports for the helix reference route of
// the bank import page, the seed and tests. Plain data, and it imports only types and other
// plain fixtures, because the seed graph runs in plain node (tests/seed-node.test.ts).
// Amounts are integer minor units (cents). Contents rows are what the parser stores in
// books_bank_file_contents.rows: one { line, cells } per non-blank line, counted from 1.
import type { BooksBankFileContents, BooksBankFiles, BooksBankImports } from '../types'
import { BANK_CONNECTION_IDS, BANK_USERS } from './bank-connection-fixture'

type ContentRow = { line: number; cells: string[] }

const STAMP = '2026-11-05 14:00:00.000Z'

export const BANK_IMPORT_FILE_IDS = {
    checkingCsv: 'bankimpfilecsv1',
    checkingOfx: 'bankimpfileofx1',
    headerOnly: 'bankimpfilehdr1',
    cardCsv: 'bankimpfilecrd1',
    cardOfx: 'bankimpfilecrd2',
    newUpload: 'bankimpfilenew1',
} as const

const FILES = BANK_IMPORT_FILE_IDS

// 70 characters, so a description cell must truncate it on one line.
export const BANK_IMPORT_LONG_PAYEE =
    'SQ *BLUE BOTTLE COFFEE OAKLAND CA 10/06 PURCHASE DEBIT CARD 4821 REF 8'

// The two-amount-column CSV: Posted Date, Payee, Debit, Credit, Balance. Each entry is
// [date, payee, money out, money in]. Line 14 and line 27 carry dates the MM/DD/YYYY
// format cannot read; line 19 has both money in and money out.
const CHECKING_ENTRIES: [string, string, string, string][] = [
    ['10/01/2026', 'Harbor Design – client payment', '', '3,100.00'],
    ['10/01/2026', 'Office Depot #1182 Portland OR', '64.20', ''],
    ['10/02/2026', 'Northwind Card Services payment', '1,200.00', ''],
    ['10/02/2026', 'Transfer to savings', '500.00', ''],
    ['10/03/2026', 'Pacific Gas & Electric', '212.48', ''],
    ['10/05/2026', 'Lumen Labs – client payment', '', '2,240.00'],
    ['10/05/2026', BANK_IMPORT_LONG_PAYEE, '18.40', ''],
    ['10/06/2026', 'Gusto payroll – Oct 1–15', '4,815.32', ''],
    ['10/06/2026', 'Adobe Creative Cloud', '59.99', ''],
    ['10/07/2026', 'Mobile deposit – check 1047', '', '850.00'],
    ['10/08/2026', 'Comcast Business', '149.95', ''],
    ['10/08/2026', 'Uber trip', '23.17', ''],
    ['13/45/2026', 'Staples #0221', '42.00', ''],
    ['10/09/2026', 'Harbor Design – retainer', '', '1,500.00'],
    ['10/12/2026', 'WeWork membership', '450.00', ''],
    ['10/12/2026', 'Shell Oil 57442', '61.30', ''],
    ['10/13/2026', 'Stripe payout', '', '1,287.44'],
    ['10/13/2026', 'Refund and fee – Office Depot', '25.00', '25.00'],
    ['10/14/2026', 'Amazon Web Services', '312.07', ''],
    ['10/15/2026', 'Transfer to savings', '500.00', ''],
    ['10/15/2026', 'Lumen Labs – client payment', '', '1,875.00'],
    ['10/16/2026', 'Zoom Video Communications', '15.99', ''],
    ['10/19/2026', 'Delta Air Lines', '386.40', ''],
    ['10/19/2026', 'Marriott Portland Downtown', '248.16', ''],
    ['10/20/2026', 'Stripe payout', '', '942.10'],
    ['Pending', 'Hertz car rental', '133.52', ''],
    ['10/21/2026', 'Gusto payroll – Oct 16–31', '4,815.32', ''],
    ['10/21/2026', 'IRS EFTPS federal tax payment', '1,630.00', ''],
    ['10/22/2026', 'Mobile deposit – check 1052', '', '600.00'],
    ['10/23/2026', 'Costco Wholesale #118', '187.63', ''],
    ['10/23/2026', 'Google Workspace', '72.00', ''],
    ['10/26/2026', 'Harbor Design – client payment', '', '3,100.00'],
    ['10/26/2026', 'FedEx Office', '34.85', ''],
    ['10/27/2026', 'Verizon Wireless', '96.40', ''],
    ['10/28/2026', 'Northwind Card Services payment', '2,000.00', ''],
    ['10/28/2026', 'Interest paid', '', '4.12'],
    ['10/29/2026', 'Stripe payout', '', '1,102.38'],
    ['10/30/2026', 'State Farm insurance', '184.00', ''],
    ['10/30/2026', 'Portland Water Bureau', '58.21', ''],
    ['10/31/2026', 'Monthly service fee', '12.00', ''],
]

const OPENING_BALANCE_CENTS = 900_000

function cents(text: string): number {
    if (text === '') return 0
    return Math.round(Number(text.replaceAll(',', '')) * 100)
}

function amountText(value: number): string {
    return (value / 100).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
}

// The Balance column runs from the opening balance; the bank writes it on every row.
function checkingRows(): ContentRow[] {
    let balance = OPENING_BALANCE_CENTS
    const body = CHECKING_ENTRIES.map(([date, payee, out, into], i) => {
        balance += cents(into) - cents(out)
        return { line: i + 2, cells: [date, payee, out, into, amountText(balance)] }
    })
    return [{ line: 1, cells: ['Posted Date', 'Payee', 'Debit', 'Credit', 'Balance'] }, ...body]
}

export const BANK_IMPORT_CHECKING_ROWS = checkingRows()

// Lines of the checking CSV the parser cannot read with the guessed mapping.
export const BANK_IMPORT_ERROR_LINES = [14, 19, 27] as const

// One OFX file of 12 rows: Date, Description, Memo, Amount, Transaction ID, Check
// number, Type (OFX_COLUMNS). Line 9 is a check.
const OFX_ENTRIES: [string, string, string, string, string][] = [
    ['2026-10-01', 'HARBOR DESIGN LLC', 'ACH CREDIT INV 1043', '3100.00', ''],
    ['2026-10-02', 'OFFICE DEPOT 1182', 'POS PURCHASE PORTLAND OR', '-64.20', ''],
    ['2026-10-02', 'NORTHWIND CARD SVCS', 'ONLINE PMT THANK YOU', '-1200.00', ''],
    ['2026-10-05', 'LUMEN LABS INC', 'ACH CREDIT INV 1044', '2240.00', ''],
    ['2026-10-06', 'GUSTO', 'PAYROLL 10/01-10/15', '-4815.32', ''],
    ['2026-10-08', 'COMCAST BUSINESS', 'AUTOPAY 8821-3307', '-149.95', ''],
    ['2026-10-13', 'STRIPE TRANSFER', 'PAYOUT ST-8F2KQ1', '1287.44', ''],
    ['2026-10-15', 'TRANSFER TO SAVINGS', 'ONLINE TRANSFER REF 552019', '-500.00', ''],
    ['2026-10-19', 'CHECK 1048', 'CHECK PAID', '-725.00', '1048'],
    ['2026-10-21', 'GUSTO', 'PAYROLL 10/16-10/31', '-4815.32', ''],
    ['2026-10-26', 'HARBOR DESIGN LLC', 'ACH CREDIT INV 1051', '3100.00', ''],
    ['2026-10-31', 'MONTHLY SERVICE FEE', 'ACCOUNT ANALYSIS FEE', '-12.00', ''],
]

export const BANK_IMPORT_OFX_ROWS: ContentRow[] = OFX_ENTRIES.map(
    ([date, name, memo, amount, check], i) => ({
        line: i + 1,
        cells: [
            date,
            name,
            memo,
            amount,
            `2026103${String(i + 1).padStart(4, '0')}`,
            check,
            amount.startsWith('-') ? 'DEBIT' : 'CREDIT',
        ],
    })
)

// A card export with no header and one signed amount column, charges positive.
export const BANK_IMPORT_CARD_ROWS: ContentRow[] = [
    ['10/02/2026', 'AMAZON MKTPLACE PMTS', '86.47'],
    ['10/04/2026', 'UNITED AIRLINES', '412.80'],
    ['10/07/2026', 'PAYMENT THANK YOU', '-1,200.00'],
    ['10/11/2026', 'HOME DEPOT 4021', '129.06'],
    ['10/15/2026', 'SLACK TECHNOLOGIES', '87.50'],
    ['10/18/2026', 'HILTON GARDEN INN SEATTLE', '318.22'],
    ['10/22/2026', 'CHEVRON 0091355', '58.40'],
    ['10/27/2026', 'AMAZON MKTPLACE PMTS', '33.19'],
].map((cells, i) => ({ line: i + 1, cells }))

export const BANK_IMPORT_HEADER_ONLY_ROWS: ContentRow[] = [
    { line: 1, cells: ['Posted Date', 'Payee', 'Debit', 'Credit', 'Balance'] },
]

function contents(id: string, file: string, rows: ContentRow[]): BooksBankFileContents {
    return {
        id,
        file,
        columns: Math.max(...rows.map(row => row.cells.length)),
        rows,
        created: STAMP,
        updated: STAMP,
    }
}

export const BANK_IMPORT_CONTENTS = [
    contents('bankimpcntcsv01', FILES.checkingCsv, BANK_IMPORT_CHECKING_ROWS),
    contents('bankimpcntofx01', FILES.checkingOfx, BANK_IMPORT_OFX_ROWS),
    contents('bankimpcnthdr01', FILES.headerOnly, BANK_IMPORT_HEADER_ONLY_ROWS),
    contents('bankimpcntcrd01', FILES.cardCsv, BANK_IMPORT_CARD_ROWS),
] satisfies BooksBankFileContents[]

function bankFile(
    seed: Pick<BooksBankFiles, 'id' | 'connection' | 'name' | 'format' | 'size' | 'created'> &
        Partial<Pick<BooksBankFiles, 'status' | 'statement_balance' | 'statement_date'>>
): BooksBankFiles {
    return {
        file: `${seed.id}.bin`,
        content_hash: seed.id.padStart(64, '0'),
        status: 'uploaded',
        uploaded_by: BANK_USERS.ana.id,
        statement_balance: 0,
        statement_date: '',
        updated: seed.created,
        ...seed,
    }
}

// Newest upload first, the Banking files list order. The two OFX files carry the
// statements the account cards show: checking $10,423.17 on Oct 31, the card -$3,410.17
// (owed) on Oct 28.
export const BANK_IMPORT_FILES = [
    bankFile({
        id: FILES.newUpload,
        connection: BANK_CONNECTION_IDS.checking,
        name: 'checking-2026-11-week1.csv',
        format: 'csv',
        size: 6_144,
        created: '2026-11-06 09:30:00.000Z',
    }),
    bankFile({
        id: FILES.headerOnly,
        connection: BANK_CONNECTION_IDS.checking,
        name: 'checking-2026-11-pending.csv',
        format: 'csv',
        size: 48,
        created: '2026-11-05 17:02:00.000Z',
    }),
    bankFile({
        id: FILES.checkingCsv,
        connection: BANK_CONNECTION_IDS.checking,
        name: 'checking-2026-10.csv',
        format: 'csv',
        size: 3_420,
        status: 'imported',
        created: '2026-11-03 16:20:00.000Z',
    }),
    bankFile({
        id: FILES.checkingOfx,
        connection: BANK_CONNECTION_IDS.checking,
        name: 'checking-2026-10.ofx',
        format: 'ofx',
        size: 9_216,
        status: 'imported',
        statement_balance: 1_042_317,
        statement_date: '2026-10-31',
        created: '2026-11-02 10:05:00.000Z',
    }),
    bankFile({
        id: FILES.cardCsv,
        connection: BANK_CONNECTION_IDS.card,
        name: 'card-2026-10.csv',
        format: 'csv',
        size: 512,
        status: 'imported',
        created: '2026-11-01 11:40:00.000Z',
    }),
    bankFile({
        id: FILES.cardOfx,
        connection: BANK_CONNECTION_IDS.card,
        name: 'card-2026-10.ofx',
        format: 'ofx',
        size: 14_336,
        statement_balance: -341_017,
        statement_date: '2026-10-28',
        created: '2026-10-30 08:15:00.000Z',
    }),
] satisfies BooksBankFiles[]

// The mapping Books guesses for the checking CSV: header Yes, two amount columns.
export const BANK_IMPORT_GUESSED_MAPPING = {
    header_row: true,
    date_column: 1,
    date_format: 'MM/DD/YYYY',
    description_column: 2,
    amount_columns: 'two',
    amount_column: 0,
    money_in_column: 4,
    money_out_column: 3,
    amount_sign: 'in_positive',
} satisfies Partial<BooksBankImports>

// The card CSV's mapping: no header, one amount column whose positive amounts are charges.
export const BANK_IMPORT_CARD_MAPPING = {
    header_row: false,
    date_column: 1,
    date_format: 'MM/DD/YYYY',
    description_column: 2,
    amount_columns: 'one',
    amount_column: 3,
    money_in_column: 0,
    money_out_column: 0,
    amount_sign: 'out_positive',
} satisfies Partial<BooksBankImports>

function bankImport(
    seed: Pick<BooksBankImports, 'id' | 'file' | 'lines' | 'imported' | 'duplicates' | 'created'>,
    mapping: Omit<
        BooksBankImports,
        'id' | 'file' | 'lines' | 'imported' | 'duplicates' | 'created_by' | 'created' | 'updated'
    >
): BooksBankImports {
    return { created_by: BANK_USERS.ana.id, updated: seed.created, ...mapping, ...seed }
}

const OFX_IMPORT_MAPPING = {
    header_row: false,
    date_column: 0,
    date_format: '',
    description_column: 0,
    amount_columns: '',
    amount_column: 0,
    money_in_column: 0,
    money_out_column: 0,
    amount_sign: '',
} satisfies Partial<BooksBankImports>

function lineRange(first: number, last: number): number[] {
    return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}

// Earlier imports. The first six lines of the checking CSV were imported on Nov 4.
export const BANK_IMPORT_EARLIER = [
    bankImport(
        {
            id: 'bankimprtcsv001',
            file: FILES.checkingCsv,
            lines: lineRange(2, 7),
            imported: 6,
            duplicates: 0,
            created: '2026-11-04 10:00:00.000Z',
        },
        BANK_IMPORT_GUESSED_MAPPING
    ),
    bankImport(
        {
            id: 'bankimprtofx001',
            file: FILES.checkingOfx,
            lines: lineRange(1, 12),
            imported: 12,
            duplicates: 0,
            created: '2026-11-02 10:07:00.000Z',
        },
        OFX_IMPORT_MAPPING
    ),
    bankImport(
        {
            id: 'bankimprtcrd001',
            file: FILES.cardCsv,
            lines: lineRange(1, 8),
            imported: 8,
            duplicates: 0,
            created: '2026-11-01 11:42:00.000Z',
        },
        BANK_IMPORT_CARD_MAPPING
    ),
] satisfies BooksBankImports[]

// Lines of the checking CSV the person leaves unchosen in the reference.
export const BANK_IMPORT_UNCHOSEN_LINES = [24] as const

// What the server stamps on the import of the remaining checking CSV rows, and on an
// import whose every chosen row was already in Books from another file.
export const BANK_IMPORT_RESULTS = {
    partial: { imported: 28, duplicates: 2 },
    allDuplicates: { imported: 0, duplicates: 4 },
} as const

// Texts the reference states show.
export const BANK_IMPORT_REFERENCE_TEXT = {
    refusal: 'Line 14: "13/45/2026" is not a date in the MM/DD/YYYY format.',
    transport: 'The import could not be sent. Check your connection and try again.',
} as const

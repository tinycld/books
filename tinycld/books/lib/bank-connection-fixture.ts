// Synthetic bank connections and bank files for the helix reference route, the seed and tests.
// Plain data, and it imports only types, because the seed graph runs in plain node
// (tests/seed-node.test.ts). Amounts are integer minor units (cents); sizes are bytes.
// Accounts are the seeded e2e book's (lib/seed-accounts.ts), by number.
//
// BankConnectionRecord and BankFileRecord mirror the spec's Data section until the
// collections exist: checkpoint 1 (the books_banking migration) replaces both with the
// generated BooksBankConnections / BooksBankFiles and types every row with `satisfies`.
import type { BooksAccounts } from '../types'

export interface BankConnectionRecord {
    id: string
    account: string
    institution: string
    account_mask: string
    created_by: string
    created: string
    updated: string
}

export interface BankFileRecord {
    id: string
    connection: string
    file: string
    name: string
    format: 'csv' | 'ofx'
    size: number
    content_hash: string
    status: 'uploaded' | 'imported' | 'failed'
    uploaded_by: string
    created: string
    updated: string
}

export const BANK_CURRENCY = 'USD'

const STAMP = '2026-01-05 09:00:00.000Z'

export const BANK_USERS = {
    ana: { id: 'bankuseranaruiz', name: 'Ana Ruiz' },
    ben: { id: 'bankuserbenokaf', name: 'Ben Okafor' },
} as const

export const BANK_ACCOUNT_IDS = {
    checking: 'acct_checking',
    savings: 'acct_savings',
    card: 'acct_card',
    rent: 'acct_rent',
} as const

const ACCOUNTS = BANK_ACCOUNT_IDS

function account(
    seed: Pick<BooksAccounts, 'id' | 'name' | 'number' | 'type' | 'detail_type'>
): BooksAccounts {
    return {
        description: '',
        inactive: false,
        currency: BANK_CURRENCY,
        form_1099_box: '',
        created: STAMP,
        updated: STAMP,
        parent: '',
        ...seed,
    }
}

// The seeded chart's bank and credit card accounts, and one expense account that the
// Connect picker must not offer.
export const BANK_ACCOUNTS = [
    account({
        id: ACCOUNTS.checking,
        name: 'Business Checking',
        number: '1000',
        type: 'bank',
        detail_type: 'checking',
    }),
    account({
        id: ACCOUNTS.savings,
        name: 'Business Savings',
        number: '1010',
        type: 'bank',
        detail_type: 'savings',
    }),
    account({
        id: ACCOUNTS.card,
        name: 'Company Card',
        number: '2100',
        type: 'credit_card',
        detail_type: 'credit_card',
    }),
    account({
        id: ACCOUNTS.rent,
        name: 'Rent',
        number: '6100',
        type: 'expense',
        detail_type: 'rent_lease',
    }),
] satisfies BooksAccounts[]

// Posted totals per account. Checking owns $24,180.55; the card owes $3,410.17 (credit
// normal, so it reads positive); savings owns $60,000.00.
export const BANK_ACCOUNT_TOTALS: Record<string, { debit_total: number; credit_total: number }> = {
    [ACCOUNTS.checking]: { debit_total: 3_000_000, credit_total: 581_945 },
    [ACCOUNTS.savings]: { debit_total: 6_000_000, credit_total: 0 },
    [ACCOUNTS.card]: { debit_total: 171_000, credit_total: 512_017 },
    [ACCOUNTS.rent]: { debit_total: 240_000, credit_total: 0 },
}

export const BANK_CONNECTION_IDS = {
    checking: 'bankconncheckng',
    card: 'bankconncard000',
} as const

export const BANK_CONNECTIONS = [
    {
        id: BANK_CONNECTION_IDS.checking,
        account: ACCOUNTS.checking,
        institution: 'First Community Bank',
        account_mask: '4821',
        created_by: BANK_USERS.ana.id,
        created: '2026-09-01 15:04:00.000Z',
        updated: '2026-09-01 15:04:00.000Z',
    },
    {
        id: BANK_CONNECTION_IDS.card,
        account: ACCOUNTS.card,
        institution: 'Northwind Card Services',
        account_mask: '0937',
        created_by: BANK_USERS.ana.id,
        created: '2026-09-01 15:06:00.000Z',
        updated: '2026-09-01 15:06:00.000Z',
    },
] satisfies BankConnectionRecord[]

// 60 characters, so a file row must truncate it on one line.
export const BANK_LONG_FILE_NAME = 'First Community Bank - Business Checking - Oct 2026 stmt.qfx'

function contentHash(n: number): string {
    return n.toString(16).padStart(64, '0')
}

function bankFile(
    seed: Pick<BankFileRecord, 'id' | 'name' | 'format' | 'size' | 'uploaded_by' | 'created'>,
    n: number
): BankFileRecord {
    return {
        connection: BANK_CONNECTION_IDS.checking,
        file: `${seed.id}.bin`,
        content_hash: contentHash(n),
        status: 'uploaded',
        updated: seed.created,
        ...seed,
    }
}

// Newest upload first, the files list order. All on checking; the card has none.
export const BANK_FILES = [
    bankFile(
        {
            id: 'bankfilechk0004',
            name: 'checking-2026-10.csv',
            format: 'csv',
            size: 49_152,
            uploaded_by: BANK_USERS.ana.id,
            created: '2026-11-03 16:20:00.000Z',
        },
        4
    ),
    bankFile(
        {
            id: 'bankfilechk0003',
            name: BANK_LONG_FILE_NAME,
            format: 'ofx',
            size: 1_258_291,
            uploaded_by: BANK_USERS.ben.id,
            created: '2026-11-02 10:05:00.000Z',
        },
        3
    ),
    bankFile(
        {
            id: 'bankfilechk0002',
            name: 'checking-2026-09.ofx',
            format: 'ofx',
            size: 22_528,
            uploaded_by: BANK_USERS.ana.id,
            created: '2026-10-04 09:12:00.000Z',
        },
        2
    ),
    bankFile(
        {
            id: 'bankfilechk0001',
            name: 'checking-2026-08.csv',
            format: 'csv',
            size: 41_984,
            uploaded_by: BANK_USERS.ben.id,
            created: '2026-09-03 08:40:00.000Z',
        },
        1
    ),
] satisfies BankFileRecord[]

// What a statement export looks like: six rows each, dated after mid-2026.
export const BANK_CSV_SAMPLE = [
    'Date,Description,Amount',
    '2026-09-02,Deposit - Harbor Design client payment,4250.00',
    '2026-09-05,Card purchase - Office Depot,-86.47',
    '2026-09-09,ACH - Northwind Card Services payment,-1200.00',
    '2026-09-15,Transfer to savings,-500.00',
    '2026-09-22,Deposit - Lumen Labs client payment,1875.00',
    '2026-09-30,Monthly service fee,-12.00',
    '',
].join('\n')

function ofxTransaction(day: string, amount: string, name: string, id: number): string {
    const type = amount.startsWith('-') ? 'DEBIT' : 'CREDIT'
    return [
        '<STMTTRN>',
        `<TRNTYPE>${type}`,
        `<DTPOSTED>${day.replaceAll('-', '')}`,
        `<TRNAMT>${amount}`,
        `<FITID>2026${id.toString().padStart(6, '0')}`,
        `<NAME>${name}`,
        '</STMTTRN>',
    ].join('\n')
}

export const BANK_OFX_SAMPLE = [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    'VERSION:102',
    '',
    '<OFX>',
    '<BANKMSGSRSV1><STMTTRNRS><STMTRS>',
    '<CURDEF>USD',
    '<BANKTRANLIST>',
    ofxTransaction('2026-10-01', '3100.00', 'Harbor Design', 1),
    ofxTransaction('2026-10-04', '-64.20', 'Office Depot', 2),
    ofxTransaction('2026-10-09', '-1200.00', 'Northwind Card Services', 3),
    ofxTransaction('2026-10-15', '-500.00', 'Transfer to savings', 4),
    ofxTransaction('2026-10-21', '2240.00', 'Lumen Labs', 5),
    ofxTransaction('2026-10-31', '-12.00', 'Monthly service fee', 6),
    '</BANKTRANLIST>',
    '</STMTRS></STMTTRNRS></BANKMSGSRSV1>',
    '</OFX>',
    '',
].join('\n')

// The one file the seed uploads to 1000 Business Checking.
export const BANK_SEED_FILE = { name: 'checking-2026-09.csv', text: BANK_CSV_SAMPLE } as const

// Texts the reference states show.
export const BANK_REFERENCE_TEXT = {
    uploadingName: 'checking-2026-11.csv',
    duplicate:
        'checking-2026-10.csv was already uploaded to 1000 Business Checking on Nov 3, 2026.',
} as const

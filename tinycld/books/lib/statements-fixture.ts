// Synthetic customer statements for the seed (seed.ts) and the helix reference route
// (statements spec §3, §4). A plain data module: no React, no PocketBase.
//
// `StatementRecord` is the generated `BooksStatements` row
// (pb-migrations/2100000033_create_books_statements.js). `StatementRecipient` is the
// shape of the recipients read (§4.1); the build takes that type from its live query, not
// from here.

import type { BooksStatements } from '../types'
import { CUSTOMER_IDS, CUSTOMERS } from './customer-form-fixture'
import {
    STATEMENT_BALANCE_LABELS,
    STATEMENT_TYPE_LABELS,
    type StatementBalanceFilter,
    type StatementType,
} from './statement-texts'

export type { StatementBalanceFilter, StatementType }
export { STATEMENT_BALANCE_LABELS, STATEMENT_TYPE_LABELS }

// Spec §4.2. Money is integer cents; a day is `YYYY-MM-DD`; `start_date` and `end_date`
// are empty on an open-items statement; `sent_at` and `sent_to` are empty until a send.
export type StatementRecord = BooksStatements

// What a client sends on create (§4.5): the server sets the number, the sequence, the
// balance, the currency and the sent fields.
export type StatementInsert = Pick<
    StatementRecord,
    'customer' | 'type' | 'statement_date' | 'start_date' | 'end_date' | 'email'
>

export const STATEMENT_CURRENCY = 'USD'

const ASPEN = 'cust_aspen_0001'
const BLUEFIN = 'cust_bluef_0001'
const CEDAR = 'cust_cedar_0001'
const CHEN = 'cust_chen_00001'
const DELTA = 'cust_delta_0001'
const JUNIPER = 'cust_juni_00001'
const OBRIEN = 'cust_obrn_00001'

function customerOf(id: string) {
    const found = CUSTOMERS.find(row => row.id === id)
    if (!found) throw new Error(`statements fixture: no customer ${id}`)
    return found
}

// ── Seed (spec §4.7): two saved, unsent statements of one seeded customer with an open
// invoice (Harborview Kitchen: CUSTOMER_BALANCE_SEED.kitchenInvoice, 2026-10-27). ──

export const STATEMENT_SEED: StatementInsert[] = [
    {
        customer: CUSTOMER_IDS.harborviewKitchen,
        type: 'balance_forward',
        statement_date: '2026-10-31',
        start_date: '2026-10-01',
        end_date: '2026-10-31',
        email: customerOf(CUSTOMER_IDS.harborviewKitchen).email,
    },
    {
        customer: CUSTOMER_IDS.harborviewKitchen,
        type: 'open_items',
        statement_date: '2026-10-31',
        start_date: '',
        end_date: '',
        email: customerOf(CUSTOMER_IDS.harborviewKitchen).email,
    },
]

// ── The customer's Statements tab (§3.7): newest statement date first, then newest
// created first. Sent and not sent, both types, a long address, a zero and a credit
// amount, and a number with an admin's own long prefix. ──

export const STATEMENT_TAB_CUSTOMER = {
    id: ASPEN,
    name: customerOf(ASPEN).display_name,
    email: customerOf(ASPEN).email,
}

const LONG_ADDRESS = 'accounts-payable.regional-office@aspenridgedental-management-group.example'

function statement(
    seed: Pick<StatementRecord, 'id' | 'number' | 'sequence' | 'type' | 'statement_date'> &
        Partial<StatementRecord>
): StatementRecord {
    return {
        customer: ASPEN,
        start_date: '',
        end_date: '',
        email: STATEMENT_TAB_CUSTOMER.email,
        balance: 0,
        currency: STATEMENT_CURRENCY,
        sent_at: '',
        sent_to: '',
        created: `${seed.statement_date} 17:05:00.000Z`,
        updated: `${seed.statement_date} 17:05:00.000Z`,
        ...seed,
    }
}

export const STATEMENTS = [
    statement({
        id: 'stmt_aspen_0006',
        number: 'ST-1042',
        sequence: 1042,
        type: 'balance_forward',
        statement_date: '2026-11-20',
        start_date: '2026-10-20',
        end_date: '2026-11-20',
        balance: 248000,
        sent_at: '2026-11-20 17:06:12.000Z',
        sent_to: STATEMENT_TAB_CUSTOMER.email,
    }),
    statement({
        id: 'stmt_aspen_0005',
        number: 'ST-1031',
        sequence: 1031,
        type: 'open_items',
        statement_date: '2026-10-31',
        balance: 186000,
        created: '2026-10-31 18:40:00.000Z',
    }),
    statement({
        id: 'stmt_aspen_0004',
        number: 'ST-1019',
        sequence: 1019,
        type: 'balance_forward',
        statement_date: '2026-10-31',
        start_date: '2026-10-01',
        end_date: '2026-10-31',
        email: LONG_ADDRESS,
        balance: 186000,
        sent_at: '2026-11-02 09:15:40.000Z',
        sent_to: LONG_ADDRESS,
    }),
    statement({
        id: 'stmt_aspen_0003',
        number: 'ST-1008',
        sequence: 1008,
        type: 'balance_forward',
        statement_date: '2026-09-30',
        start_date: '2026-09-01',
        end_date: '2026-09-30',
        balance: 0,
        sent_at: '2026-09-30 16:20:05.000Z',
        sent_to: STATEMENT_TAB_CUSTOMER.email,
    }),
    statement({
        id: 'stmt_aspen_0002',
        number: 'ST-1003',
        sequence: 1003,
        type: 'open_items',
        statement_date: '2026-08-31',
        balance: -12500,
    }),
    statement({
        id: 'stmt_aspen_0001',
        number: 'STMT-2026-000117',
        sequence: 117,
        type: 'balance_forward',
        statement_date: '2026-07-31',
        start_date: '2025-08-01',
        end_date: '2026-07-31',
        balance: 1284750,
        sent_at: '2026-08-01 08:02:00.000Z',
        sent_to: STATEMENT_TAB_CUSTOMER.email,
    }),
] satisfies BooksStatements[]

export const EMPTY_STATEMENTS: StatementRecord[] = []

// The statement the one-statement screen and the Send dialog show (§3.8).
export const SENT_STATEMENT = STATEMENTS[0]
// Not sent, and its amount due differs from the ledger's figure today (a back-dated post).
export const UNSENT_STATEMENT = STATEMENTS[1]
export const UNSENT_STATEMENT_AMOUNT_NOW = 198500

// `statement-<number>-<customer name>.pdf`, as core makes a report file name (§3.5).
export const SENT_STATEMENT_FILE = 'statement-st-1042-aspen-ridge-dental.pdf'
export const UNSENT_STATEMENT_FILE = 'statement-st-1031-aspen-ridge-dental.pdf'

// ── Recipients of the create screen (§3.3): today's open balance of each customer. ──

export interface StatementRecipient {
    customer: string
    name: string
    // The parent's name of a sub-customer ("<parent>:<name>"); '' for a top-level customer.
    parentName: string
    email: string
    inactive: boolean
    // Today's open balance in cents (`books_party_balances`); a credit is negative.
    balance: number
    // A posted invoice with an open balance and a due date before the statement date.
    overdue: boolean
}

function recipient(id: string, balance: number, overdue = false): StatementRecipient {
    const row = customerOf(id)
    const parentName = row.parent === '' ? '' : customerOf(row.parent).display_name
    return {
        customer: id,
        name: row.display_name,
        parentName,
        email: row.email,
        inactive: row.inactive,
        balance,
        overdue,
    }
}

// By name ignoring case, a sub-customer under its parent. Holds: sub-customers, a long
// name with a long address, a long sub-customer name, an inactive customer with a
// balance, a customer with no address (Sean O'Brien), a credit balance and zero balances.
export const STATEMENT_RECIPIENTS: StatementRecipient[] = [
    recipient(ASPEN, 248000, true),
    recipient(BLUEFIN, 91550),
    recipient(CEDAR, 127500, true),
    recipient(DELTA, 0),
    recipient(CUSTOMER_IDS.harborview, 630000, true),
    recipient(CUSTOMER_IDS.harborviewEvents, -45000),
    recipient(CUSTOMER_IDS.harborviewKitchen, 314225),
    recipient(JUNIPER, 18400),
    recipient(CUSTOMER_IDS.oldMill, 6200, true),
    recipient(OBRIEN, 40000),
    recipient(CUSTOMER_IDS.stJude, 395000),
    recipient(CUSTOMER_IDS.stJudeGala, 120000, true),
    recipient(CHEN, 0),
]

// Customer balance "Open": a balance greater than zero.
export const OPEN_RECIPIENTS = STATEMENT_RECIPIENTS.filter(row => row.balance > 0)
// "Overdue": a posted invoice past its due date.
export const OVERDUE_RECIPIENTS = STATEMENT_RECIPIENTS.filter(row => row.overdue)
// "All": every active customer, and an inactive one whose balance is not zero.
export const ALL_RECIPIENTS = STATEMENT_RECIPIENTS.filter(row => !row.inactive || row.balance !== 0)
export const EMPTY_RECIPIENTS: StatementRecipient[] = []

export const STATEMENT_RECIPIENT_IDS = {
    aspen: ASPEN,
    juniper: JUNIPER,
    obrien: OBRIEN,
    oldMill: CUSTOMER_IDS.oldMill,
    stJude: CUSTOMER_IDS.stJude,
    stJudeGala: CUSTOMER_IDS.stJudeGala,
} as const

// An address typed for one run that is not a valid email address (§3.3).
export const INVALID_ADDRESS = 'owner@juniperstreet'

// The create screen's option values on 2026-11-20 (§3.2 defaults).
export const STATEMENT_OPTIONS = {
    statementDate: '2026-11-20',
    startDate: '2026-10-20',
    endDate: '2026-11-20',
}

// A run of which a part failed (§3.4): the server's message for each failed customer.
// PocketBase ends each message with a period.
export const STATEMENT_RUN_FAILURE = {
    done: 8,
    total: 10,
    failed: [
        {
            customer: CUSTOMER_IDS.stJude,
            message: 'The mail server refused the address.',
        },
        {
            customer: JUNIPER,
            message: 'You have sent 500 statement emails in the last hour. Try again later.',
        },
    ],
}

export const SEND_REFUSAL = 'The mail server refused the address.'

// ── The printed statement (§3.6), as the reference draws its page. The build prints the
// server's PDF; these are the rows of one run of each shipped report (§4.3). ──

export const STATEMENT_BUSINESS = {
    name: 'Hartwell Supply Co.',
    lines: ['1200 Commerce Street, Suite 400', 'Dallas, TX 75201', '+1 214 555 1234'],
}

export const STATEMENT_TO = {
    name: STATEMENT_TAB_CUSTOMER.name,
    lines: ['Aspen Ridge Dental PC', '310 Main Street', 'Aspen, CO 81611'],
}

export interface StatementLine {
    id: string
    date: string
    activity: string
    // Open items only; '' on a line with no due date (a payment, a credit memo).
    due: string
    // A charge is positive; a payment or a credit is negative.
    amount: number
    // Balance forward only: the running balance after the line.
    balance: number
}

export const BALANCE_FORWARD_OPENING = 186000

export const BALANCE_FORWARD_LINES: StatementLine[] = [
    {
        id: 'bf-1',
        date: '2026-10-27',
        activity: 'Invoice 1042',
        due: '',
        amount: 124000,
        balance: 310000,
    },
    {
        id: 'bf-2',
        date: '2026-11-03',
        activity: 'Payment 317',
        due: '',
        amount: -100000,
        balance: 210000,
    },
    {
        id: 'bf-3',
        date: '2026-11-10',
        activity: 'Invoice 1051',
        due: '',
        amount: 50500,
        balance: 260500,
    },
    {
        id: 'bf-4',
        date: '2026-11-12',
        activity: 'Credit memo 3',
        due: '',
        amount: -12500,
        balance: 248000,
    },
]

export const OPEN_ITEM_LINES: StatementLine[] = [
    {
        id: 'oi-1',
        date: '2026-09-15',
        activity: 'Invoice 1017',
        due: '2026-10-15',
        amount: 90000,
        balance: 0,
    },
    {
        id: 'oi-2',
        date: '2026-10-20',
        activity: 'Credit memo 2',
        due: '',
        amount: -12500,
        balance: 0,
    },
    {
        id: 'oi-3',
        date: '2026-10-02',
        activity: 'Invoice 1029',
        due: '2026-11-01',
        amount: 108500,
        balance: 0,
    },
]

// The aging line of the open-items statement: the sum is its amount due (186000).
export const OPEN_ITEM_AGING = [
    { label: 'Current', amount: 96000 },
    { label: '1 - 30', amount: 90000 },
    { label: '31 - 60', amount: 0 },
    { label: '61 - 90', amount: 0 },
    { label: '91 and over', amount: 0 },
]

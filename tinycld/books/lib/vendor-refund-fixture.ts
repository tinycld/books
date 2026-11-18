// Synthetic vendor refunds for the helix reference route, the seed (seed.ts) and tests.
// Plain data: it imports other fixtures and types only, because the seed graph runs in
// plain node (tests/seed-node.test.ts).
//
// Amounts are integer minor units (cents). A refund's lines add up to its `amount` (spec
// §3.5: a refund is on vendor credits in full). A vendor credit's `balance` is its total
// less its applications and less the lines of posted refunds (spec §3.9).
//
// `VendorRefundRecord` and `VendorRefundLineRecord` are local interfaces that mirror the
// spec's Data section (§4): the collections do not exist yet. The migration checkpoint
// (checkpoint 1, `<next>_create_books_vendor_refunds.js`) must replace them with the
// generated `BooksVendorRefunds` and `BooksVendorRefundLines` from '../types', so the
// `satisfies` checks below hold the rows to the real schema.
//
// A refund names its account by a fixture id (`REFUND_ACCOUNT_IDS`); the seed maps it to
// the seeded account by number, since the relation id is known only after the seed creates
// the accounts.

import type { BooksAccounts, BooksVendorCredits } from '../types'
import type { PaymentMethodKey } from './payment-methods'
import { DEPOSIT_ACCOUNT_IDS, DEPOSIT_ACCOUNTS } from './sales-receipt-form-fixture'
import {
    VENDOR_CREDIT_IDS,
    VENDOR_CREDIT_USER_IDS,
    VENDOR_CREDIT_USER_NAMES,
    VENDOR_CREDITS,
    type VendorCreditRecord,
} from './vendor-credit-form-fixture'
import { VENDOR_IDS, VENDORS } from './vendor-form-fixture'

export const VENDOR_REFUND_CURRENCY = 'USD'
// "Today" for the reference captures, so default dates are stable.
export const VENDOR_REFUND_TODAY = '2026-11-17'

const STAMP = '2026-11-17 09:00:00.000Z'

export const VENDOR_REFUND_USER_IDS = VENDOR_CREDIT_USER_IDS
export const VENDOR_REFUND_USER_NAMES = VENDOR_CREDIT_USER_NAMES

// Spec §4 `books_vendor_refunds`. Replaced by the generated type at checkpoint 1.
export interface VendorRefundRecord {
    id: string
    vendor: string
    status: 'draft' | 'posted' | 'void'
    number: string
    sequence: number
    // An ISO day.
    date: string
    payment_method: PaymentMethodKey | ''
    reference_no: string
    refunded_to: string
    amount: number
    memo: string
    currency: string
    entry: string
    replaces: string
    replaced_by: string
    posted_by: string
    posted_at: string
    voided_by: string
    voided_at: string
    sort_key: string
    created: string
    updated: string
}
export type VendorRefundStatus = VendorRefundRecord['status']

// Spec §4 `books_vendor_refund_lines`. Replaced by the generated type at checkpoint 1.
export interface VendorRefundLineRecord {
    id: string
    refund: string
    vendor_credit: string
    amount: number
    position: number
    created: string
    updated: string
}

function vendorIdByName(name: string): string {
    const vendor = VENDORS.find(row => row.display_name === name)
    if (!vendor) throw new Error(`vendor refund fixture: no vendor named ${name}`)
    return vendor.id
}

export const VENDOR_REFUND_VENDOR_IDS = {
    // Three unapplied credits (one partly applied, one with a long credit no. dated after
    // "today"): the form states and the refund over two credits.
    pacificPower: VENDOR_IDS.pacificPower,
    // The seeded vendor: no other seeded credit and no open bill (spec §4 seed). One credit,
    // a posted refund of part of it, a void refund, and a draft refund of the rest.
    cascade: vendorIdByName('Cascade Fuel & Fleet'),
    // No vendor credit at all: the "record the vendor credit first" state.
    zenith: vendorIdByName('Zenith Telecom'),
} as const

const VENDOR = VENDOR_REFUND_VENDOR_IDS

export function vendorRefundVendorName(vendorId: string): string {
    return VENDORS.find(row => row.id === vendorId)?.display_name ?? ''
}

// Refunded to (spec §3.3, Q3): the active bank accounts, the credit card accounts and
// Undeposited funds, in chart order. The numbers and names are the seed's.
export type RefundAccountRow = Pick<
    BooksAccounts,
    'id' | 'number' | 'name' | 'type' | 'detail_type' | 'parent' | 'inactive'
>

export const REFUND_ACCOUNT_IDS = {
    ...DEPOSIT_ACCOUNT_IDS,
    companyCard: 'acctfixcard0001',
} as const

export const REFUND_ACCOUNTS: RefundAccountRow[] = [
    ...DEPOSIT_ACCOUNTS,
    {
        id: REFUND_ACCOUNT_IDS.companyCard,
        number: '2100',
        name: 'Company Card',
        type: 'credit_card',
        detail_type: 'credit_card',
        parent: '',
        inactive: false,
    },
]

// A chart with no bank, credit card or Undeposited funds account.
export const NO_REFUND_ACCOUNTS: RefundAccountRow[] = []

// Each account's posted balance, for "Balance $7,218.56" under Refunded to. A credit card
// that the company owes on is below zero in the reference (the danger tone).
export const REFUND_ACCOUNT_BALANCES: Record<string, number> = {
    [REFUND_ACCOUNT_IDS.checking]: 721_856,
    [REFUND_ACCOUNT_IDS.savings]: 2_500_000,
    [REFUND_ACCOUNT_IDS.undeposited]: 124_356,
    [REFUND_ACCOUNT_IDS.companyCard]: -48_215,
}

export function refundAccountLabel(accountId: string): string {
    const account = REFUND_ACCOUNTS.find(row => row.id === accountId)
    if (!account) return ''
    return account.number ? `${account.number} ${account.name}` : account.name
}

export const VENDOR_REFUND_CREDIT_IDS = {
    // Pacific Power's seeded credit 1001 (vendor credit fixture): $650.00, nothing applied.
    pacific1001: VENDOR_CREDIT_IDS.unapplied,
    // Reference only (not seeded). Pacific Power, in date order after 1001.
    pacific1006: 'vcrd1006pacpw01',
    pacific1009: 'vcrd1009pacpw01',
    // A long credit no. and a large amount, dated after "today": the truncation edge and
    // the "dated after the refund date" refusal.
    pacificLong: 'vcrd1012pacpw01',
    // Seeded: Cascade Fuel & Fleet's only credit.
    cascade: 'vcrd1005cascad1',
} as const

const CREDIT = VENDOR_REFUND_CREDIT_IDS

type CreditSeed = Pick<
    BooksVendorCredits,
    'id' | 'vendor' | 'number' | 'date' | 'total' | 'balance'
> &
    Partial<BooksVendorCredits>

function credit(seed: CreditSeed): VendorCreditRecord {
    return {
        status: 'posted',
        sequence: Number.parseInt(seed.number, 10) || 0,
        ref_no: '',
        memo: '',
        subtotal: seed.total,
        revision: 1,
        currency: VENDOR_REFUND_CURRENCY,
        entry: '',
        replaces: '',
        replaced_by: '',
        posted_by: VENDOR_REFUND_USER_IDS.ana,
        posted_at: `${seed.date} 16:00:00.000Z`,
        voided_by: '',
        voided_at: '',
        form: '',
        fields: null,
        sort_key: '',
        created: STAMP,
        updated: STAMP,
        ...seed,
    }
}

// The vendor credits this unit adds to the vendor credit fixture's. The Pacific Power rows
// are as the form lists them before refund 1004 (below) posts; `balance` on the Cascade
// row is its total less the posted refund 1001 (the void refund gave its amount back).
export const VENDOR_REFUND_CREDITS = [
    credit({
        id: CREDIT.pacific1006,
        vendor: VENDOR.pacificPower,
        number: '1006',
        date: '2026-11-14',
        ref_no: 'CM-8902',
        memo: 'Deposit returned after the meter upgrade',
        total: 12_000,
        balance: 12_000,
    }),
    credit({
        id: CREDIT.pacific1009,
        vendor: VENDOR.pacificPower,
        number: '1009',
        date: '2026-11-16',
        total: 4_240,
        balance: 4_240,
    }),
    credit({
        id: CREDIT.pacificLong,
        vendor: VENDOR.pacificPower,
        number: '1012',
        date: '2026-11-18',
        ref_no: 'PPW-CREDIT-2026-11-METER-4471-ADJUSTMENT',
        memo: 'Annual true-up of the demand charge',
        total: 1_234_567_890,
        balance: 1_234_567_890,
    }),
    credit({
        id: CREDIT.cascade,
        vendor: VENDOR.cascade,
        number: '1005',
        date: '2026-11-05',
        ref_no: 'CFF-RC-3310',
        memo: 'Fleet cards cancelled; prepaid fuel returned',
        total: 42_500,
        balance: 27_500,
        entry: 'jevcredit100501',
    }),
] satisfies VendorCreditRecord[]

// The one account line of the seeded Cascade credit. The plan checks by grep that no
// report, register or vendor spec reads a fixed figure of this account (spec §4 seed).
export const VENDOR_REFUND_SEED_CREDIT_LINE = {
    vendor_credit: CREDIT.cascade,
    account_number: '6100',
    description: 'Prepaid fuel returned',
    amount: 42_500,
} as const

const ALL_CREDITS: VendorCreditRecord[] = [...VENDOR_CREDITS, ...VENDOR_REFUND_CREDITS]

export function refundCreditById(creditId: string): VendorCreditRecord | undefined {
    return ALL_CREDITS.find(row => row.id === creditId)
}

// A vendor's credits as the form lists them (spec §3.4): posted, balance above zero,
// oldest credit date first, then number.
export function refundableCreditsOf(vendorId: string): VendorCreditRecord[] {
    return ALL_CREDITS.filter(
        row => row.vendor === vendorId && row.status === 'posted' && row.balance > 0
    ).sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))
}

export const VENDOR_REFUND_IDS = {
    // Posted 1001, Cascade: $150.00 of credit 1005 to 1000 Business Checking, by check.
    posted: 'vrfn1001cascad1',
    // Void 1002, Cascade: $100.00 keyed for the wrong check, voided the next day.
    voided: 'vrfn1002cascad1',
    // Draft, Cascade: the rest of credit 1005, to Undeposited funds.
    draft: 'vrfndraftcascad',
    // Reference only (not seeded). Void 1003, Pacific Power, replaced by its correction
    // (same number).
    replaced: 'vrfn1003pacpw01',
    correction: 'vrfn1003fix0001',
    // Reference only. Posted 1004, Pacific Power: one check over two credits (1006 in
    // full, 1009 in part), to the Company Card.
    twoCredits: 'vrfn1004pacpw01',
} as const

const IDS = VENDOR_REFUND_IDS

type RefundSeed = Pick<VendorRefundRecord, 'id' | 'vendor' | 'status' | 'date' | 'amount'> &
    Partial<VendorRefundRecord>

function refund(seed: RefundSeed): VendorRefundRecord {
    return {
        number: '',
        sequence: 0,
        payment_method: '',
        reference_no: '',
        refunded_to: REFUND_ACCOUNT_IDS.checking,
        memo: '',
        currency: VENDOR_REFUND_CURRENCY,
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

export const VENDOR_REFUNDS = [
    refund({
        id: IDS.posted,
        vendor: VENDOR.cascade,
        status: 'posted',
        number: '1001',
        sequence: 1001,
        date: '2026-11-10',
        payment_method: 'check',
        reference_no: '20417',
        amount: 15_000,
        memo: 'First of two refund checks for the cancelled fleet cards',
        entry: 'jevrefund100101',
        posted_by: VENDOR_REFUND_USER_IDS.ana,
        posted_at: '2026-11-10 17:40:00.000Z',
    }),
    refund({
        id: IDS.voided,
        vendor: VENDOR.cascade,
        status: 'void',
        number: '1002',
        sequence: 1002,
        date: '2026-11-11',
        payment_method: 'check',
        reference_no: '20431',
        amount: 10_000,
        memo: 'Check 20431 was stopped by Cascade before it cleared',
        entry: 'jevrefund100201',
        posted_by: VENDOR_REFUND_USER_IDS.ana,
        posted_at: '2026-11-11 15:10:00.000Z',
        voided_by: VENDOR_REFUND_USER_IDS.omar,
        voided_at: '2026-11-12 09:25:00.000Z',
    }),
    refund({
        id: IDS.draft,
        vendor: VENDOR.cascade,
        status: 'draft',
        date: VENDOR_REFUND_TODAY,
        payment_method: 'check',
        reference_no: '20466',
        refunded_to: REFUND_ACCOUNT_IDS.undeposited,
        amount: 27_500,
        memo: 'Second check, waiting for the deposit slip',
    }),
    refund({
        id: IDS.replaced,
        vendor: VENDOR.pacificPower,
        status: 'void',
        number: '1003',
        sequence: 1003,
        date: '2026-11-13',
        payment_method: 'bank_transfer',
        reference_no: 'ACH 4471-0093',
        amount: 5_000,
        entry: 'jevrefund100301',
        replaced_by: IDS.correction,
        posted_by: VENDOR_REFUND_USER_IDS.ana,
        posted_at: '2026-11-13 14:00:00.000Z',
        voided_by: VENDOR_REFUND_USER_IDS.omar,
        voided_at: '2026-11-14 10:05:00.000Z',
    }),
    refund({
        id: IDS.correction,
        vendor: VENDOR.pacificPower,
        status: 'posted',
        number: '1003',
        sequence: 1003,
        date: '2026-11-13',
        payment_method: 'bank_transfer',
        reference_no: 'ACH 4471-0093',
        amount: 10_000,
        memo: 'The transfer was $100.00; first entry keyed $50.00',
        entry: 'jevrefund100302',
        replaces: IDS.replaced,
        posted_by: VENDOR_REFUND_USER_IDS.omar,
        posted_at: '2026-11-14 10:05:00.000Z',
    }),
    refund({
        id: IDS.twoCredits,
        vendor: VENDOR.pacificPower,
        status: 'posted',
        number: '1004',
        sequence: 1004,
        date: VENDOR_REFUND_TODAY,
        payment_method: 'credit_card',
        reference_no: 'REFUND AUTH 448120-PPW-NOV',
        refunded_to: REFUND_ACCOUNT_IDS.companyCard,
        amount: 15_000,
        memo: 'Pacific Power refunded the card that paid the October bills. The deposit of the meter upgrade came back in full; the rest of credit 1009 stays on the vendor for the December bill.',
        entry: 'jevrefund100401',
        posted_by: VENDOR_REFUND_USER_IDS.ana,
        posted_at: '2026-11-17 18:30:00.000Z',
    }),
] satisfies VendorRefundRecord[]

// What the seed writes (spec §4 seed), in this order, so posting numbers them 1001 and
// 1002 in the seeded book: `posted` is posted, `voided` is posted and then voided, `draft`
// is saved last and never posted. The others are for the reference only.
export const VENDOR_REFUND_SEED_IDS = [IDS.posted, IDS.voided, IDS.draft] as const
export const VENDOR_REFUND_SEED_CREDIT_IDS = [CREDIT.cascade] as const

function lines(
    refundId: string,
    tag: string,
    seeds: { vendor_credit: string; amount: number }[]
): VendorRefundLineRecord[] {
    return seeds.map((seed, position) => ({
        id: `vrfl${tag}${String(position).padStart(2, '0')}`.padEnd(15, '0'),
        refund: refundId,
        vendor_credit: seed.vendor_credit,
        amount: seed.amount,
        position,
        created: STAMP,
        updated: STAMP,
    }))
}

export const VENDOR_REFUND_LINES = [
    ...lines(IDS.posted, 'post', [{ vendor_credit: CREDIT.cascade, amount: 15_000 }]),
    ...lines(IDS.voided, 'void', [{ vendor_credit: CREDIT.cascade, amount: 10_000 }]),
    ...lines(IDS.draft, 'drft', [{ vendor_credit: CREDIT.cascade, amount: 27_500 }]),
    ...lines(IDS.replaced, 'repl', [{ vendor_credit: CREDIT.pacific1001, amount: 5_000 }]),
    ...lines(IDS.correction, 'fixd', [{ vendor_credit: CREDIT.pacific1001, amount: 10_000 }]),
    ...lines(IDS.twoCredits, 'twoc', [
        { vendor_credit: CREDIT.pacific1006, amount: 12_000 },
        { vendor_credit: CREDIT.pacific1009, amount: 3_000 },
    ]),
] satisfies VendorRefundLineRecord[]

export function linesOfRefund(refundId: string): VendorRefundLineRecord[] {
    return VENDOR_REFUND_LINES.filter(row => row.refund === refundId).sort(
        (a, b) => a.position - b.position
    )
}

// The posted refunds that name a vendor credit, in date order (the credit read view's
// Refunded row and its Applied to block, spec §3.9).
export function postedRefundsOfCredit(
    creditId: string
): { refund: VendorRefundRecord; amount: number }[] {
    return VENDOR_REFUND_LINES.filter(row => row.vendor_credit === creditId)
        .flatMap(row => {
            const owner = VENDOR_REFUNDS.find(r => r.id === row.refund && r.status === 'posted')
            return owner ? [{ refund: owner, amount: row.amount }] : []
        })
        .sort((a, b) => a.refund.date.localeCompare(b.refund.date))
}

/**
 * The form states the reference shows (spec §3.3–§3.5), as the form would hold them: the
 * header fields, whether Amount refunded was typed, and each listed row's refund in cents
 * by vendor credit id (a row missing from `refunds` is at zero).
 */
export interface VendorRefundFormFixture {
    vendor: string
    date: string
    method: PaymentMethodKey | ''
    reference: string
    refundedTo: string
    // Null: Amount refunded is empty.
    amount: number | null
    amountTyped: boolean
    refunds: Record<string, number>
    memo: string
}

export const VENDOR_REFUND_FORM_STATES = {
    // Nothing chosen yet: the default account is the first active bank account.
    blank: {
        vendor: '',
        date: VENDOR_REFUND_TODAY,
        method: '',
        reference: '',
        refundedTo: REFUND_ACCOUNT_IDS.checking,
        amount: null,
        amountTyped: false,
        refunds: {},
        memo: '',
    },
    // $800.00 typed and placed oldest first: 1001 and 1006 in full, 1009 in part.
    placed: {
        vendor: VENDOR.pacificPower,
        date: VENDOR_REFUND_TODAY,
        method: 'check',
        reference: '20417',
        refundedTo: REFUND_ACCOUNT_IDS.checking,
        amount: 80_000,
        amountTyped: true,
        refunds: {
            [CREDIT.pacific1001]: 65_000,
            [CREDIT.pacific1006]: 12_000,
            [CREDIT.pacific1009]: 3_000,
        },
        memo: 'Refund of the October overcharge and the meter deposit, one check',
    },
    // $800.00 typed, then a row cleared: $30.00 of the refund is on no vendor credit.
    notPlaced: {
        vendor: VENDOR.pacificPower,
        date: VENDOR_REFUND_TODAY,
        method: 'check',
        reference: '20417',
        refundedTo: REFUND_ACCOUNT_IDS.checking,
        amount: 80_000,
        amountTyped: true,
        refunds: { [CREDIT.pacific1001]: 65_000, [CREDIT.pacific1006]: 12_000 },
        memo: '',
    },
    // $700.00 typed, rows edited past it: 1006 above its unapplied credit, a credit dated
    // after the refund date, and the sum above the amount. Refunded to the card, whose
    // balance is below zero.
    refused: {
        vendor: VENDOR.pacificPower,
        date: VENDOR_REFUND_TODAY,
        method: 'credit_card',
        reference: 'AUTH 448120',
        refundedTo: REFUND_ACCOUNT_IDS.companyCard,
        amount: 70_000,
        amountTyped: true,
        refunds: {
            [CREDIT.pacific1001]: 65_000,
            [CREDIT.pacific1006]: 13_000,
            [CREDIT.pacificLong]: 1_000,
        },
        memo: '',
    },
    // A vendor with no unapplied vendor credit.
    noCredit: {
        vendor: VENDOR.zenith,
        date: VENDOR_REFUND_TODAY,
        method: 'bank_transfer',
        reference: '',
        refundedTo: REFUND_ACCOUNT_IDS.checking,
        amount: 8_500,
        amountTyped: true,
        refunds: {},
        memo: '',
    },
    // The saved draft of the seed: the rest of Cascade's credit, to Undeposited funds.
    draft: {
        vendor: VENDOR.cascade,
        date: VENDOR_REFUND_TODAY,
        method: 'check',
        reference: '20466',
        refundedTo: REFUND_ACCOUNT_IDS.undeposited,
        amount: 27_500,
        amountTyped: true,
        refunds: { [CREDIT.cascade]: 27_500 },
        memo: 'Second check, waiting for the deposit slip',
    },
    // The correction of posted refund 1001 (`?replaces`): it keeps its vendor and number,
    // and its credit lists with the original's amount given back.
    correction: {
        vendor: VENDOR.cascade,
        date: '2026-11-10',
        method: 'check',
        reference: '20417',
        refundedTo: REFUND_ACCOUNT_IDS.checking,
        amount: 15_000,
        amountTyped: true,
        refunds: { [CREDIT.cascade]: 15_000 },
        memo: 'First of two refund checks for the cancelled fleet cards',
    },
} satisfies Record<string, VendorRefundFormFixture>

// The words the reference shows (spec §3.4–§3.9). `{vendor}`, `{credit}` and the amounts
// stand where the form fills them in.
export const VENDOR_REFUND_TEXTS = {
    chooseVendor: 'Choose a vendor to see their unapplied credits.',
    noCredit:
        '{vendor} has no unapplied vendor credit. Record the vendor credit first, then its refund.',
    noAccount: 'Add a bank or credit card account to the chart of accounts',
    amountRequired: 'Enter the amount refunded',
    rowOver: 'More than the unapplied credit of $120.00',
    rowDatedAfter: 'Vendor credit 1012 is dated after the refund date.',
    sumOver: 'The refunds add up to $790.00, more than the $700.00 refunded',
    notPlaced:
        '$30.00 of the refund is not on a vendor credit. Put it on a credit or lower the amount.',
    memoHint: 'Only your team sees this. Saved as the journal entry memo.',
    listLoadFailed: 'Books could not load the vendor credits.',
    loadError: 'Books could not load this vendor refund.',
    notFound: 'This vendor refund does not exist',
    cannotEdit: 'This vendor refund cannot be edited',
    noAccess: 'You need bookkeeper access to record vendor refunds',
    deleteDraft: "Delete this draft vendor refund? This can't be undone.",
    voidBody:
        'A reversing entry is posted in the original period. The number is kept. The vendor credits it refunded are unapplied again.',
    creditVoidRefused: 'A vendor refund is recorded on this credit. Void the refund first.',
    applyEmpty:
        '{vendor} has no open bills. The credit stays on the vendor until you post a bill or record a refund.',
} as const

export function fillVendorRefundText(text: string, vendorName: string): string {
    return text.replace('{vendor}', vendorName)
}

export const NO_VENDOR_REFUNDS: VendorRefundRecord[] = []
export const NO_VENDOR_REFUND_LINES: VendorRefundLineRecord[] = []

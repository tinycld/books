import { describe, expect, it } from 'vitest'
import type { DocumentListRow } from '../tinycld/books/lib/document-list'
import {
    BILL_MESSAGES,
    EXPENSE_MESSAGES,
    VENDOR_CREDIT_MESSAGES,
} from '../tinycld/books/lib/document-texts'
import { PAY_BILLS_MESSAGES } from '../tinycld/books/lib/pay-bills-texts'
import {
    purchaseRowActionHref,
    purchaseRowMenuItems,
    purchaseVoidTexts,
} from '../tinycld/books/lib/purchase-row-menu'
import { VENDOR_REFUND_FLOW } from '../tinycld/books/lib/vendor-refund-flow'
import type { VendorTransactionKind } from '../tinycld/books/lib/vendor-transactions'

// The row menu of a purchase list (spec §3 "Row menu"): Open, then the read view's actions for
// the document's status and the user's access, in the read view's order and with its labels,
// never Edit; a draft holds Open and Delete draft (Open alone for a reader); View journal
// entry only when the document has an entry.

const ID = 'plbill000001057'
const VENDOR = 'ven000000000001'
const ENTRY = 'ent000000000001'

function row(
    kind: VendorTransactionKind,
    recordStatus: string,
    fields: Partial<DocumentListRow> = {}
): DocumentListRow {
    return {
        id: ID,
        kind,
        number: recordStatus === 'draft' ? '' : '1057',
        date: '2026-11-17',
        dueDate: '',
        total: 150,
        currency: 'USD',
        created: '2026-11-17 10:00:00.000Z',
        status: { label: 'Open', tone: 'warning' },
        sequence: recordStatus === 'draft' ? 0 : 1057,
        partyId: VENDOR,
        partyName: 'Zenith Telecom',
        memo: '',
        reference: '',
        expires: '',
        balance: recordStatus === 'posted' ? 150 : 0,
        entry: recordStatus === 'draft' ? '' : ENTRY,
        convertedInvoice: '',
        recordStatus,
        category: { kind: 'none' },
        ...fields,
    }
}

const WRITER = true
const READER = false

// kind × status × access → the menu (spec §3 "Row menu" table, plus the drafts).
const CASES: [string, DocumentListRow, boolean, string[]][] = [
    [
        'posted bill, writer',
        row('bill', 'posted'),
        WRITER,
        ['open', 'pay_bill', 'void', 'copy', 'entry'],
    ],
    ['void bill, writer', row('bill', 'void'), WRITER, ['open', 'copy', 'entry']],
    ['posted bill, reader', row('bill', 'posted'), READER, ['open', 'entry']],
    ['void bill, reader', row('bill', 'void'), READER, ['open', 'entry']],
    ['posted expense, writer', row('expense', 'posted'), WRITER, ['open', 'void', 'copy', 'entry']],
    ['void expense, writer', row('expense', 'void'), WRITER, ['open', 'copy', 'entry']],
    ['posted expense, reader', row('expense', 'posted'), READER, ['open', 'entry']],
    ['void expense, reader', row('expense', 'void'), READER, ['open', 'entry']],
    [
        'posted bill payment, writer',
        row('bill_payment', 'posted'),
        WRITER,
        ['open', 'void', 'entry'],
    ],
    ['void bill payment, writer', row('bill_payment', 'void'), WRITER, ['open', 'entry']],
    ['posted bill payment, reader', row('bill_payment', 'posted'), READER, ['open', 'entry']],
    ['void bill payment, reader', row('bill_payment', 'void'), READER, ['open', 'entry']],
    [
        'posted vendor credit, writer',
        row('vendor_credit', 'posted'),
        WRITER,
        ['open', 'apply_credit', 'record_refund', 'void', 'copy', 'entry'],
    ],
    ['void vendor credit, writer', row('vendor_credit', 'void'), WRITER, ['open', 'copy', 'entry']],
    ['posted vendor credit, reader', row('vendor_credit', 'posted'), READER, ['open', 'entry']],
    ['void vendor credit, reader', row('vendor_credit', 'void'), READER, ['open', 'entry']],
    [
        'posted vendor refund, writer',
        row('vendor_refund', 'posted'),
        WRITER,
        ['open', 'void', 'entry'],
    ],
    ['void vendor refund, writer', row('vendor_refund', 'void'), WRITER, ['open', 'entry']],
    ['posted vendor refund, reader', row('vendor_refund', 'posted'), READER, ['open', 'entry']],
    ['void vendor refund, reader', row('vendor_refund', 'void'), READER, ['open', 'entry']],
    ['draft bill, writer', row('bill', 'draft'), WRITER, ['open', 'delete_draft']],
    ['draft expense, writer', row('expense', 'draft'), WRITER, ['open', 'delete_draft']],
    [
        'draft vendor credit, writer',
        row('vendor_credit', 'draft'),
        WRITER,
        ['open', 'delete_draft'],
    ],
    [
        'draft vendor refund, writer',
        row('vendor_refund', 'draft'),
        WRITER,
        ['open', 'delete_draft'],
    ],
    ['draft bill, reader', row('bill', 'draft'), READER, ['open']],
    ['draft expense, reader', row('expense', 'draft'), READER, ['open']],
    ['draft vendor credit, reader', row('vendor_credit', 'draft'), READER, ['open']],
    ['draft vendor refund, reader', row('vendor_refund', 'draft'), READER, ['open']],
    [
        'posted bill with balance 0 (paid), writer: no Pay bill',
        row('bill', 'posted', { balance: 0 }),
        WRITER,
        ['open', 'void', 'copy', 'entry'],
    ],
    [
        'posted vendor credit with balance 0 (closed), writer: no Apply to bills, no Record refund',
        row('vendor_credit', 'posted', { balance: 0 }),
        WRITER,
        ['open', 'void', 'copy', 'entry'],
    ],
    [
        'posted bill with no entry, writer: no View journal entry',
        row('bill', 'posted', { entry: '' }),
        WRITER,
        ['open', 'pay_bill', 'void', 'copy'],
    ],
    [
        'posted vendor credit with no entry, reader: Open only',
        row('vendor_credit', 'posted', { entry: '' }),
        READER,
        ['open'],
    ],
    [
        'posted bill payment with no entry, writer: no View journal entry',
        row('bill_payment', 'posted', { entry: '' }),
        WRITER,
        ['open', 'void'],
    ],
    [
        'void vendor refund with no entry, writer: Open only',
        row('vendor_refund', 'void', { entry: '' }),
        WRITER,
        ['open'],
    ],
]

describe('purchaseRowMenuItems', () => {
    it.each(CASES)('%s', (_name, listed, canWrite, expected) => {
        expect(purchaseRowMenuItems(listed, canWrite)).toEqual(expected)
    })

    it('never holds Edit, and starts with Open', () => {
        for (const [, listed, canWrite] of CASES) {
            const items: string[] = purchaseRowMenuItems(listed, canWrite)
            expect(items).not.toContain('edit')
            expect(items[0]).toBe('open')
        }
    })
})

// A route as its path and its params, so the order of the params does not matter.
function parts(href: string | null) {
    if (href === null) throw new Error('no route')
    const [path, query = ''] = href.split('?')
    return { path, params: Object.fromEntries(new URLSearchParams(query)) }
}

describe('purchaseRowActionHref', () => {
    it('pay_bill gives Pay Bills with the bill', () => {
        expect(parts(purchaseRowActionHref(row('bill', 'posted'), 'pay_bill'))).toEqual({
            path: 'books/pay-bills',
            params: { bill: ID },
        })
    })

    it("copy gives the kind's new route with copy, for a bill, an expense and a vendor credit", () => {
        expect(parts(purchaseRowActionHref(row('bill', 'posted'), 'copy'))).toEqual({
            path: 'books/bills/new',
            params: { copy: ID },
        })
        expect(parts(purchaseRowActionHref(row('expense', 'void'), 'copy'))).toEqual({
            path: 'books/expenses/new',
            params: { copy: ID },
        })
        expect(parts(purchaseRowActionHref(row('vendor_credit', 'posted'), 'copy'))).toEqual({
            path: 'books/vendor-credits/new',
            params: { copy: ID },
        })
    })

    it("record_refund gives the new vendor refund with the row's vendor and the credit", () => {
        expect(
            parts(purchaseRowActionHref(row('vendor_credit', 'posted'), 'record_refund'))
        ).toEqual({
            path: 'books/vendor-refunds/new',
            params: { vendor: VENDOR, credit: ID },
        })
    })

    it('entry gives the journal entry', () => {
        expect(purchaseRowActionHref(row('bill_payment', 'posted'), 'entry')).toBe(
            `books/entries/${ENTRY}`
        )
        expect(purchaseRowActionHref(row('expense', 'posted'), 'entry')).toBe(
            `books/entries/${ENTRY}`
        )
    })

    it("open gives the document's route for each kind", () => {
        expect(purchaseRowActionHref(row('bill', 'posted'), 'open')).toBe(`books/bills/${ID}`)
        expect(purchaseRowActionHref(row('expense', 'posted'), 'open')).toBe(`books/expenses/${ID}`)
        expect(purchaseRowActionHref(row('bill_payment', 'posted'), 'open')).toBe(
            `books/bill-payments/${ID}`
        )
        expect(purchaseRowActionHref(row('vendor_credit', 'posted'), 'open')).toBe(
            `books/vendor-credits/${ID}`
        )
        expect(purchaseRowActionHref(row('vendor_refund', 'posted'), 'open')).toBe(
            `books/vendor-refunds/${ID}`
        )
    })

    it("apply_credit gives the vendor credit's route", () => {
        expect(purchaseRowActionHref(row('vendor_credit', 'posted'), 'apply_credit')).toBe(
            `books/vendor-credits/${ID}`
        )
    })

    it('void and delete_draft give null', () => {
        expect(purchaseRowActionHref(row('bill', 'posted'), 'void')).toBeNull()
        expect(purchaseRowActionHref(row('bill_payment', 'posted'), 'void')).toBeNull()
        expect(purchaseRowActionHref(row('bill', 'draft'), 'delete_draft')).toBeNull()
    })
})

describe('purchaseVoidTexts', () => {
    it("gives a bill, an expense and a vendor credit their read view's texts", () => {
        expect(purchaseVoidTexts('bill')).toEqual({
            body: BILL_MESSAGES.voidBody,
            confirmLabel: 'Void bill',
            noun: 'bill',
        })
        expect(purchaseVoidTexts('expense')).toEqual({
            body: EXPENSE_MESSAGES.voidBody,
            confirmLabel: 'Void expense',
            noun: 'expense',
        })
        expect(purchaseVoidTexts('vendor_credit')).toEqual({
            body: VENDOR_CREDIT_MESSAGES.voidBody,
            confirmLabel: 'Void vendor credit',
            noun: 'vendor credit',
        })
    })

    it("gives a bill payment Pay Bills' texts", () => {
        expect(purchaseVoidTexts('bill_payment')).toEqual({
            body: PAY_BILLS_MESSAGES.voidBody,
            confirmLabel: PAY_BILLS_MESSAGES.voidConfirm,
            noun: 'bill payment',
        })
    })

    it("gives a vendor refund the vendor refund flow's texts", () => {
        expect(purchaseVoidTexts('vendor_refund')).toEqual({
            body: VENDOR_REFUND_FLOW.texts.voidBody,
            confirmLabel: VENDOR_REFUND_FLOW.texts.voidConfirm,
            noun: VENDOR_REFUND_FLOW.texts.voidNoun,
        })
    })

    it("gives a bill payment a body other than a bill's", () => {
        expect(purchaseVoidTexts('bill_payment').body).not.toBe(purchaseVoidTexts('bill').body)
    })
})

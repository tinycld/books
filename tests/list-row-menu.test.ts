import { describe, expect, it } from 'vitest'
import type { DocumentListRow, ListKind } from '../tinycld/books/lib/document-list'
import { documentRowMenuItems } from '../tinycld/books/lib/document-row-menu'
import {
    type ListRowAction,
    listRowActionHref,
    listRowMenuItems,
    listRowMenuLabel,
    listVoidTexts,
} from '../tinycld/books/lib/list-row-menu'
import { PAY_BILLS_MESSAGES } from '../tinycld/books/lib/pay-bills-texts'
import { PAYMENT_MESSAGES } from '../tinycld/books/lib/payment-texts'
import { purchaseRowMenuItems } from '../tinycld/books/lib/purchase-row-menu'

// The row menu of any list (lib/list-row-menu.ts): the row's kind picks the sales rules or the
// purchase rules for the items, the hrefs and the Void dialog's words.

const ID = 'doc000000000001'
const PARTY = 'par000000000001'
const ENTRY = 'ent000000000001'

function row(kind: ListKind, fields: Partial<DocumentListRow> = {}): DocumentListRow {
    return {
        id: ID,
        kind,
        number: '1004',
        date: '2026-11-17',
        dueDate: '',
        total: 150,
        currency: 'USD',
        created: '2026-11-17 10:00:00.000Z',
        status: { label: 'Open', tone: 'warning' },
        sequence: 1004,
        partyId: PARTY,
        partyName: 'Acme',
        memo: '',
        reference: '',
        expires: '',
        balance: 150,
        entry: ENTRY,
        convertedInvoice: '',
        recordStatus: 'posted',
        category: { kind: 'none' },
        email: '',
        ...fields,
    }
}

const WRITER = true

describe('listRowMenuItems', () => {
    // [case, row, the area's own items, an item only that area has]
    const CASES: [string, DocumentListRow, ListRowAction[], ListRowAction][] = [
        [
            'a posted invoice gets the sales items',
            row('invoice'),
            documentRowMenuItems(row('invoice'), WRITER),
            'pdf',
        ],
        [
            'a posted bill gets the purchase items',
            row('bill'),
            purchaseRowMenuItems(row('bill'), WRITER),
            'pay_bill',
        ],
    ]

    it.each(CASES)('%s', (_name, listRow, expected, own) => {
        const items = listRowMenuItems(listRow, WRITER)
        expect(items).toEqual(expected)
        expect(items).toContain(own)
    })
})

describe('listRowMenuLabel', () => {
    // Both areas have `apply_credit`; the row's area picks its words.
    const CASES: [string, DocumentListRow, string][] = [
        ['a vendor credit row', row('vendor_credit'), 'Apply to bills'],
        ['a credit memo row', row('credit_memo'), 'Apply to invoices'],
    ]

    it.each(CASES)('apply_credit on %s', (_name, listRow, expected) => {
        expect(listRowMenuLabel(listRow, 'apply_credit')).toBe(expected)
    })
})

describe('listRowActionHref', () => {
    const CASES: [string, DocumentListRow, ListRowAction, string | null][] = [
        [
            'Receive payment on an invoice',
            row('invoice'),
            'receive_payment',
            `books/payments/new?customer=${PARTY}&invoice=${ID}`,
        ],
        ['Pay bill (purchase only) on an invoice', row('invoice'), 'pay_bill', null],
        ['Record refund (purchase only) on an invoice', row('invoice'), 'record_refund', null],
        ['Pay bill on a bill', row('bill'), 'pay_bill', `books/pay-bills?bill=${ID}`],
        ['Download PDF (sales only) on a bill', row('bill'), 'pdf', null],
        ['Receive payment (sales only) on a bill', row('bill'), 'receive_payment', null],
    ]

    it.each(CASES)('%s', (_name, listRow, action, expected) => {
        expect(listRowActionHref(listRow, action)).toBe(expected)
    })
})

describe('listVoidTexts', () => {
    const CASES: [string, DocumentListRow, ReturnType<typeof listVoidTexts>][] = [
        [
            'a payment has the payment body',
            row('payment'),
            { body: PAYMENT_MESSAGES.voidBody, confirmLabel: 'Void payment', noun: 'payment' },
        ],
        [
            'an invoice has no body and the Void <noun> label',
            row('invoice'),
            { body: undefined, confirmLabel: 'Void invoice', noun: 'invoice' },
        ],
        [
            'a bill payment has the Pay Bills texts',
            row('bill_payment'),
            {
                body: PAY_BILLS_MESSAGES.voidBody,
                confirmLabel: PAY_BILLS_MESSAGES.voidConfirm,
                noun: 'bill payment',
            },
        ],
    ]

    it.each(CASES)('%s', (_name, listRow, expected) => {
        expect(listVoidTexts(listRow)).toEqual(expected)
    })
})

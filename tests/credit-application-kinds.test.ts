import { describe, expect, it } from 'vitest'
import { APPLY_CREDIT_MESSAGES } from '../tinycld/books/lib/apply-credit-schema'
import {
    applyCreditLabel,
    CREDIT_MEMO_APPLICATION,
    type CreditApplicationKind,
    VENDOR_CREDIT_APPLICATION,
} from '../tinycld/books/lib/credit-application-kinds'
import { DOCUMENT_READ_LABELS } from '../tinycld/books/lib/document-actions'

// The two kinds of a credit application (apply credit spec §4.4, plan decisions 3–5): the
// applications collection, the fields, the nouns, the texts of each side of the shared
// dialog (`credit`: the credit fixed; `document`: the invoice fixed) and the empty state's
// buttons. The vendor kind keeps every text and route the vendor credit had.
//
// Each side's texts: `title` and `figureLabel` (the dialog's head), `rowOverLimit` (under a
// row's cell), `sumOverFixed` and `selectOne` (the root), `dateBeforeCredit` (under the
// date), `loadFailed` (DialogLoadError) and `empty` (no row). `%s` is filled in order.

describe('applyCreditLabel', () => {
    it('labels Apply by the record’s kind', () => {
        expect(applyCreditLabel('vendor_credit')).toBe('Apply to bills')
        expect(applyCreditLabel('credit_memo')).toBe('Apply to invoices')
        expect(applyCreditLabel('invoice')).toBe('Apply credit')
    })

    it('keeps DOCUMENT_READ_LABELS.apply_credit for the vendor credit and its other callers', () => {
        expect(DOCUMENT_READ_LABELS.apply_credit).toBe('Apply to bills')
    })
})

describe('the kinds’ fields', () => {
    it('names the vendor credit’s collection and fields', () => {
        expect(VENDOR_CREDIT_APPLICATION).toMatchObject({
            key: 'vendor_credit',
            collection: 'books_vendor_credit_applications',
            creditField: 'vendor_credit',
            documentField: 'bill',
            creditNoun: 'Vendor credit',
            documentNoun: 'Bill',
        })
    })

    it('names the credit memo’s collection and fields', () => {
        expect(CREDIT_MEMO_APPLICATION).toMatchObject({
            key: 'credit_memo',
            collection: 'books_credit_memo_applications',
            creditField: 'credit_memo',
            documentField: 'invoice',
            creditNoun: 'Credit memo',
            documentNoun: 'Invoice',
        })
    })
})

describe('the empty state’s buttons', () => {
    const target = { party: 'cust00000000001', id: 'credit000000001' }
    const actionsOf = (kind: CreditApplicationKind) =>
        kind.emptyActions.map(action => ({
            testId: action.testId,
            label: action.label,
            href: action.href(target),
        }))

    it('gives the credit memo New invoice and Refund credit', () => {
        expect(actionsOf(CREDIT_MEMO_APPLICATION)).toEqual([
            {
                testId: 'apply-credit-new-invoice',
                label: 'New invoice',
                href: 'books/invoices/new?customer=cust00000000001',
            },
            {
                testId: 'apply-credit-refund-credit',
                label: 'Refund credit',
                href: 'books/refund-receipts/new?credit_memo=credit000000001',
            },
        ])
    })

    it('keeps the vendor credit’s New bill and Record refund', () => {
        expect(actionsOf(VENDOR_CREDIT_APPLICATION)).toEqual([
            {
                testId: 'apply-credit-new-bill',
                label: 'New bill',
                href: 'books/bills/new?vendor=cust00000000001',
            },
            {
                testId: 'apply-credit-record-refund',
                label: 'Record refund',
                href: 'books/vendor-refunds/new?vendor=cust00000000001&credit=credit000000001',
            },
        ])
    })
})

describe('VENDOR_CREDIT_APPLICATION.texts', () => {
    it('keeps the vendor credit’s dialog texts', () => {
        expect(VENDOR_CREDIT_APPLICATION.texts.credit).toMatchObject({
            title: 'Apply vendor credit %s',
            figureLabel: 'Unapplied credit',
            rowOverLimit: 'More than the open balance of %s',
            sumOverFixed: 'More than the unapplied credit of %s.',
            selectOne: 'Select at least one bill.',
            dateBeforeCredit: "The apply date can't be before the credit date.",
            loadFailed: 'Books could not load the open bills.',
            empty: '%s has no open bills. The credit stays on the vendor until you post a bill or record a refund.',
        })
        expect(VENDOR_CREDIT_APPLICATION.texts.removeBody).toBe(
            "Remove this credit from Bill %s? The bill's balance goes up by %s and the credit is unapplied again."
        )
    })

    it('holds the values APPLY_CREDIT_MESSAGES had, which stays exported', () => {
        expect(APPLY_CREDIT_MESSAGES).toEqual({
            dateBeforeCredit: "The apply date can't be before the credit date.",
            rowOverOpen: 'More than the open balance of %s',
            overUnapplied: 'More than the unapplied credit of %s.',
            selectOne: 'Select at least one bill.',
            loadFailed: 'Books could not load the open bills.',
            noOpenBills:
                '%s has no open bills. The credit stays on the vendor until you post a bill or record a refund.',
            removeBody:
                "Remove this credit from Bill %s? The bill's balance goes up by %s and the credit is unapplied again.",
        })
        const side = VENDOR_CREDIT_APPLICATION.texts.credit
        expect(side.dateBeforeCredit).toBe(APPLY_CREDIT_MESSAGES.dateBeforeCredit)
        expect(side.rowOverLimit).toBe(APPLY_CREDIT_MESSAGES.rowOverOpen)
        expect(side.sumOverFixed).toBe(APPLY_CREDIT_MESSAGES.overUnapplied)
        expect(side.selectOne).toBe(APPLY_CREDIT_MESSAGES.selectOne)
        expect(side.loadFailed).toBe(APPLY_CREDIT_MESSAGES.loadFailed)
        expect(side.empty).toBe(APPLY_CREDIT_MESSAGES.noOpenBills)
        expect(VENDOR_CREDIT_APPLICATION.texts.removeBody).toBe(APPLY_CREDIT_MESSAGES.removeBody)
    })
})

describe('CREDIT_MEMO_APPLICATION.texts', () => {
    it('holds the texts from a credit memo (spec §3.2, §3.4)', () => {
        expect(CREDIT_MEMO_APPLICATION.texts.credit).toMatchObject({
            title: 'Apply credit memo %s',
            figureLabel: 'Unapplied credit',
            rowOverLimit: 'More than the open balance of %s',
            sumOverFixed: 'More than the unapplied credit of %s.',
            selectOne: 'Select at least one invoice.',
            dateBeforeCredit: "The apply date can't be before the credit date.",
            loadFailed: 'Books could not load the open invoices.',
            empty: '%s has no open invoices. The credit stays on the customer until you post an invoice or refund it.',
        })
    })

    it('holds the texts from an invoice (spec §3.3, §3.4)', () => {
        expect(CREDIT_MEMO_APPLICATION.texts.document).toMatchObject({
            title: 'Apply credit to invoice %s',
            figureLabel: 'Open balance',
            rowOverLimit: 'More than the unapplied credit of %s',
            sumOverFixed: 'More than the open balance of %s.',
            selectOne: 'Select at least one credit memo.',
            dateBeforeCredit:
                "The apply date can't be before the credit date of credit memo %s, %s.",
            loadFailed: "Books could not load the customer's credits.",
            empty: '%s has no unapplied credit.',
        })
    })

    it('holds the remove body (spec §3.7)', () => {
        expect(CREDIT_MEMO_APPLICATION.texts.removeBody).toBe(
            "Remove this credit from Invoice %s? The invoice's balance goes up by %s and the credit is unapplied again."
        )
    })
})

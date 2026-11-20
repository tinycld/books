// The two kinds of a credit application (apply credit spec §4.4, plan decisions 3–5): a
// vendor credit applied to bills, and a credit memo applied to invoices. One kind names
// what the shared dialog, schema, reads and blocks differ in: the applications collection,
// the credit and document fields, the nouns, the texts of each side of the dialog
// (`credit`: the credit is fixed and the documents are the rows; `document`: the document is
// fixed and the credits are the rows), the outstanding lists and the empty state's buttons.
// It holds no collection object: a hook picks its collection by `key`. Pure and free of
// React Native, so the schema tests and the e2e helpers import it in Node.

import { APPLY_CREDIT_MESSAGES } from './apply-credit-schema'
import { DOCUMENT_READ_LABELS } from './document-actions'
import {
    CREDIT_OUTSTANDING,
    INVOICE_CREDITS_OUTSTANDING,
    MEMO_INVOICES_OUTSTANDING,
    type OutstandingDocument,
} from './outstanding-documents'

// What an application row names and opens on a block (DocumentApplications): the bill or
// the invoice on a credit's Applied to block, the vendor credit or the credit memo on a
// document's Payments block.
export type ApplicationTarget = 'bill' | 'credit' | 'invoice' | 'credit_memo'

// One side's texts of the apply dialog. `%s` is filled in order (fillPaymentText).
export type ApplySideTexts = {
    // "Apply credit memo %s": the fixed record's number.
    title: string
    // The figure's label over the fixed side's amount.
    figureLabel: string
    // Under a row's cell: the row's own limit as money.
    rowOverLimit: string
    // At the root: the fixed side's amount as money.
    sumOverFixed: string
    selectOne: string
    // Under the date. From a document: the credit's number and its date ("Nov 12, 2026").
    dateBeforeCredit: string
    // DialogLoadError's text of the rows' read.
    loadFailed: string
    // The party's display name.
    empty: string
    // "Applying %s to %s · %s stays unapplied": the applied money, the row count text and
    // the fixed side's rest.
    summary: string
    // "Applied %s to %s": the applied money and the row count text.
    toast: string
    // The row count text: one row, and more rows with `%s` the count.
    rowsOne: string
    rowsMany: string
}

export type ApplyCreditTexts = {
    credit: ApplySideTexts
    // null for a kind that is applied only from the credit (the vendor credit).
    document: ApplySideTexts | null
    // The Remove confirm: the document's number, then the amount the credit gives back.
    removeBody: string
}

type EmptyAction = {
    testId: string
    label: string
    // A route under the org (`useOrgHref`): `party` is the credit's party, `id` the credit.
    href: (target: { party: string; id: string }) => string
}

export type CreditApplicationKind = {
    key: 'vendor_credit' | 'credit_memo'
    collection: 'books_vendor_credit_applications' | 'books_credit_memo_applications'
    creditField: 'vendor_credit' | 'credit_memo'
    documentField: 'bill' | 'invoice'
    creditNoun: 'Vendor credit' | 'Credit memo'
    documentNoun: 'Bill' | 'Invoice'
    // What a row names on the document's block, and on the credit's block.
    creditTarget: ApplicationTarget
    documentTarget: ApplicationTarget
    // The dialog's list from the credit, and from the document (null with no such use).
    outstanding: { credit: OutstandingDocument; document: OutstandingDocument | null }
    texts: ApplyCreditTexts
    helpTopic: `${string}:${string}`
    emptyActions: readonly EmptyAction[]
}

export const VENDOR_CREDIT_APPLICATION: CreditApplicationKind = {
    key: 'vendor_credit',
    collection: 'books_vendor_credit_applications',
    creditField: 'vendor_credit',
    documentField: 'bill',
    creditNoun: 'Vendor credit',
    documentNoun: 'Bill',
    creditTarget: 'credit',
    documentTarget: 'bill',
    outstanding: { credit: CREDIT_OUTSTANDING, document: null },
    texts: {
        credit: {
            title: 'Apply vendor credit %s',
            figureLabel: 'Unapplied credit',
            rowOverLimit: APPLY_CREDIT_MESSAGES.rowOverOpen,
            sumOverFixed: APPLY_CREDIT_MESSAGES.overUnapplied,
            selectOne: APPLY_CREDIT_MESSAGES.selectOne,
            dateBeforeCredit: APPLY_CREDIT_MESSAGES.dateBeforeCredit,
            loadFailed: APPLY_CREDIT_MESSAGES.loadFailed,
            empty: APPLY_CREDIT_MESSAGES.noOpenBills,
            summary: 'Applying %s to %s · %s stays unapplied',
            toast: 'Applied %s to %s',
            rowsOne: '1 bill',
            rowsMany: '%s bills',
        },
        document: null,
        removeBody: APPLY_CREDIT_MESSAGES.removeBody,
    },
    helpTopic: 'books:vendor-credits',
    emptyActions: [
        {
            testId: 'apply-credit-new-bill',
            label: 'New bill',
            href: ({ party }) => `books/bills/new?vendor=${party}`,
        },
        {
            testId: 'apply-credit-record-refund',
            label: 'Record refund',
            href: ({ party, id }) => `books/vendor-refunds/new?vendor=${party}&credit=${id}`,
        },
    ],
}

export const CREDIT_MEMO_APPLICATION: CreditApplicationKind = {
    key: 'credit_memo',
    collection: 'books_credit_memo_applications',
    creditField: 'credit_memo',
    documentField: 'invoice',
    creditNoun: 'Credit memo',
    documentNoun: 'Invoice',
    creditTarget: 'credit_memo',
    documentTarget: 'invoice',
    outstanding: { credit: MEMO_INVOICES_OUTSTANDING, document: INVOICE_CREDITS_OUTSTANDING },
    texts: {
        // Spec §3.2, §3.4: the credit memo fixed, the customer's open invoices the rows.
        credit: {
            title: 'Apply credit memo %s',
            figureLabel: 'Unapplied credit',
            rowOverLimit: 'More than the open balance of %s',
            sumOverFixed: 'More than the unapplied credit of %s.',
            selectOne: 'Select at least one invoice.',
            dateBeforeCredit: "The apply date can't be before the credit date.",
            loadFailed: 'Books could not load the open invoices.',
            empty: '%s has no open invoices. The credit stays on the customer until you post an invoice or refund it.',
            summary: 'Applying %s to %s · %s stays unapplied',
            toast: 'Applied %s to %s',
            rowsOne: '1 invoice',
            rowsMany: '%s invoices',
        },
        // Spec §3.3, §3.4: the invoice fixed, the customer's credit memos the rows.
        document: {
            title: 'Apply credit to invoice %s',
            figureLabel: 'Open balance',
            rowOverLimit: 'More than the unapplied credit of %s',
            sumOverFixed: 'More than the open balance of %s.',
            selectOne: 'Select at least one credit memo.',
            dateBeforeCredit:
                "The apply date can't be before the credit date of credit memo %s, %s.",
            loadFailed: "Books could not load the customer's credits.",
            empty: '%s has no unapplied credit.',
            summary: 'Applying %s from %s · %s stays due',
            toast: 'Applied %s from %s',
            rowsOne: '1 credit memo',
            rowsMany: '%s credit memos',
        },
        removeBody:
            "Remove this credit from Invoice %s? The invoice's balance goes up by %s and the credit is unapplied again.",
    },
    // Checkpoint 5 moves it to `books:apply-credit`, when that topic exists.
    helpTopic: 'books:credit-memos',
    emptyActions: [
        {
            testId: 'apply-credit-new-invoice',
            label: 'New invoice',
            href: ({ party }) => `books/invoices/new?customer=${party}`,
        },
        {
            testId: 'apply-credit-refund-credit',
            label: 'Refund credit',
            href: ({ id }) => `books/refund-receipts/new?credit_memo=${id}`,
        },
    ],
}

// The words of a record's Apply action, by its `kindFields.kind` (spec §3.1). Every other
// caller of the action (the purchase lists' row menu) keeps DOCUMENT_READ_LABELS.
export function applyCreditLabel(kind: string): string {
    if (kind === 'credit_memo') return 'Apply to invoices'
    if (kind === 'invoice') return 'Apply credit'
    return DOCUMENT_READ_LABELS.apply_credit
}

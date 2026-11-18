// The vendor refund's descriptor of the shared payment layer (vendor refund spec §3.1):
// the vendor as the party, Refunded to as the account, the vendor's unapplied credits as
// the open documents, `books_vendor_refunds` / `books_vendor_refund_lines` field names,
// the refund's routes, texts and test ids, and the 'exact' sum rule (a refund is on vendor
// credits in full, Q2).

import { formatMoney } from './money'
import { outstandingTexts, REFUND_OUTSTANDING } from './outstanding-documents'
import type { PaymentFlow, PaymentTotalLine, PaymentTotalsInput } from './payment-flow'
import { VENDOR_REFUND_CHROME } from './payment-kind'

// On vendor credits (the sum of the rows) and, only when it differs from Amount refunded,
// Not placed (the amount less the rows), strong in the danger tone (spec §3.4).
function vendorRefundTotals({
    amountCents,
    rowsCents,
    currency,
}: PaymentTotalsInput): PaymentTotalLine[] {
    const onCredits: PaymentTotalLine = {
        id: 'on-credits',
        label: 'On vendor credits',
        amount: formatMoney(rowsCents, currency),
        isStrong: false,
        isDanger: false,
        note: '',
    }
    if (amountCents === null || amountCents === rowsCents) return [onCredits]
    const notPlaced: PaymentTotalLine = {
        id: 'not-placed',
        label: 'Not placed',
        amount: formatMoney(amountCents - rowsCents, currency),
        isStrong: true,
        isDanger: true,
        note: '',
    }
    return [onCredits, notPlaced]
}

export const VENDOR_REFUND_FLOW: PaymentFlow = {
    key: 'vendor_refund',
    chrome: VENDOR_REFUND_CHROME,
    testId: 'vendor-refund',
    logContext: 'books.vendorRefund',
    routeBase: 'books/vendor-refunds',
    partyParam: 'vendor',
    documentParam: 'credit',
    partyRoute: 'books/vendors',
    doc: REFUND_OUTSTANDING,
    sumRule: 'exact',
    lineKey: 'lines',
    serverFields: { party: 'vendor', account: 'refunded_to' },
    // server/vendor_refunds.go checks a correction's original on every draft write.
    draftNeedsPostedOriginal: true,
    ids: {
        party: 'vendor',
        account: 'account',
        accountBalance: 'account-balance',
        listPrompt: 'list-prompt',
        listEmpty: 'list-empty',
        listLoading: 'list-loading',
        listError: 'list-error',
        sumError: 'sum-error',
        // No total line of the refund has a note.
        totalNote: 'total-note',
        memoText: 'memo-text',
    },
    texts: {
        newTitle: 'Vendor refund',
        draftTitle: 'Draft vendor refund',
        editTitle: number => `Edit vendor refund ${number}`,
        readTitle: number => `Vendor refund ${number}`,
        partyLabel: 'Vendor',
        partyPlaceholder: 'Choose a vendor',
        partySearchPlaceholder: 'Search vendors',
        partyEmpty: 'No active vendor matches',
        dateLabel: 'Refund date',
        accountLabel: 'Refunded to',
        amountLabel: 'Amount refunded',
        partyRequired: 'Choose a vendor',
        accountInvalid: 'Choose the account the refund arrived in',
        amountRequired: 'Enter the amount refunded',
        rowNegative: 'Enter a refund of 0 or more',
        listHeading: 'Unapplied vendor credits',
        listPrompt: 'Choose a vendor to see their unapplied credits.',
        listLoadingLabel: 'Loading unapplied vendor credits',
        listLoadFailed: 'Books could not load the vendor credits.',
        noDocuments: name =>
            `${name} has no unapplied vendor credit. Record the vendor credit first, then its refund.`,
        noDocumentsLabel: 'New vendor credit',
        noDocumentsHref: vendorId => `books/vendor-credits/new?vendor=${vendorId}`,
        clearLabel: 'Clear refunds',
        aboveOpen: open => `More than the unapplied credit of ${open}`,
        datedAfter: number => `Vendor credit ${number} is dated after the refund date.`,
        rowsAbove: (sum, amount) =>
            `The refunds add up to ${sum}, more than the ${amount} refunded`,
        rowsBelow: rest =>
            `${rest} of the refund is not on a vendor credit. Put it on a credit or lower the amount.`,
        memoLabel: 'Memo',
        memoHint: 'Only your team sees this. Saved as the journal entry memo.',
        loadFailed: 'Books could not load this vendor refund.',
        notFound: 'This vendor refund does not exist',
        noAccess: 'You need bookkeeper access to record vendor refunds',
        cannotEdit: 'This vendor refund cannot be edited',
        deleteDraftBody: "Delete this draft vendor refund? This can't be undone.",
        voidBody:
            'A reversing entry is posted in the original period. The number is kept. The vendor credits it refunded are unapplied again.',
        voidConfirm: 'Void vendor refund',
        voidNoun: 'vendor refund',
        payAllDescription: 'Refund every listed credit in full',
        clearDescription: 'Clear refunds',
        toggleRowDescription: 'Refund this credit in full, or clear it',
        readListHeading: outstandingTexts(REFUND_OUTSTANDING).appliedHeading,
        paymentVerb: 'refunded to',
        hasAppliedTotal: false,
    },
    // The receive-payment band's widths (plan reference choice 8).
    widths: { party: 320, date: 180, method: 180, reference: 220, account: 300, amount: 200 },
    totals: vendorRefundTotals,
}

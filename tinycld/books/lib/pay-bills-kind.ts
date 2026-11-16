// The shared document chrome of Pay Bills and of the bill payment read view: a bill
// payment is not a sales document kind, so it gives DocumentHeader and DocumentActionBar
// only the parts they read, through DocumentChromeContext (as PAYMENT_CHROME does). Every
// key of both is in the ⇧? group "Pay bills" (pay-bills spec §3.1).

import type { DocumentChrome } from '../components/documents/document-chrome'

export const PAY_BILLS_CHROME: DocumentChrome = {
    testId: 'pay-bills',
    shortcutGroup: 'Pay bills',
    figure: { label: 'Total payment', testId: 'figure' },
    helpTopic: 'books:pay-bills',
    lifecycle: 'posting',
}

export const BILL_PAYMENT_CHROME: DocumentChrome = {
    testId: 'bill-payment',
    shortcutGroup: 'Pay bills',
    figure: { label: 'Amount paid', testId: 'figure' },
    helpTopic: 'books:pay-bills',
    lifecycle: 'posting',
}

// The shared document chrome of the receive-payment screen: a payment is not a sales
// document kind (spec §2 Q1), so it gives DocumentHeader and DocumentActionBar only the
// parts they read, through DocumentChromeContext.

import type { DocumentChrome } from '../components/documents/document-chrome'

export const PAYMENT_CHROME: DocumentChrome = {
    testId: 'payment',
    shortcutGroup: 'Receive payment',
    figure: { label: 'Amount received', testId: 'figure' },
    helpTopic: 'books:receive-payment',
    lifecycle: 'posting',
}

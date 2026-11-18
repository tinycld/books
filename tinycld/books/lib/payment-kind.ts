// The shared document chrome of the receive-payment and vendor refund screens: neither is
// a sales or purchase document kind (receive-payment spec §2 Q1), so each gives
// DocumentHeader and DocumentActionBar only the parts they read, through
// DocumentChromeContext.

import type { DocumentChrome } from '../components/documents/document-chrome'

export const PAYMENT_CHROME: DocumentChrome = {
    testId: 'payment',
    shortcutGroup: 'Receive payment',
    figure: { label: 'Amount received', testId: 'figure' },
    helpTopic: 'books:receive-payment',
    lifecycle: 'posting',
}

// Vendor refund spec §3.2, §3.3: the ⇧? group and the big figure "Amount refunded".
export const VENDOR_REFUND_CHROME: DocumentChrome = {
    testId: 'vendor-refund',
    shortcutGroup: 'Vendor refund',
    figure: { label: 'Amount refunded', testId: 'figure' },
    helpTopic: 'books:vendor-refunds',
    lifecycle: 'posting',
}

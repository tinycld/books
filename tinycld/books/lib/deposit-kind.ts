// The shared document chrome of the deposit screen (bank deposit spec §3.2, §3.3): a deposit
// is no sales or purchase document kind, so it gives DocumentHeader, DocumentActionBar and
// DocumentReadActions only the parts they read, through DocumentChromeContext.

import type { DocumentChrome } from '../components/documents/document-chrome'
import { DEPOSIT_SHORTCUT_GROUP } from './deposit-shortcuts'

export const DEPOSIT_CHROME: DocumentChrome = {
    testId: 'deposit',
    shortcutGroup: DEPOSIT_SHORTCUT_GROUP,
    figure: { label: 'Deposit total', testId: 'figure' },
    helpTopic: 'books:bank-deposits',
    lifecycle: 'posting',
}

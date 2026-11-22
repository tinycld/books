// The deposit read view's keys (bank deposit spec §3.2): the letters of the documents' read
// views (DOCUMENT_READ_KEYS). Core's ⇧? list shows every registered key and ignores `when`,
// so a key is registered only while its action is offered (lib/deposit-read-actions.ts).

import type { DepositReadAction } from './deposit-read-actions'
import { DOCUMENT_READ_KEYS } from './document-actions'

// The ⇧? group of every deposit key.
export const DEPOSIT_SHORTCUT_GROUP = 'Bank deposit'

export const DEPOSIT_READ_KEYS: Record<DepositReadAction, string> = {
    edit: DOCUMENT_READ_KEYS.edit,
    void: DOCUMENT_READ_KEYS.void,
    entry: DOCUMENT_READ_KEYS.entry,
}

export const DEPOSIT_READ_DESCRIPTIONS: Record<DepositReadAction, string> = {
    edit: 'Edit',
    void: 'Void',
    entry: 'View journal entry',
}

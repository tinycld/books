// The shared document chrome of the inventory adjustment screen (inventory-adjust spec
// §3.2, §3.4): an adjustment is no sales or purchase document kind, so it gives
// DocumentHeader, DocumentActionBar and DocumentReadActions only the parts they read,
// through DocumentChromeContext. It has no big figure: before the post the cost of a
// decrease is the server's, so DocumentHeader draws none.

import type { DocumentChrome } from '../components/documents/document-chrome'

export const ADJUSTMENT_SHORTCUT_GROUP = 'Inventory adjustment'

export const ADJUSTMENT_CHROME: DocumentChrome = {
    testId: 'inventory-adjustment',
    shortcutGroup: ADJUSTMENT_SHORTCUT_GROUP,
    // books:inventory until the adjustment's own topic is written (checkpoint 9).
    helpTopic: 'books:inventory',
    lifecycle: 'posting',
}

// The noun of the kind in a sentence ("Delete this draft inventory adjustment?").
export const ADJUSTMENT_NOUN = 'inventory adjustment'

// "Inventory adjustment IA-5", or "New inventory adjustment" before it has a number.
export function adjustmentTitle(number: string): string {
    if (!number) return 'New inventory adjustment'
    return `Inventory adjustment ${number}`
}

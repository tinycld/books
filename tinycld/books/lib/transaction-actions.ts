import { NEW_ACTIONS, type NewAction } from './new-actions'
import type { DocumentPartyKey } from './sales-document-kinds'

export interface TransactionAction {
    id: string
    label: string
    testId: string
}

function takesParty(action: NewAction, party: DocumentPartyKey): boolean {
    const flag = party === 'customer' ? action.takesCustomer : action.takesVendor
    return flag === true
}

// A New transaction menu item's test id. A test id never holds an underscore.
export function transactionItemTestId(prefix: string, actionId: string): string {
    return `${prefix}-new-${actionId.replaceAll('_', '-')}`
}

// The party page's New transaction menu: the available actions that take the party
// (`takesCustomer` / `takesVendor`), in NEW_ACTIONS order. A later transaction joins the
// menu by its NEW_ACTIONS entry.
export function transactionActions(
    party: DocumentPartyKey,
    actions: readonly NewAction[] = NEW_ACTIONS
): TransactionAction[] {
    return actions
        .filter(action => takesParty(action, party) && action.available)
        .map(action => ({
            id: action.id,
            label: action.label,
            testId: transactionItemTestId(party, action.id),
        }))
}

// Where an action opens, for one party: `<href>?customer=<id>` or `<href>?vendor=<id>`.
// An unknown action, or one that does not take the party, is refused.
export function transactionHref(party: DocumentPartyKey, actionId: string, id: string): string {
    const action = NEW_ACTIONS.find(entry => entry.id === actionId)
    if (!action) throw new RangeError(`No new action "${actionId}".`)
    if (!takesParty(action, party)) {
        throw new RangeError(`The new action "${actionId}" does not take a ${party}.`)
    }
    return `${action.href}?${party}=${encodeURIComponent(id)}`
}

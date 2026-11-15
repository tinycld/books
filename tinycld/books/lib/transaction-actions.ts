import { NEW_ACTIONS, type NewAction } from './shell-nav'

export interface TransactionAction {
    id: string
    label: string
    testId: string
}

// The customer page's New transaction menu: the available actions that take a customer,
// in NEW_ACTIONS order. A later transaction joins the menu by its NEW_ACTIONS entry.
export function transactionActions(
    actions: readonly NewAction[] = NEW_ACTIONS
): TransactionAction[] {
    return actions
        .filter(action => action.takesCustomer === true && action.available)
        .map(action => ({
            id: action.id,
            label: action.label,
            // A test id never holds an underscore.
            testId: `customer-new-${action.id.replaceAll('_', '-')}`,
        }))
}

// Where an action opens, for one customer: `books/<kind>/new?customer=<id>`.
export function transactionHref(actionId: string, customerId: string): string {
    const action = NEW_ACTIONS.find(entry => entry.id === actionId)
    if (!action) throw new RangeError(`No new action "${actionId}".`)
    return `${action.href}?customer=${encodeURIComponent(customerId)}`
}

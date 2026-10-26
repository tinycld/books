// These strings mirror the refusals in server/customers.go so the screens can
// say the reason before the server has to. tests/customer-messages.test.ts
// fails if the server wording drifts.

export function duplicateNameMessage(name: string): string {
    return `A customer named “${name}” already exists here.`
}

export function activeSubCustomersMessage(count: number): string {
    if (count === 1) return 'This customer has 1 active sub-customer.'
    return `This customer has ${count} active sub-customers.`
}

// The parent picker's help text when the customer has sub-customers.
export const PARENT_LOCKED_MESSAGE = 'A customer with sub-customers cannot be a sub-customer.'

export const HAS_SUB_CUSTOMERS_TITLE = 'This customer has sub-customers'

export const SUB_CUSTOMERS_ACTIVE_FIRST = 'Make its sub-customers inactive first'

export const UNSAVED_DELETE_WARNING = 'Unsaved changes to this customer will be lost.'

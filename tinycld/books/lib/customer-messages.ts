import { extractValidationErrors } from '@tinycld/core/lib/errors'
import type { FormValues } from '@tinycld/core/lib/forms/logic'
import { notify } from '@tinycld/core/lib/notify/dispatcher'
import type { UseFormReturn } from 'react-hook-form'
import { messageOnlyRefusal } from './refusal'

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

/**
 * The `onError` of a customer save. A refusal with a message and no field (an
 * activation or delete rule, or a generic refusal such as a 403, 404 or 500; every
 * parent rule is refused on the `parent` field) goes on the form root, where the
 * renderer's summary shows it. Everything else goes to the host's handler, which puts
 * field refusals on their fields and shows any other failure (a network error) as a
 * toast.
 */
export function customerRefusalHandler(
    form: Pick<UseFormReturn<FormValues>, 'setError'>,
    hostOnError: (error: unknown) => void
): (error: unknown) => void {
    return error => {
        const message = messageOnlyRefusal(error)
        if (message === null) {
            hostOnError(error)
            return
        }
        form.setError('root', { type: 'server', message })
    }
}

export const CUSTOMER_NOT_SAVED = 'The customer was not saved.'

/**
 * The `onError` of a save whose form the user no longer sees: they left it while the
 * write was in flight. Only Cancel, the back button and Escape are disabled then; the
 * package rail, the tab bar, the search palette, another list row and the browser's or
 * hardware back still leave, and a form that was left can stay mounted out of sight. Its
 * message therefore becomes a toast. A failure with no message (a network error) goes to
 * the host's handler, which shows it as a toast already.
 */
export function closedCustomerRefusalHandler(
    hostOnError: (error: unknown) => void
): (error: unknown) => void {
    return error => {
        const fields = extractValidationErrors(error)
        const message =
            messageOnlyRefusal(error) ?? (fields ? Object.values(fields).join(' ') : null)
        if (message === null) {
            hostOnError(error)
            return
        }
        notify.emit({
            event: 'mutation.error',
            title: CUSTOMER_NOT_SAVED,
            body: message,
            data: { operation: 'books.customers.save', error: message },
        })
    }
}

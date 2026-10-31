import { extractValidationErrors } from '@tinycld/core/lib/errors'
import { notify } from '@tinycld/core/lib/notify/dispatcher'
import type { RefusalForm } from './record-save'
import { messageOnlyRefusal } from './refusal'

/**
 * The `onError` of a record save. A refusal with a message and no field (an activation
 * or delete rule, or a generic refusal such as a 403, 404 or 500) goes on the form root,
 * where the renderer's summary shows it. Everything else goes to the host's handler,
 * which puts field refusals on their fields and shows any other failure (a network
 * error) as a toast.
 */
export function recordRefusalHandler(
    form: RefusalForm,
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

/**
 * The one text a refusal shows where its fields cannot: its own message, else its field
 * messages joined. Null for a failure with no message (a network error).
 */
export function refusalMessage(error: unknown): string | null {
    const message = messageOnlyRefusal(error)
    if (message !== null) return message
    const fields = extractValidationErrors(error)
    return fields ? Object.values(fields).join(' ') : null
}

/**
 * The `onError` of a save whose form the user no longer sees: they left it while the
 * write was in flight. Only Cancel, the back button and Escape are disabled then; the
 * package rail, the tab bar, the search palette, another list row and the browser's or
 * hardware back still leave, and a form that was left can stay mounted out of sight. Its
 * message therefore becomes a toast. A failure with no message (a network error) goes to
 * the host's handler, which shows it as a toast already.
 */
export function closedRecordRefusalHandler(
    hostOnError: (error: unknown) => void,
    notSavedTitle: string,
    operation: string
): (error: unknown) => void {
    return error => {
        const message = refusalMessage(error)
        if (message === null) {
            hostOnError(error)
            return
        }
        notify.emit({
            event: 'mutation.error',
            title: notSavedTitle,
            body: message,
            data: { operation, error: message },
        })
    }
}

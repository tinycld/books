import { errorToString, extractValidationErrors } from '@tinycld/core/lib/errors'
import type { FormDefinition } from '@tinycld/core/lib/forms/definition'
import type { FormHostDef } from '@tinycld/core/lib/forms/host'
import { type EvalContext, evaluate, type FormValues } from '@tinycld/core/lib/forms/logic'
import { prepareValues } from '@tinycld/core/lib/forms/values'
import { notify } from '@tinycld/core/lib/notify/dispatcher'
import type { RefusalForm } from './record-save'
import { messageOnlyRefusal } from './refusal'

// The refusal keys of the fields the form does not show, asked when a save's answer
// arrives.
export type HiddenFields = () => ReadonlySet<string>

const NOTHING_HIDDEN: ReadonlySet<string> = new Set()
const nothingHidden: HiddenFields = () => NOTHING_HIDDEN

/**
 * The refusal keys of the fields the form does not show for these values: hidden by the
 * definition, by a rule, or with their page. The values are evaluated the way the
 * renderer evaluates them (computed values applied). A built-in field's refusal is keyed
 * by its column, which is its field key; a custom field's is keyed
 * `<fieldsColumn>.<key>`.
 */
export function hiddenRefusalKeys(
    host: FormHostDef,
    definition: FormDefinition | undefined,
    values: FormValues,
    context: EvalContext
): ReadonlySet<string> {
    if (!definition) return NOTHING_HIDDEN
    const state = evaluate(definition, prepareValues(definition, host, values), context)
    const hidden = definition.fields.filter(f => state.fields[f.key]?.visible === false)
    return new Set(
        hidden.map(f => (f.kind === 'builtin' ? f.key : `${host.fieldsColumn}.${f.key}`))
    )
}

// Splits the field refusals into the messages of hidden fields and the rest, which keep
// their keys for the host.
function splitByHidden(fields: Record<string, string>, hidden: ReadonlySet<string>) {
    const hiddenMessages: string[] = []
    const shown: Record<string, string> = {}
    for (const [key, message] of Object.entries(fields)) {
        if (hidden.has(key)) hiddenMessages.push(message)
        else shown[key] = message
    }
    return { hiddenMessages, shown }
}

/**
 * The `onError` of a record save. A refusal with a message and no field (an activation
 * or delete rule, or a generic refusal such as a 403, 404 or 500) goes on the form root,
 * where the renderer's summary shows it. So does a refusal on a field the form does not
 * show when the answer arrives (a rule can hide a field whose value is still sent): it
 * has no cell, and the record form's summary shows root errors only. Everything else
 * goes to the host's handler, which puts field refusals on their fields and shows any
 * other failure (a network error) as a toast.
 */
export function recordRefusalHandler(
    form: RefusalForm,
    hostOnError: (error: unknown) => void,
    hiddenFields: HiddenFields = nothingHidden
): (error: unknown) => void {
    return error => {
        const message = messageOnlyRefusal(error)
        if (message !== null) {
            form.setError('root', { type: 'server', message })
            return
        }
        const fields = extractValidationErrors(error)
        const { hiddenMessages, shown } = splitByHidden(fields ?? {}, hiddenFields())
        if (hiddenMessages.length === 0) {
            hostOnError(error)
            return
        }
        form.setError('root', { type: 'server', message: hiddenMessages.join(' ') })
        // The shown fields' refusals still land on their fields, in the shape the host's
        // handler reads (`errors` keyed as the server keyed them).
        if (Object.keys(shown).length > 0)
            hostOnError({ message: errorToString(error), errors: shown })
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

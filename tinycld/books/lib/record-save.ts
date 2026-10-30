import type { FormValues } from '@tinycld/core/lib/forms/logic'
import { log } from '@tinycld/core/lib/logger'
import type { UseFormReturn } from 'react-hook-form'
import type { ColumnsParse } from './record-columns'
import { closedRecordRefusalHandler, recordRefusalHandler } from './record-refusals'

export type RefusalForm = Pick<UseFormReturn<FormValues>, 'setError'>

// The form validates before the mutation starts, so for a moment after a press the
// mutation is not pending yet and a second press would write the record twice. The
// lock is a ref, so it holds from the first press without waiting for a render. `start`
// returns whether it started the mutation; the mutation's `onSettled` releases the lock
// when it did.
export async function runLocked(
    lock: { current: boolean },
    start: () => Promise<boolean>
): Promise<void> {
    if (lock.current) return
    lock.current = true
    let started = false
    try {
        started = await start()
    } finally {
        if (!started) lock.current = false
    }
}

// The form handed the save a value no column of the record holds: a bug, not a refusal,
// so it fails the press like any other throw before the write (`startFailed`).
export function columnsOrThrow<C>(
    parse: (columns: Record<string, unknown>) => ColumnsParse<C>,
    columns: Record<string, unknown>
): C {
    const parsed = parse(columns)
    if (!parsed.success) throw parsed.error
    return parsed.columns
}

// Something threw before the mutation started (the form's validation, its split, the
// column parse): a bug, not a refusal. Nothing was sent, so the form stays open with what
// was typed, and the root error tells the user the press did not save.
export function startFailed(
    error: unknown,
    form: RefusalForm,
    failure: { logContext: string; operation: string; clientSaveFailed: string }
): false {
    log.error(failure.logContext, error, { operation: failure.operation })
    form.setError('root', { type: 'client', message: failure.clientSaveFailed })
    return false
}

// A refusal lands on the form while the user still sees it, and becomes a toast when
// they left it during the write.
export function saveRefusalHandler(
    form: RefusalForm,
    hostOnError: (error: unknown) => void,
    isPresent: () => boolean,
    closed: { notSavedTitle: string; operation: string }
): (error: unknown) => void {
    const onForm = recordRefusalHandler(form, hostOnError)
    const onClosed = closedRecordRefusalHandler(hostOnError, closed.notSavedTitle, closed.operation)
    return error => {
        if (isPresent()) onForm(error)
        else onClosed(error)
    }
}

// The row a create inserts: the empty columns are the base, so a column the form left
// out is stored empty.
export function insertRow<C extends Record<string, unknown>>(
    emptyColumns: Required<C> & { inactive: boolean },
    columns: C,
    ids: { id: string; formId: string; fields: Record<string, unknown> }
): Required<C> & { inactive: boolean; id: string; form: string; fields: Record<string, unknown> } {
    return { ...emptyColumns, ...columns, id: ids.id, form: ids.formId, fields: ids.fields }
}

// An edit's update draft: the dirty columns, and the custom-field JSON only when a custom
// field changed.
export function applyPatch<C extends Record<string, unknown>>(
    draft: C & { fields: unknown },
    patch: Partial<C>,
    fields: Record<string, unknown>
): void {
    Object.assign(draft, patch)
    // Empty when no custom field changed: the stored JSON stays as it is.
    if (Object.keys(fields).length > 0) draft.fields = fields
}

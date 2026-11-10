import { extractValidationErrors } from '@tinycld/core/lib/errors'
import type { TableRowWrite, TableWritePlan } from '@tinycld/core/lib/forms/table-rows'
import { log } from '@tinycld/core/lib/logger'
import { performMutations, useMutation } from '@tinycld/core/lib/mutations'
import { notify } from '@tinycld/core/lib/notify/dispatcher'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { evictRows } from '@tinycld/core/lib/server-rows'
import { router, useNavigation } from 'expo-router'
import { newRecordId } from 'pbtsdb/core'
import { type RefObject, useRef } from 'react'
import type { ErrorOption } from 'react-hook-form'
import type { ViewInstance } from 'react-native'
import {
    EMPTY_INVOICE_COLUMNS,
    type InvoiceColumns,
    invoiceColumnsFrom,
} from '../lib/invoice-columns'
import { invoiceLineWriteSteps } from '../lib/invoice-line-order'
import { INVOICE_LINE_COLUMNS, INVOICE_LINE_MAPPER, INVOICE_ROW_KINDS } from '../lib/invoice-lines'
import { invoiceRefusalTarget, labelledLineRefusal } from '../lib/invoice-messages'
import { invoiceHref } from '../lib/invoice-routes'
import { invoiceTaxOf } from '../lib/invoice-tax'
import { invoiceLinesForSave } from '../lib/invoice-values'
import { refusalMessage } from '../lib/record-refusals'
import {
    columnsOrThrow,
    hasRecordChanges,
    type RefusalForm,
    runLocked,
    startFailed,
} from '../lib/record-save'
import { messageOnlyRefusal } from '../lib/refusal'
import { createTablePlans } from '../lib/table-writes'
import type { InvoiceFormState } from './useInvoiceForm'

const LOG_CONTEXT = 'books.invoice'
const NOT_SAVED_TITLE = 'Invoice not saved'
const CLIENT_SAVE_FAILED = 'Books could not save this invoice. Try again.'
const LINE_COLUMNS = { lines: INVOICE_LINE_COLUMNS }

// The cell a line's refusal shows under: the first cell its kind draws (core's table
// shows cell errors only, never one for a whole row).
function lineRefusalPath(form: InvoiceFormState['form'], index: number): string {
    const rows = form.getValues('lines')
    const kind = Array.isArray(rows) ? rows[index]?.kind : undefined
    const column = INVOICE_ROW_KINDS.find(k => k.key === kind)?.columns[0] ?? 'product'
    return `lines.${index}.${column}`
}

// Every server answer that is not a field the form shows goes to `root.server`: the
// screen's own summary shows it once. `root` itself is not used, because each of the
// screen's three renderers would show it.
function rootServerForm(form: InvoiceFormState['form']): RefusalForm {
    return { setError: (_name, error) => form.setError('root.server', error) }
}

type Refused = { error: unknown; rowLabel: string | null }

/**
 * Where a refusal of an invoice save shows: "Line n: …" under that line, a customer,
 * due date or tax text under its field, any other text in the screen's summary, field
 * errors under their fields (a key the form does not show joins the summary), and a
 * failure with no message (a network error) as the host's toast.
 */
function showRefusal(state: InvoiceFormState, onError: (error: unknown) => void, refused: Refused) {
    const { form } = state
    const root = rootServerForm(form)
    const server = (message: string): ErrorOption => ({ type: 'server', message })
    const message = messageOnlyRefusal(refused.error)
    if (message !== null) {
        const text = labelledLineRefusal(refused.rowLabel, message)
        const target = invoiceRefusalTarget(text)
        if (typeof target === 'object')
            form.setError(lineRefusalPath(form, target.line), server(text))
        else if (target === 'root') root.setError('root', server(text))
        else form.setError(target, server(text))
        return
    }
    const fields = extractValidationErrors(refused.error)
    if (fields === null) {
        onError(refused.error)
        return
    }
    const shown = new Set(state.definition?.fields.map(f => f.key) ?? [])
    const unshown: string[] = []
    for (const [key, text] of Object.entries(fields)) {
        if (shown.has(key)) form.setError(key, server(text))
        else unshown.push(labelledLineRefusal(refused.rowLabel, text))
    }
    if (unshown.length > 0) root.setError('root', server(unshown.join(' ')))
}

// A refusal that arrives after the user left the form: logged, and a toast.
function showClosedRefusal(onError: (error: unknown) => void, refused: Refused) {
    const message = refusalMessage(refused.error)
    log.warn(LOG_CONTEXT, 'save refused after the form was left', {
        message,
        row: refused.rowLabel,
    })
    if (message === null) {
        onError(refused.error)
        return
    }
    const body = labelledLineRefusal(refused.rowLabel, message)
    notify.emit({
        event: 'mutation.error',
        title: NOT_SAVED_TITLE,
        body,
        data: { operation: `${LOG_CONTEXT}.save`, error: body },
    })
}

// Whether the user still sees this form when a save's answer arrives: the surface is
// mounted and its screen focused (useRecordSave's presence check).
function usePresence(surfaceRef: RefObject<ViewInstance | null>) {
    const navigation = useNavigation()
    return () => surfaceRef.current !== null && navigation.isFocused()
}

// The line writes of a save, in an order the server accepts one write at a time
// (invoiceLineWriteSteps), against the lines as stored and the header tax being saved.
function useLineWrites(state: InvoiceFormState) {
    const [linesCollection] = useStore('books_invoice_lines')
    return (invoiceId: string, plan: TableWritePlan | undefined) => {
        const taxRate = state.form.getValues('tax_rate')
        const { tax } = invoiceTaxOf(state.taxRows, typeof taxRate === 'string' ? taxRate : '')
        const ops = {
            insert: (write: TableRowWrite) =>
                linesCollection.insert({
                    id: write.row.id,
                    invoice: invoiceId,
                    ...INVOICE_LINE_MAPPER.toRecord(write.row, write.position),
                }),
            update: (write: TableRowWrite) =>
                linesCollection.update(write.row.id, draft => {
                    Object.assign(draft, INVOICE_LINE_MAPPER.toRecord(write.row, write.position))
                }),
            remove: (id: string) => linesCollection.delete(id),
        }
        const storedLines = state.isNew ? [] : state.storedLines
        return invoiceLineWriteSteps({ storedLines, plan, tax, ops }).map(step => ({
            label: step.itemNumber === null ? null : `Line ${step.itemNumber}`,
            run: step.run,
        }))
    }
}

// How far a save got: whether the invoice row was inserted, the line being written, and
// whether an inserted invoice was deleted again after a line was refused.
type Progress = { inserted: boolean; rowLabel: string | null; undone: boolean }

// A new invoice whose line was refused is deleted again (its stored lines go with it, by
// the relation's cascade), so the new form stays the only copy and a second Save inserts
// it once. The line rows the save wrote leave the store at once, as the form will insert
// them again with the same ids. False when the delete fails: the draft then stays.
function useUndoInsert() {
    const [invoicesCollection, linesCollection] = useStore('books_invoices', 'books_invoice_lines')
    return async (id: string, plan: TableWritePlan | undefined) => {
        try {
            await performMutations(function* () {
                yield invoicesCollection.delete(id)
            })
        } catch (error) {
            log.warn(LOG_CONTEXT, 'a new invoice whose line was refused could not be deleted', {
                invoice: id,
                error: String(error),
            })
            return false
        }
        const lineIds = plan?.insert.map(write => write.row.id) ?? []
        if (lineIds.length > 0) evictRows(linesCollection, lineIds, LOG_CONTEXT)
        return true
    }
}

/**
 * Save draft on the invoice form. A new invoice inserts its row, then its lines one at a
 * time, then the route becomes the draft's own; a refused line deletes the new invoice
 * again and the form stays new, with the refusal under that line; a saved draft writes its dirty columns
 * and its line plan and stays. The empty trailing Item line is dropped before the form
 * validates (spec: dropped at save). Post is checkpoint 5's.
 */
export function useInvoiceSave(state: InvoiceFormState) {
    const [invoicesCollection] = useStore('books_invoices')
    const orgHref = useOrgHref()
    const surfaceRef = useRef<ViewInstance>(null)
    const isPresent = usePresence(surfaceRef)
    const lineWrites = useLineWrites(state)
    const undoInsert = useUndoInsert()
    const lock = useRef(false)
    const onError = state.isNew ? state.create.onError : state.edit.onError

    const refuse = (refused: Refused) => {
        if (isPresent()) showRefusal(state, onError, refused)
        else showClosedRefusal(onError, refused)
    }

    const insert = useMutation({
        mutationFn: async (input: {
            id: string
            columns: InvoiceColumns
            formId: string
            fields: Record<string, unknown>
            plans: Record<string, TableWritePlan>
            progress: Progress
        }) => {
            await performMutations(function* () {
                yield invoicesCollection.insert({
                    ...EMPTY_INVOICE_COLUMNS,
                    ...input.columns,
                    id: input.id,
                    form: input.formId,
                    fields: input.fields,
                })
            })
            input.progress.inserted = true
            try {
                await performMutations(function* () {
                    for (const write of lineWrites(input.id, input.plans.lines)) {
                        input.progress.rowLabel = write.label
                        yield write.run()
                    }
                })
            } catch (error) {
                input.progress.undone = await undoInsert(input.id, input.plans.lines)
                throw error
            }
        },
        onSuccess: (_data, { id }) => {
            state.create.form.reset(state.create.form.getValues())
            if (isPresent()) router.replace(orgHref(invoiceHref(id)))
        },
        onError: (error, { id, progress }) => {
            // A line was refused and the draft could not be taken back: its own route
            // shows what was written, and the refusal becomes a toast, since a second
            // Save on this new form would insert the invoice again.
            if (progress.inserted && !progress.undone) {
                showClosedRefusal(onError, { error, rowLabel: progress.rowLabel })
                if (isPresent()) router.replace(orgHref(invoiceHref(id)))
                return
            }
            // Nothing is stored: the new form stays with the refusal where it belongs,
            // and the next Save inserts the invoice once.
            refuse({ error, rowLabel: progress.rowLabel })
        },
        onSettled: () => {
            lock.current = false
        },
    })

    const update = useMutation({
        mutationFn: function* (input: {
            id: string
            patch: InvoiceColumns
            fields: Record<string, unknown>
            written: Record<string, unknown>
            plans: Record<string, TableWritePlan>
            progress: Progress
        }) {
            if (hasRecordChanges(input.patch, input.fields)) {
                yield invoicesCollection.update(input.id, draft => {
                    Object.assign(draft, input.patch)
                    if (Object.keys(input.fields).length > 0) draft.fields = input.fields
                })
            }
            for (const write of lineWrites(input.id, input.plans.lines)) {
                input.progress.rowLabel = write.label
                yield write.run()
            }
        },
        onSuccess: (_data, { written }) => state.edit.markSaved(written),
        onError: (error, { progress }) => refuse({ error, rowLabel: progress.rowLabel }),
        onSettled: () => {
            lock.current = false
        },
    })

    const dropEmptyLine = () => {
        const lines = state.form.getValues('lines')
        if (!Array.isArray(lines)) return
        const kept = invoiceLinesForSave(lines)
        if (kept.length !== lines.length) state.form.setValue('lines', kept, { shouldDirty: true })
    }

    const startCreate = async () => {
        const split = await state.create.submit()
        if (!split) return false
        const columns = columnsOrThrow(invoiceColumnsFrom, split.columns)
        insert.mutate({
            id: newRecordId(),
            columns,
            formId: state.create.formId,
            fields: split.fields,
            plans: createTablePlans(split.tables, LINE_COLUMNS),
            progress: { inserted: false, rowLabel: null, undone: false },
        })
        return true
    }

    const startUpdate = async (id: string) => {
        const result = await state.edit.patch()
        if (!result) return false
        // Nothing changed: there is nothing to write.
        if (Object.keys(result.written).length === 0) return false
        update.mutate({
            id,
            patch: columnsOrThrow(invoiceColumnsFrom, result.columns),
            fields: result.fields,
            written: result.written,
            plans: result.tableWrites,
            progress: { inserted: true, rowLabel: null, undone: false },
        })
        return true
    }

    const start = async () => {
        // A new answer from the server replaces the last one.
        state.form.clearErrors('root')
        try {
            dropEmptyLine()
            const id = state.recordId
            return id === undefined ? await startCreate() : await startUpdate(id)
        } catch (error) {
            return startFailed(error, rootServerForm(state.form), {
                logContext: LOG_CONTEXT,
                operation: state.isNew ? 'create' : 'update',
                clientSaveFailed: CLIENT_SAVE_FAILED,
            })
        }
    }

    return {
        saveDraft: () => runLocked(lock, start),
        // Post and Post & new are checkpoint 5's; until then the form has no Post.
        post: async (_andNew: boolean) => {},
        isSaving: insert.isPending || update.isPending,
        surfaceRef,
    }
}

export type InvoiceSave = ReturnType<typeof useInvoiceSave>

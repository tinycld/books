import { extractValidationErrors } from '@tinycld/core/lib/errors'
import {
    planTableWrites,
    type TableRowWrite,
    type TableWritePlan,
} from '@tinycld/core/lib/forms/table-rows'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { log } from '@tinycld/core/lib/logger'
import { performMutations, useMutation } from '@tinycld/core/lib/mutations'
import { notify } from '@tinycld/core/lib/notify/dispatcher'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { evictRows } from '@tinycld/core/lib/server-rows'
import { router, useNavigation } from 'expo-router'
import { newRecordId } from 'pbtsdb/core'
import { type RefObject, useRef, useState } from 'react'
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
import { invoiceHref, invoiceNewHref } from '../lib/invoice-routes'
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
import { useInvoiceSaveStore } from '../stores/invoice-save-store'
import type { InvoiceFormState } from './useInvoiceForm'

const LOG_CONTEXT = 'books.invoice'
const NOT_SAVED_TITLE = 'Invoice not saved'
const CLIENT_SAVE_FAILED = 'Books could not save this invoice. Try again.'
const LINE_COLUMNS = { lines: INVOICE_LINE_COLUMNS }

/**
 * Where Post & new goes: a fresh new form (its `fresh` nonce mounts a new one even from
 * `new`), keeping `?customer` only when this form was opened with it.
 */
export function postAndNewHref(openedWithCustomer: string | undefined): string {
    return invoiceNewHref({ fresh: newRecordId(), customer: openedWithCustomer })
}

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

type StoredLines = Parameters<typeof invoiceLineWriteSteps>[0]['storedLines']

// The lines as a save stores them, for the next save's line plan.
function storedLinesOf(rows: readonly TableRow[]): StoredLines {
    return rows.map((row, position) => ({
        id: row.id,
        ...INVOICE_LINE_MAPPER.toRecord(row, position),
    }))
}

// The line writes of a save, in an order the server accepts one write at a time
// (invoiceLineWriteSteps), against the lines as stored and the header tax being saved.
function useLineWrites(state: InvoiceFormState) {
    const [linesCollection] = useStore('books_invoice_lines')
    return (invoiceId: string, plan: TableWritePlan | undefined, storedLines: StoredLines) => {
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
        return invoiceLineWriteSteps({ storedLines, plan, tax, ops }).map(step => ({
            label: step.itemNumber === null ? null : `Line ${step.itemNumber}`,
            run: step.run,
        }))
    }
}

// How far a save got: whether the invoice row was inserted, the line being written,
// whether an inserted invoice was deleted again after a line was refused, and whether the
// draft (row and lines) was fully written, so a refused post leaves a draft behind.
type Progress = { inserted: boolean; rowLabel: string | null; undone: boolean; drafted: boolean }

// What a save does after the draft is written: Save draft stops there; Post sets the
// status; Post & new then opens a fresh form.
type SaveMode = { post: boolean; andNew: boolean }

const SAVE_DRAFT: SaveMode = { post: false, andNew: false }

function newProgress(inserted: boolean): Progress {
    return { inserted, rowLabel: null, undone: false, drafted: false }
}

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

// The draft a new form wrote before its post was refused: the form stays on `new` with
// the refusal, and its next save updates this invoice instead of inserting another.
type Written = { id: string; rows: TableRow[] }

/**
 * Save draft, Post and Post & new on the invoice form.
 *
 * - A new invoice inserts its row, then its lines one at a time; a refused line deletes
 *   the new invoice again and the form stays new, with the refusal under that line.
 *   Save draft then replaces the route with the draft's own.
 * - A saved draft writes its dirty columns and its line plan and stays.
 * - Post writes the draft as above, then sets `status: 'posted'`. The save store holds
 *   the invoice from before the first write until the post settles, so the optimistic
 *   status does not swap the form for the read view. A refused status write leaves the
 *   draft written and shows the refusal on the form; a new form then updates that draft.
 *   A post from `new` opens the read view; on a saved draft the screen shows it once the
 *   post is confirmed. Post & new opens a fresh form.
 *
 * The empty trailing Item line is dropped before the form validates (spec: dropped at
 * save); Post validates with the `post` mode of the record schema, which adds its rule.
 */
export function useInvoiceSave(state: InvoiceFormState) {
    const [invoicesCollection] = useStore('books_invoices')
    const orgHref = useOrgHref()
    const surfaceRef = useRef<ViewInstance>(null)
    const isPresent = usePresence(surfaceRef)
    const lineWrites = useLineWrites(state)
    const undoInsert = useUndoInsert()
    const lock = useRef(false)
    // The draft a new form wrote. State, not a ref: its id also titles the form ("Draft
    // invoice") and offers Delete draft, and the next save is pressed after the render
    // this sets, so it reads the written draft.
    const [written, setWritten] = useState<Written | null>(null)
    const onError = state.isNew ? state.create.onError : state.edit.onError

    const refuse = (refused: Refused) => {
        if (isPresent()) showRefusal(state, onError, refused)
        else showClosedRefusal(onError, refused)
    }

    const release = (id: string) => useInvoiceSaveStore.getState().release(id)

    const setPosted = (id: string, progress: Progress) => {
        // The status write is no line's: its refusal gets no "Line n" label.
        progress.rowLabel = null
        return invoicesCollection.update(id, draft => {
            draft.status = 'posted'
        })
    }

    // Where the form goes after a save: Post & new to a fresh form; a save from `new` to
    // the invoice's own route; a saved draft stays (a post shows its read view there).
    const navigateAfter = (id: string, mode: SaveMode) => {
        if (!isPresent()) return
        if (mode.andNew) router.replace(orgHref(postAndNewHref(state.openedWithCustomer)))
        else if (state.isNew) router.replace(orgHref(invoiceHref(id)))
    }

    // The new form's values are now stored: they become its baseline, and its next save
    // updates this invoice.
    const markWritten = (id: string, rows: TableRow[]) => {
        setWritten({ id, rows })
        state.create.form.reset(state.create.form.getValues())
    }

    const insert = useMutation({
        mutationFn: async (input: {
            id: string
            columns: InvoiceColumns
            replaces: string
            formId: string
            fields: Record<string, unknown>
            plans: Record<string, TableWritePlan>
            rows: TableRow[]
            mode: SaveMode
            progress: Progress
        }) => {
            await performMutations(function* () {
                yield invoicesCollection.insert({
                    ...EMPTY_INVOICE_COLUMNS,
                    ...input.columns,
                    replaces: input.replaces,
                    id: input.id,
                    form: input.formId,
                    fields: input.fields,
                })
            })
            input.progress.inserted = true
            try {
                await performMutations(function* () {
                    for (const write of lineWrites(input.id, input.plans.lines, [])) {
                        input.progress.rowLabel = write.label
                        yield write.run()
                    }
                })
            } catch (error) {
                input.progress.undone = await undoInsert(input.id, input.plans.lines)
                throw error
            }
            input.progress.drafted = true
            if (!input.mode.post) return
            await performMutations(function* () {
                yield setPosted(input.id, input.progress)
            })
        },
        onSuccess: (_data, { id, mode }) => {
            state.create.form.reset(state.create.form.getValues())
            navigateAfter(id, mode)
        },
        onError: (error, { id, rows, progress }) => {
            // The draft is written and its post was refused: it stays, and the refusal
            // shows on this form, whose next save updates it.
            if (progress.drafted) {
                markWritten(id, rows)
                refuse({ error, rowLabel: progress.rowLabel })
                return
            }
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
        onSettled: (_data, _error, { id }) => {
            lock.current = false
            release(id)
        },
    })

    const update = useMutation({
        mutationFn: function* (input: {
            id: string
            patch: InvoiceColumns
            fields: Record<string, unknown>
            plans: Record<string, TableWritePlan>
            storedLines: StoredLines
            // Makes the written values the form's baseline.
            onDrafted: () => void
            mode: SaveMode
            progress: Progress
        }) {
            if (hasRecordChanges(input.patch, input.fields)) {
                yield invoicesCollection.update(input.id, draft => {
                    Object.assign(draft, input.patch)
                    if (Object.keys(input.fields).length > 0) draft.fields = input.fields
                })
            }
            for (const write of lineWrites(input.id, input.plans.lines, input.storedLines)) {
                input.progress.rowLabel = write.label
                yield write.run()
            }
            input.progress.drafted = true
            if (input.mode.post) yield setPosted(input.id, input.progress)
        },
        onSuccess: (_data, { id, onDrafted, mode }) => {
            onDrafted()
            navigateAfter(id, mode)
        },
        onError: (error, { onDrafted, progress }) => {
            if (progress.drafted) onDrafted()
            refuse({ error, rowLabel: progress.rowLabel })
        },
        onSettled: (_data, _error, { id }) => {
            lock.current = false
            release(id)
        },
    })

    const dropEmptyLine = () => {
        const lines = state.form.getValues('lines')
        if (!Array.isArray(lines)) return
        const kept = invoiceLinesForSave(lines)
        if (kept.length !== lines.length) state.form.setValue('lines', kept, { shouldDirty: true })
    }

    // A post holds the invoice before its first write (set synchronously, so the very
    // render the optimistic write triggers sees it); the mutation releases it.
    const holdFor = (id: string, mode: SaveMode) => {
        if (mode.post) useInvoiceSaveStore.getState().hold(id)
    }

    const startCreate = async (mode: SaveMode) => {
        const split = await state.create.submit()
        if (!split) return false
        const columns = columnsOrThrow(invoiceColumnsFrom, split.columns)
        const id = newRecordId()
        holdFor(id, mode)
        insert.mutate({
            id,
            columns,
            replaces: state.replaces,
            formId: state.create.formId,
            fields: split.fields,
            plans: createTablePlans(split.tables, LINE_COLUMNS),
            rows: split.tables.lines ?? [],
            mode,
            progress: newProgress(false),
        })
        return true
    }

    // A new form whose draft is already written (a refused post): every column and the
    // lines against the ones it wrote.
    const startWrittenUpdate = async (draft: Written, mode: SaveMode) => {
        const split = await state.create.submit()
        if (!split) return false
        const rows = split.tables.lines ?? []
        holdFor(draft.id, mode)
        update.mutate({
            id: draft.id,
            patch: columnsOrThrow(invoiceColumnsFrom, split.columns),
            fields: split.fields,
            plans: { lines: planTableWrites(draft.rows, rows, INVOICE_LINE_COLUMNS) },
            storedLines: storedLinesOf(draft.rows),
            onDrafted: () => markWritten(draft.id, rows),
            mode,
            progress: newProgress(true),
        })
        return true
    }

    const startUpdate = async (id: string, mode: SaveMode) => {
        const result = await state.edit.patch()
        if (!result) return false
        // Nothing changed: a draft save has nothing to write; a post sets only the status.
        if (!mode.post && Object.keys(result.written).length === 0) return false
        holdFor(id, mode)
        update.mutate({
            id,
            patch: columnsOrThrow(invoiceColumnsFrom, result.columns),
            fields: result.fields,
            plans: result.tableWrites,
            storedLines: state.storedLines,
            onDrafted: () => state.edit.markSaved(result.written),
            mode,
            progress: newProgress(true),
        })
        return true
    }

    const startSave = (mode: SaveMode) => {
        const id = state.recordId
        if (id !== undefined) return startUpdate(id, mode)
        const draft = written
        return draft ? startWrittenUpdate(draft, mode) : startCreate(mode)
    }

    const start = async (mode: SaveMode) => {
        // A new answer from the server replaces the last one.
        state.form.clearErrors('root')
        try {
            dropEmptyLine()
            // Post validates with its own rule added (at least one Item line); the
            // record schema reads the mode when it runs.
            if (mode.post) state.saveMode.current = 'post'
            try {
                return await startSave(mode)
            } finally {
                state.saveMode.current = 'draft'
            }
        } catch (error) {
            return startFailed(error, rootServerForm(state.form), {
                logContext: LOG_CONTEXT,
                operation: state.isNew ? 'create' : 'update',
                clientSaveFailed: CLIENT_SAVE_FAILED,
            })
        }
    }

    return {
        saveDraft: () => runLocked(lock, () => start(SAVE_DRAFT)),
        post: (andNew: boolean) => runLocked(lock, () => start({ post: true, andNew })),
        isSaving: insert.isPending || update.isPending,
        writtenId: written?.id ?? null,
        surfaceRef,
    }
}

export type InvoiceSave = ReturnType<typeof useInvoiceSave>

import { extractValidationErrors } from '@tinycld/core/lib/errors'
import type { FormDefinition } from '@tinycld/core/lib/forms/definition'
import { planTableWrites, type TableWritePlan } from '@tinycld/core/lib/forms/table-rows'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { log } from '@tinycld/core/lib/logger'
import { performMutations, useMutation } from '@tinycld/core/lib/mutations'
import { notify } from '@tinycld/core/lib/notify/dispatcher'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router, useNavigation } from 'expo-router'
import { newRecordId } from 'pbtsdb/core'
import { type RefObject, useRef, useState } from 'react'
import type { ErrorOption } from 'react-hook-form'
import type { ViewInstance } from 'react-native'
import {
    DOCUMENT_LINE_COLUMNS,
    DOCUMENT_LINE_MAPPER,
    DOCUMENT_ROW_KINDS,
} from '../lib/document-line-columns'
import { documentLineWriteSteps } from '../lib/document-line-order'
import {
    type DocumentRefusalTarget,
    documentRefusalTarget,
    labelledLineRefusal,
} from '../lib/document-messages'
import { type DocumentTab, documentHref, documentNewHref } from '../lib/document-routes'
import { documentTaxOf } from '../lib/document-tax'
import { documentLinesForSave } from '../lib/document-values'
import { type HiddenFields, hiddenRefusalKeys, refusalMessage } from '../lib/record-refusals'
import {
    columnsOrThrow,
    hasRecordChanges,
    type RefusalForm,
    runLocked,
    startFailed,
} from '../lib/record-save'
import { messageOnlyRefusal } from '../lib/refusal'
import type { SalesDocumentKind } from '../lib/sales-document-kinds'
import { createTablePlans } from '../lib/table-writes'
import { useDocumentSaveStore } from '../stores/document-save-store'
import type { DocumentWrites } from './document-data'
import type { DocumentFormState } from './useDocumentForm'

const LINE_COLUMNS = { lines: DOCUMENT_LINE_COLUMNS }

// The kind's words of a save: its log context, the toast title of a refusal that came
// after the user left, and the root error of a press that failed before it was sent.
function saveTexts(kind: SalesDocumentKind) {
    const thisNoun = kind.thisNoun.charAt(0).toLowerCase() + kind.thisNoun.slice(1)
    return {
        logContext: `books.${kind.key}`,
        notSavedTitle: `${kind.noun} not saved`,
        clientSaveFailed: `Books could not save ${thisNoun}. Try again.`,
    }
}

type SaveTexts = ReturnType<typeof saveTexts>

/**
 * Where Post & new goes: a fresh new form of the kind (its `fresh` nonce mounts a new one
 * even from `new`), keeping `?customer` only when this form was opened with it.
 */
export function postAndNewHref(
    kind: Pick<SalesDocumentKind, 'routeBase'>,
    openedWithCustomer: string | undefined
): string {
    return documentNewHref(kind, { fresh: newRecordId(), customer: openedWithCustomer })
}

// The cell a line's refusal shows under: the first cell its kind draws (core's table
// shows cell errors only, never one for a whole row).
function lineRefusalPath(form: DocumentFormState['form'], index: number): string {
    const rows = form.getValues('lines')
    const kind = Array.isArray(rows) ? rows[index]?.kind : undefined
    const column = DOCUMENT_ROW_KINDS.find(k => k.key === kind)?.columns[0] ?? 'product'
    return `lines.${index}.${column}`
}

// Every server answer that is not a field the form shows goes to `root.server`: the
// screen's own summary shows it once. `root` itself is not used, because each of the
// screen's three renderers would show it.
function rootServerForm(form: DocumentFormState['form']): RefusalForm {
    return { setError: (_name, error) => form.setError('root.server', error) }
}

type Refused = { error: unknown; rowLabel: string | null }

// The field a text refusal names, or null for the summary: a target the form does not
// draw when the answer arrives has no cell.
function refusalFieldOf(
    form: DocumentFormState['form'],
    target: DocumentRefusalTarget,
    isDrawn: (key: string) => boolean
): string | null {
    if (target === 'root') return null
    if (typeof target === 'object') {
        return isDrawn('lines') ? lineRefusalPath(form, target.line) : null
    }
    return isDrawn(target) ? target : null
}

/**
 * Where a refusal of a document save shows: "Line n: …" under that line, a customer,
 * date, due date, tax or Deposit to text under its field, any other text in the screen's
 * summary, field errors under their fields, and a failure with no message (a network
 * error) as the host's toast. A refusal of a field the form does not draw when the answer
 * arrives (not in the definition, or hidden by it or a rule; `hiddenFields`, as
 * recordRefusalHandler) joins the summary.
 */
function showRefusal(
    state: DocumentFormState,
    onError: (error: unknown) => void,
    refused: Refused,
    hiddenFields: HiddenFields
) {
    const { form } = state
    const root = rootServerForm(form)
    const server = (message: string): ErrorOption => ({ type: 'server', message })
    const hidden = hiddenFields()
    const inDefinition = new Set(state.definition?.fields.map(f => f.key) ?? [])
    const isDrawn = (key: string) => inDefinition.has(key) && !hidden.has(key)
    const message = messageOnlyRefusal(refused.error)
    if (message !== null) {
        const text = labelledLineRefusal(refused.rowLabel, message)
        const field = refusalFieldOf(form, documentRefusalTarget(text, state.kind), isDrawn)
        if (field === null) root.setError('root', server(text))
        else form.setError(field, server(text))
        return
    }
    const fields = extractValidationErrors(refused.error)
    if (fields === null) {
        onError(refused.error)
        return
    }
    const unshown: string[] = []
    for (const [key, text] of Object.entries(fields)) {
        if (isDrawn(key)) form.setError(key, server(text))
        else unshown.push(labelledLineRefusal(refused.rowLabel, text))
    }
    if (unshown.length > 0) root.setError('root', server(unshown.join(' ')))
}

// Asked when a save's answer arrives, from the values the form holds then (useRecordSave's
// hiddenFieldsOf): the fields the rendered definition hides, by itself or by a rule. A
// sales receipt's rendered definition hides `deposit_to` while "Sales deposited to" names
// an account (useDocumentForm), so its refusal joins the summary then.
function hiddenFieldsOf(state: DocumentFormState, definition?: FormDefinition): HiddenFields {
    return () =>
        hiddenRefusalKeys(
            state.host,
            definition ?? state.definition,
            state.form.getValues(),
            state.context
        )
}

// A refusal that arrives after the user left the form: logged, and a toast.
function showClosedRefusal(texts: SaveTexts, onError: (error: unknown) => void, refused: Refused) {
    const message = refusalMessage(refused.error)
    log.warn(texts.logContext, 'save refused after the form was left', {
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
        title: texts.notSavedTitle,
        body,
        data: { operation: `${texts.logContext}.save`, error: body },
    })
}

// Whether the user still sees this form when a save's answer arrives: the surface is
// mounted and its screen focused (useRecordSave's presence check).
function usePresence(surfaceRef: RefObject<ViewInstance | null>) {
    const navigation = useNavigation()
    return () => surfaceRef.current !== null && navigation.isFocused()
}

type StoredLines = Parameters<typeof documentLineWriteSteps>[0]['storedLines']

// The lines as a save stores them, for the next save's line plan.
function storedLinesOf(rows: readonly TableRow[]): StoredLines {
    return rows.map((row, position) => ({
        id: row.id,
        ...DOCUMENT_LINE_MAPPER.toRecord(row, position),
    }))
}

// The line writes of a save, in an order the server accepts one write at a time
// (documentLineWriteSteps), against the lines as stored and the header tax being saved.
function lineWritesOf(state: DocumentFormState, writes: DocumentWrites) {
    return (documentId: string, plan: TableWritePlan | undefined, storedLines: StoredLines) => {
        const taxRate = state.form.getValues('tax_rate')
        const { tax } = documentTaxOf(state.taxRows, typeof taxRate === 'string' ? taxRate : '')
        const ops = writes.lineOps(documentId)
        return documentLineWriteSteps({ storedLines, plan, tax, ops }).map(step => ({
            label: step.itemNumber === null ? null : `Line ${step.itemNumber}`,
            run: step.run,
        }))
    }
}

// How far a save got: whether the document row was inserted, the line being written,
// whether an inserted document was deleted again after a line was refused, and whether
// the draft (row and lines) was fully written, so a refused post leaves a draft behind.
type Progress = { inserted: boolean; rowLabel: string | null; undone: boolean; drafted: boolean }

// What a save does after the draft is written: Save draft stops there; Post sets the
// status; Post & new then opens a fresh form.
type SaveMode = { post: boolean; andNew: boolean }

const SAVE_DRAFT: SaveMode = { post: false, andNew: false }

function newProgress(inserted: boolean): Progress {
    return { inserted, rowLabel: null, undone: false, drafted: false }
}

// A new document whose line was refused is deleted again (its stored lines go with it,
// by the relation's cascade), so the new form stays the only copy and a second Save
// inserts it once. The line rows the save wrote leave the store at once, as the form will
// insert them again with the same ids. False when the delete fails: the draft then stays.
function undoInsertOf(writes: DocumentWrites, texts: SaveTexts) {
    return async (id: string, plan: TableWritePlan | undefined) => {
        try {
            await performMutations(function* () {
                yield writes.deleteRecord(id)
            })
        } catch (error) {
            log.warn(
                texts.logContext,
                'a new document whose line was refused could not be deleted',
                {
                    document: id,
                    error: String(error),
                }
            )
            return false
        }
        const lineIds = plan?.insert.map(write => write.row.id) ?? []
        if (lineIds.length > 0) writes.evictLines(lineIds)
        return true
    }
}

// The draft a new form wrote before its post was refused: the form stays on `new` with
// the refusal, and its next save updates this document instead of inserting another.
type Written = { id: string; rows: TableRow[] }

type DocumentSaveOptions = {
    // The tab a draft saved from `new` opens on (default the form): a save from the PDF
    // tab shows the PDF.
    tab?: DocumentTab
    // A save ended with an error under a field: the form's own check refused it, or the
    // server's refusal names a field or a line.
    onFieldErrors?: () => void
    // The definition the screen renders when it is not the form's own (a copy with
    // built-ins hidden): a refusal of a field it hides joins the summary.
    definition?: FormDefinition
}

// Whether a field the form shows holds an error now. Read through `getFieldState`, which
// reads the form's current errors, not the last render's (lesson 17): this runs right
// after `setError` or a validation, before any render.
function hasFieldErrors(state: DocumentFormState): boolean {
    const keys = state.definition?.fields.map(f => f.key) ?? []
    return keys.some(key => state.form.getFieldState(key).invalid)
}

/**
 * Save draft, Post and Post & new on a sales document form.
 *
 * - A new document inserts its row, then its lines one at a time; a refused line deletes
 *   the new document again and the form stays new, with the refusal under that line.
 *   Save draft then replaces the route with the draft's own, on the tab it was saved
 *   from.
 * - A saved draft writes its dirty columns and its line plan and stays.
 * - Post writes the draft as above, then sets `status: 'posted'`. The save store holds
 *   the document from before the first write until the post settles, so the optimistic
 *   status does not swap the form for the read view. A refused status write leaves the
 *   draft written and shows the refusal on the form; a new form then updates that draft.
 *   A post from `new` opens the read view; on a saved draft the screen shows it once the
 *   post is confirmed. Post & new opens a fresh form.
 *
 * The empty trailing Item line is dropped before the form validates (spec: dropped at
 * save); Post validates with the `post` mode of the record schema, which adds its rule.
 * The built-in columns are checked against the kind's columns before anything is sent.
 */
export function useDocumentSave(state: DocumentFormState, options: DocumentSaveOptions = {}) {
    const { kind, document: documentKind } = state
    const writes = documentKind.data.useWrites()
    const texts = saveTexts(kind)
    const orgHref = useOrgHref()
    const surfaceRef = useRef<ViewInstance>(null)
    const isPresent = usePresence(surfaceRef)
    const lineWrites = lineWritesOf(state, writes)
    const undoInsert = undoInsertOf(writes, texts)
    const lock = useRef(false)
    // The draft a new form wrote. State, not a ref: its id also titles the form (the
    // kind's draft title) and offers Delete draft, and the next save is pressed after the
    // render this sets, so it reads the written draft.
    const [written, setWritten] = useState<Written | null>(null)
    const onError = state.isNew ? state.create.onError : state.edit.onError

    // The one place that tells the screen a save left an error under a field.
    const reportFieldErrors = () => {
        if (hasFieldErrors(state)) options.onFieldErrors?.()
    }

    const refuse = (refused: Refused) => {
        if (!isPresent()) {
            showClosedRefusal(texts, onError, refused)
            return
        }
        showRefusal(state, onError, refused, hiddenFieldsOf(state, options.definition))
        reportFieldErrors()
    }

    // A post from `new` opens the read view on its first tab; a draft keeps the tab it was
    // saved from. (A saved draft posted in place keeps its URL, so its read view opens on
    // the tab the post was made from.)
    const savedHref = (id: string, mode: SaveMode) =>
        orgHref(documentHref(kind, id, mode.post ? 'edit' : options.tab))

    const release = (id: string) => useDocumentSaveStore.getState().release(id)

    const setPosted = (id: string, progress: Progress) => {
        // The status write is no line's: its refusal gets no "Line n" label.
        progress.rowLabel = null
        return writes.setStatus(id, 'posted')
    }

    // Where the form goes after a save: Post & new to a fresh form; a save from `new` to
    // the document's own route; a saved draft stays (a post shows its read view there).
    const navigateAfter = (id: string, mode: SaveMode) => {
        if (!isPresent()) return
        if (mode.andNew) router.replace(orgHref(postAndNewHref(kind, state.openedWithCustomer)))
        else if (state.isNew) router.replace(savedHref(id, mode))
    }

    // The new form's values are now stored: they become its baseline, and its next save
    // updates this document.
    const markWritten = (id: string, rows: TableRow[]) => {
        setWritten({ id, rows })
        state.create.form.reset(state.create.form.getValues())
    }

    const insert = useMutation({
        mutationFn: async (input: {
            id: string
            columns: Record<string, unknown>
            replaces: string
            formId: string
            fields: Record<string, unknown>
            plans: Record<string, TableWritePlan>
            rows: TableRow[]
            mode: SaveMode
            progress: Progress
        }) => {
            await performMutations(function* () {
                yield writes.insertRecord({
                    id: input.id,
                    columns: input.columns,
                    replaces: input.replaces,
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
        onError: (error, { id, rows, mode, progress }) => {
            // The draft is written and its post was refused: it stays, and the refusal
            // shows on this form, whose next save updates it.
            if (progress.drafted) {
                markWritten(id, rows)
                refuse({ error, rowLabel: progress.rowLabel })
                return
            }
            // A line was refused and the draft could not be taken back: its own route
            // shows what was written, and the refusal becomes a toast, since a second
            // Save on this new form would insert the document again.
            if (progress.inserted && !progress.undone) {
                showClosedRefusal(texts, onError, { error, rowLabel: progress.rowLabel })
                if (isPresent()) router.replace(savedHref(id, mode))
                return
            }
            // Nothing is stored: the new form stays with the refusal where it belongs,
            // and the next Save inserts the document once.
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
            patch: Record<string, unknown>
            fields: Record<string, unknown>
            plans: Record<string, TableWritePlan>
            storedLines: StoredLines
            // Makes the written values the form's baseline.
            onDrafted: () => void
            mode: SaveMode
            progress: Progress
        }) {
            if (hasRecordChanges(input.patch, input.fields)) {
                yield writes.updateRecord(input.id, { columns: input.patch, fields: input.fields })
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
        const kept = documentLinesForSave(lines)
        if (kept.length !== lines.length) state.form.setValue('lines', kept, { shouldDirty: true })
    }

    // A Deposit to that appeared ("Sales deposited to" went back to Ask) on a form that
    // holds no account shows the default rule's account; the save writes that account.
    // Set here, at the save, not by an effect, so an open form's value never changes on
    // its own.
    const fillDepositFallback = () => {
        const fallback = state.depositFallback
        if (fallback === '' || state.form.getValues('deposit_to') !== '') return
        state.form.setValue('deposit_to', fallback, { shouldDirty: true })
    }

    // A post holds the document before its first write (set synchronously, so the very
    // render the optimistic write triggers sees it); the mutation releases it.
    const holdFor = (id: string, mode: SaveMode) => {
        if (mode.post) useDocumentSaveStore.getState().hold(id)
    }

    const startCreate = async (mode: SaveMode) => {
        const split = await state.create.submit()
        if (!split) return false
        const columns = {
            ...documentKind.emptyColumns,
            ...columnsOrThrow(documentKind.columnsFrom, split.columns),
        }
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
            patch: columnsOrThrow(documentKind.columnsFrom, split.columns),
            fields: split.fields,
            plans: { lines: planTableWrites(draft.rows, rows, DOCUMENT_LINE_COLUMNS) },
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
            patch: columnsOrThrow(documentKind.columnsFrom, result.columns),
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
            fillDepositFallback()
            // Post validates with its own rule added (at least one Item line); the
            // record schema reads the mode when it runs.
            if (mode.post) state.saveMode.current = 'post'
            try {
                const started = await startSave(mode)
                // Not started: the form's own check refused it (or nothing changed).
                if (!started) reportFieldErrors()
                return started
            } finally {
                state.saveMode.current = 'draft'
            }
        } catch (error) {
            return startFailed(error, rootServerForm(state.form), {
                logContext: texts.logContext,
                operation: state.isNew ? 'create' : 'update',
                clientSaveFailed: texts.clientSaveFailed,
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

export type DocumentSave = ReturnType<typeof useDocumentSave>

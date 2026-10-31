import type { Transaction } from '@tanstack/react-db'
import type { FormDefinition } from '@tinycld/core/lib/forms/definition'
import type { FormHostDef } from '@tinycld/core/lib/forms/host'
import type { EvalContext, FormValues } from '@tinycld/core/lib/forms/logic'
import type { TableWritePlan } from '@tinycld/core/lib/forms/table-rows'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { useMutation } from '@tinycld/core/lib/mutations'
import type { useFormCreate, useFormEdit } from '@tinycld/core/ui/forms'
import { useNavigation } from 'expo-router'
import { newRecordId } from 'pbtsdb/core'
import { type RefObject, useRef } from 'react'
import type { ViewInstance } from 'react-native'
import type { ColumnsParse } from '../lib/record-columns'
import { type HiddenFields, hiddenRefusalKeys } from '../lib/record-refusals'
import {
    columnsOrThrow,
    hasRecordChanges,
    insertRow,
    rowRefusalHandler,
    runLocked,
    saveRefusalHandler,
    startFailed,
} from '../lib/record-save'

type CreateForm = ReturnType<typeof useFormCreate>
type EditForm = ReturnType<typeof useFormEdit>

export type RecordRowWrite = { label: string | null; run(): Transaction<Record<string, unknown>> }

export type RecordRowsConfig = {
    createPlans(tables: Record<string, TableRow[]>): Record<string, TableWritePlan>
    writes(recordId: string, plans: Record<string, TableWritePlan>): RecordRowWrite[]
    onPartialCreate(recordId: string, error: unknown): void
}

// Where a save's writes got to, read by its refusal handler: a row refused after the
// record's insert landed is not a refused record.
type SaveProgress = { recordId: string; inserted: boolean; rowLabel: string | null }

// What the form's rules read to tell which fields it shows. `definition` is the one the
// screen renders when the host derives it from the form's own (a product's type hides
// built-ins whose values are still sent); absent, the form's own is the rendered one.
interface RuleInputs {
    host: FormHostDef
    context: EvalContext
    definition?: FormDefinition
}

// Asked when a save's answer arrives, from the values the form holds then: a refusal on
// a field that is hidden at that moment has no cell to show it.
function hiddenFieldsOf(form: CreateForm | EditForm, rules: RuleInputs): HiddenFields {
    return () =>
        hiddenRefusalKeys(
            rules.host,
            rules.definition ?? form.definition,
            form.form.getValues(),
            rules.context
        )
}

export type RecordSaveConfig<C extends Record<string, unknown>> = {
    // The built-in columns the form wrote, checked against the collection's columns.
    columnsFrom(columns: Record<string, unknown>): ColumnsParse<C>
    // The base of an insert, so a column the form left out is stored empty.
    emptyColumns: Required<C> & { inactive: boolean }
    insert(row: ReturnType<typeof insertRow<C>>): Transaction<Record<string, unknown>>
    update(
        id: string,
        patch: C,
        fields: Record<string, unknown>
    ): Transaction<Record<string, unknown>>
    logContext: string
    // The toast title of a refusal that arrives after the user left the form.
    notSavedTitle: string
    // The root error of a throw before the write.
    clientSaveFailed: string
    // A host table's rows, written after the record, one at a time.
    rows?: RecordRowsConfig
    // Called after Save and new reset the form, with the columns just saved, while the
    // user still sees the form: a host whose starting values follow a saved column (a
    // product's type) moves to the new form those columns start.
    onSavedAndNew?(columns: C): void
}

// Whether the user still sees this form, asked when a save's answer arrives.
type IsPresent = () => boolean

/**
 * The one presence check for a save's answer: the surface is mounted (React clears the
 * ref on unmount) and its screen is focused. Mounted alone is not enough: a screen left
 * for another package stays mounted, frozen, under the one now shown. `isFocused` also
 * asks the parent navigators, so a covered package counts as not focused.
 */
function usePresence(surfaceRef: RefObject<ViewInstance | null>): IsPresent {
    const navigation = useNavigation()
    return () => surfaceRef.current !== null && navigation.isFocused()
}

function closedFor<C extends Record<string, unknown>>(config: RecordSaveConfig<C>) {
    return { notSavedTitle: config.notSavedTitle, operation: `${config.logContext}.save` }
}

function failureFor<C extends Record<string, unknown>>(
    config: RecordSaveConfig<C>,
    operation: string
) {
    return { logContext: config.logContext, operation, clientSaveFailed: config.clientSaveFailed }
}

interface InsertInput<C> {
    columns: C
    formId: string
    fields: Record<string, unknown>
    andNew: boolean
    plans: Record<string, TableWritePlan>
    progress: SaveProgress
}

/**
 * Save and Save and new on a new record. Save resets the form to what was saved
 * (clean, so the leave guard lets `leave` through) and leaves; Save and new resets it
 * to its starting values, stays on the new record's form and hands the saved columns to
 * the host's `onSavedAndNew`. When the user left the form during the write, it is reset
 * to its starting values and does not leave: moving them would take them away from
 * where they went.
 */
function useCreateSave<C extends Record<string, unknown>>(
    config: RecordSaveConfig<C>,
    create: CreateForm,
    leave: () => void,
    isPresent: IsPresent,
    rules: RuleInputs
) {
    const lock = useRef(false)
    const refused = saveRefusalHandler(
        create.form,
        create.onError,
        isPresent,
        closedFor(config),
        hiddenFieldsOf(create, rules)
    )
    const insert = useMutation({
        mutationFn: function* ({ columns, formId, fields, plans, progress }: InsertInput<C>) {
            yield config.insert(
                insertRow(config.emptyColumns, columns, { id: progress.recordId, formId, fields })
            )
            progress.inserted = true
            for (const write of config.rows?.writes(progress.recordId, plans) ?? []) {
                progress.rowLabel = write.label
                yield write.run()
            }
        },
        onSuccess: (_data, { andNew, columns }) => {
            // Left before the insert landed, or Save and new: back to the starting values,
            // so the new record's form never shows a saved record as new.
            if (!isPresent()) {
                create.form.reset()
                return
            }
            if (andNew) {
                create.form.reset()
                config.onSavedAndNew?.(columns)
                return
            }
            create.form.reset(create.form.getValues())
            leave()
        },
        onError: (error, { progress }) => {
            if (progress.inserted && config.rows) {
                create.form.reset()
                config.rows.onPartialCreate(progress.recordId, error)
                return
            }
            refused(error)
        },
        onSettled: () => {
            lock.current = false
        },
    })
    const start = async (andNew: boolean) => {
        // A new answer from the server replaces the last one.
        create.form.clearErrors('root')
        try {
            const split = await create.submit()
            if (!split) return false
            const columns = columnsOrThrow(config.columnsFrom, split.columns)
            const plans = config.rows?.createPlans(split.tables) ?? {}
            insert.mutate({
                columns,
                formId: create.formId,
                fields: split.fields,
                andNew,
                plans,
                progress: { recordId: newRecordId(), inserted: false, rowLabel: null },
            })
            return true
        } catch (error) {
            return startFailed(error, create.form, failureFor(config, 'create'))
        }
    }
    return {
        save: () => runLocked(lock, () => start(false)),
        saveAndNew: () => runLocked(lock, () => start(true)),
        isSaving: insert.isPending,
    }
}

interface UpdateInput<C> {
    id: string
    patch: C
    fields: Record<string, unknown>
    written: FormValues
    plans: Record<string, TableWritePlan>
    progress: { rowLabel: string | null }
}

// Read from the form's live field state, not the last render's: a field typed while the
// write was in flight is dirty here before the next render.
function hasUnsavedEdits(edit: EditForm) {
    const keys = edit.definition?.fields.map(f => f.key) ?? []
    return keys.some(key => edit.form.getFieldState(key).isDirty)
}

/**
 * Save on an existing record writes only the dirty keys, marks them saved and leaves.
 * It stays when the user typed during the write (those edits are still unsaved, and the
 * leave guard asks about them) or left the form meanwhile (moving them would take them
 * away from where they went).
 */
function useEditSave<C extends Record<string, unknown>>(
    config: RecordSaveConfig<C>,
    edit: EditForm,
    recordId: string,
    leave: () => void,
    isPresent: IsPresent,
    rules: RuleInputs
) {
    const lock = useRef(false)
    const refused = saveRefusalHandler(
        edit.form,
        edit.onError,
        isPresent,
        closedFor(config),
        hiddenFieldsOf(edit, rules)
    )
    const update = useMutation({
        mutationFn: function* ({ id, patch, fields, plans, progress }: UpdateInput<C>) {
            if (hasRecordChanges(patch, fields)) yield config.update(id, patch, fields)
            for (const write of config.rows?.writes(id, plans) ?? []) {
                progress.rowLabel = write.label
                yield write.run()
            }
        },
        onSuccess: (_data, { written }) => {
            edit.markSaved(written)
            if (isPresent() && !hasUnsavedEdits(edit)) leave()
        },
        onError: (error, { progress }) => {
            if (progress.rowLabel !== null && isPresent()) {
                rowRefusalHandler(edit.form, edit.onError, progress.rowLabel)(error)
                return
            }
            refused(error)
        },
        onSettled: () => {
            lock.current = false
        },
    })
    const start = async () => {
        edit.form.clearErrors('root')
        try {
            const result = await edit.patch()
            if (!result) return false
            // Nothing changed: there is nothing to write, and a clean form leaves at once.
            if (Object.keys(result.written).length === 0) {
                leave()
                return false
            }
            const patch = columnsOrThrow(config.columnsFrom, result.columns)
            update.mutate({
                id: recordId,
                patch,
                fields: result.fields,
                written: result.written,
                plans: result.tableWrites,
                progress: { rowLabel: null },
            })
            return true
        } catch (error) {
            return startFailed(error, edit.form, failureFor(config, 'update'))
        }
    }
    return { save: () => runLocked(lock, start), isSaving: update.isPending }
}

/**
 * The open record's save. The caller puts `surfaceRef` on the surface's root view: with
 * the screen's focus it tells whether the user still sees the form when a save's answer
 * arrives (see `usePresence`). Both save hooks run on every render; the mode's Save is
 * returned, and Save and new is the create one. The config is rebuilt each render, and
 * the mutations read it when they run.
 */
export function useRecordSave<C extends Record<string, unknown>>(
    config: RecordSaveConfig<C>,
    forms: {
        mode: 'new' | 'edit'
        create: CreateForm
        edit: EditForm
        recordId: string
        leave(): void
    } & RuleInputs
) {
    const surfaceRef = useRef<ViewInstance>(null)
    const isPresent = usePresence(surfaceRef)
    const createSave = useCreateSave(config, forms.create, forms.leave, isPresent, forms)
    const editSave = useEditSave(config, forms.edit, forms.recordId, forms.leave, isPresent, forms)
    const chosen = forms.mode === 'edit' ? editSave : createSave
    return {
        save: chosen.save,
        saveAndNew: createSave.saveAndNew,
        isSaving: chosen.isSaving,
        surfaceRef,
    }
}

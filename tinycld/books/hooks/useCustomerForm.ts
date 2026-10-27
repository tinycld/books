import { useAuth } from '@tinycld/core/lib/auth'
import type { EvalContext, FormValues } from '@tinycld/core/lib/forms/logic'
import { type FormHost, useFormHost } from '@tinycld/core/lib/forms/use-form-hosts'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useWatch } from '@tinycld/core/ui/form'
import { useFormCreate, useFormEdit, useHostUi } from '@tinycld/core/ui/forms'
import { useNavigation } from 'expo-router'
import { newRecordId } from 'pbtsdb/core'
import { type RefObject, useMemo, useRef } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import type { View } from 'react-native'
import { CUSTOMER_HOST_KEY } from '../forms/hosts'
import {
    type CustomerColumns,
    customerColumnsFrom,
    EMPTY_CUSTOMER_COLUMNS,
    EMPTY_CUSTOMER_FIELDS,
} from '../lib/customer-columns'
import { customerTitle } from '../lib/customer-display'
import { closedCustomerRefusalHandler, customerRefusalHandler } from '../lib/customer-messages'
import { todayIso } from '../lib/register-range'
import type { BooksCustomers } from '../types'
import { useBooksAccess } from './useBooksAccess'
import { useCustomerNavigation } from './useCustomerNavigation'

// The edited record is the row `useRecord` holds for the route.
export type CustomerFormTarget =
    | { mode: 'new'; parentId: string }
    | { mode: 'edit'; record: BooksCustomers }

// Books declares the host in its own manifest, so a missing host is a broken build
// (the generator did not run), not a state to render around.
function useCustomerHost(): FormHost {
    const host = useFormHost(CUSTOMER_HOST_KEY)
    if (!host) {
        const error = new Error(`form host ${CUSTOMER_HOST_KEY} is not registered`)
        log.error('books.customers', error)
        throw error
    }
    return host
}

type CreateForm = ReturnType<typeof useFormCreate>
type EditForm = ReturnType<typeof useFormEdit>
type RefusalForm = Pick<UseFormReturn<FormValues>, 'setError'>

// Whether the user still sees this form, asked when a save's answer arrives.
type IsPresent = () => boolean

/**
 * The one presence check for a save's answer: the surface is mounted (React clears the
 * ref on unmount) and its screen is focused. Mounted alone is not enough: a screen left
 * for another package stays mounted, frozen, under the one now shown. `isFocused` also
 * asks the parent navigators, so a covered package counts as not focused.
 */
function usePresence(surfaceRef: RefObject<View | null>): IsPresent {
    const navigation = useNavigation()
    return () => surfaceRef.current !== null && navigation.isFocused()
}

const CLIENT_SAVE_FAILED = 'Books could not save this customer.'

// The form handed the save a value no customer column holds: a bug, not a refusal, so
// it fails the press like any other throw before the write (`startFailed`).
function columnsOrThrow(columns: Record<string, unknown>) {
    const parsed = customerColumnsFrom(columns)
    if (!parsed.success) throw parsed.error
    return parsed.columns
}

// A refusal lands on the form while the user still sees it, and becomes a toast when
// they left it during the write.
function saveRefusalHandler(
    form: RefusalForm,
    hostOnError: (error: unknown) => void,
    isPresent: IsPresent
) {
    const onForm = customerRefusalHandler(form, hostOnError)
    const onClosed = closedCustomerRefusalHandler(hostOnError)
    return (error: unknown) => {
        if (isPresent()) onForm(error)
        else onClosed(error)
    }
}

// Something threw before the mutation started (the form's validation, its split, the
// column parse): a bug, not a refusal. Nothing was sent, so the form stays open with what
// was typed, and the root error tells the user the press did not save.
function startFailed(error: unknown, form: RefusalForm, operation: string) {
    log.error('books.customers', error, { operation })
    form.setError('root', { type: 'client', message: CLIENT_SAVE_FAILED })
    return false
}

// The form validates before the mutation starts, so for a moment after a press the
// mutation is not pending yet and a second press would write the customer twice. The
// lock is a ref, so it holds from the first press without waiting for a render. `start`
// returns whether it started the mutation; the mutation's `onSettled` releases the lock
// when it did.
async function runLocked(lock: RefObject<boolean>, start: () => Promise<boolean>) {
    if (lock.current) return
    lock.current = true
    let started = false
    try {
        started = await start()
    } finally {
        if (!started) lock.current = false
    }
}

interface InsertInput {
    columns: CustomerColumns
    formId: string
    fields: Record<string, unknown>
    andNew: boolean
}

/**
 * Save and Save and new on a new customer. Save resets the form to what was saved
 * (clean, so the leave guard lets `leave` through) and leaves; Save and new resets it
 * to its starting values, which keep a `?parent`, and stays on the New customer form.
 * When the user left the form during the write, it is reset to its starting values (a
 * `?parent` stays) and does not leave: moving them would take them away from where they
 * went.
 */
function useCreateSave(create: CreateForm, leave: () => void, isPresent: IsPresent) {
    const [customersCollection] = useStore('books_customers')
    const lock = useRef(false)
    const insert = useMutation({
        mutationFn: function* ({ columns, formId, fields }: InsertInput) {
            yield customersCollection.insert({
                ...EMPTY_CUSTOMER_COLUMNS,
                ...columns,
                id: newRecordId(),
                form: formId,
                fields,
            })
        },
        onSuccess: (_data, { andNew }) => {
            // Left before the insert landed, or Save and new: back to the starting values
            // (a `?parent` stays), so the New form never shows a saved customer as new.
            if (!isPresent() || andNew) {
                create.form.reset()
                return
            }
            create.form.reset(create.form.getValues())
            leave()
        },
        onError: saveRefusalHandler(create.form, create.onError, isPresent),
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
            const columns = columnsOrThrow(split.columns)
            insert.mutate({ columns, formId: create.formId, fields: split.fields, andNew })
            return true
        } catch (error) {
            return startFailed(error, create.form, 'create')
        }
    }
    return {
        save: () => runLocked(lock, () => start(false)),
        saveAndNew: () => runLocked(lock, () => start(true)),
        isSaving: insert.isPending,
    }
}

interface UpdateInput {
    id: string
    patch: CustomerColumns
    fields: Record<string, unknown>
    written: FormValues
}

// Read from the form's live field state, not the last render's: a field typed while the
// write was in flight is dirty here before the next render.
function hasUnsavedEdits(edit: EditForm) {
    const keys = edit.definition?.fields.map(f => f.key) ?? []
    return keys.some(key => edit.form.getFieldState(key).isDirty)
}

/**
 * Save on an existing customer writes only the dirty keys, marks them saved and leaves.
 * It stays when the user typed during the write (those edits are still unsaved, and the
 * leave guard asks about them) or left the form meanwhile (moving them would take them
 * away from where they went).
 */
function useEditSave(edit: EditForm, recordId: string, leave: () => void, isPresent: IsPresent) {
    const [customersCollection] = useStore('books_customers')
    const lock = useRef(false)
    const update = useMutation({
        mutationFn: function* ({ id, patch, fields }: UpdateInput) {
            yield customersCollection.update(id, draft => {
                Object.assign(draft, patch)
                // Empty when no custom field changed: the stored JSON stays as it is.
                if (Object.keys(fields).length > 0) draft.fields = fields
            })
        },
        onSuccess: (_data, { written }) => {
            edit.markSaved(written)
            if (isPresent() && !hasUnsavedEdits(edit)) leave()
        },
        onError: saveRefusalHandler(edit.form, edit.onError, isPresent),
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
            const patch = columnsOrThrow(result.columns)
            update.mutate({ id: recordId, patch, fields: result.fields, written: result.written })
            return true
        } catch (error) {
            return startFailed(error, edit.form, 'update')
        }
    }
    return { save: () => runLocked(lock, start), isSaving: update.isPending }
}

/**
 * The open customer's form. Both core form hooks run on every render (hooks cannot be
 * conditional, and a route's mode never changes for its life); the one matching the
 * target is returned and the other stays idle. A new customer starts with the parent
 * from `?parent` and its shipping address folded into billing (null). The caller puts
 * `surfaceRef` on the surface's root view: with the screen's focus it tells whether the
 * user still sees the form when a save's answer arrives (see `usePresence`).
 */
export function useCustomerForm(target: CustomerFormTarget) {
    const host = useCustomerHost()
    const ui = useHostUi(host)
    const access = useBooksAccess()
    const { user } = useAuth()
    const userId = user?.id ?? ''
    // Memoized so the form's rules do not re-evaluate against a new object every render.
    const context = useMemo<EvalContext>(() => ({ today: todayIso(), userId }), [userId])
    const parentId = target.mode === 'new' ? target.parentId : ''
    const record = target.mode === 'edit' ? target.record : undefined
    const create = useFormCreate(host, undefined, context, {
        ...EMPTY_CUSTOMER_FIELDS,
        parent: parentId,
    })
    // Spread: the engine reads the row as a plain record, and a generated row
    // interface carries no index signature.
    const edit = useFormEdit(host, record ? { ...record } : { id: '' }, context)
    const chosen = target.mode === 'edit' ? edit : create
    // A new customer's title follows the Parent customer field, not `?parent`.
    const chosenParent = useWatch({ control: chosen.form.control, name: 'parent' })
    const { leave } = useCustomerNavigation()
    const surfaceRef = useRef<View>(null)
    const isPresent = usePresence(surfaceRef)
    const createSave = useCreateSave(create, leave, isPresent)
    const editSave = useEditSave(edit, record?.id ?? '', leave, isPresent)
    const readOnly = !access.canWrite
    // Read through the form state proxy, so a change to it re-renders the guard. Not
    // `isDirty`: core useFormEdit resets to the live row with keepDirtyValues, and after
    // an optimistic write and its rollback that turns `isDirty` false while the typed
    // edits and their dirty fields stay.
    const dirtyFields = chosen.form.formState.dirtyFields
    return {
        host,
        ui,
        definition: chosen.definition,
        form: chosen.form,
        schemaRef: chosen.schemaRef,
        context,
        recordId: record?.id,
        surfaceRef,
        // The host components and the caller's access level shape the first frame,
        // so the form waits for both.
        isReady: chosen.isReady && ui !== null && access.isReady,
        readOnly,
        canWrite: access.canWrite,
        title: customerTitle({
            mode: target.mode,
            isSubCustomer: typeof chosenParent === 'string' && chosenParent !== '',
            canWrite: access.canWrite,
        }),
        save: target.mode === 'edit' ? editSave.save : createSave.save,
        saveAndNew: createSave.saveAndNew,
        isSaving: target.mode === 'edit' ? editSave.isSaving : createSave.isSaving,
        // A read-only user never changes the stored customer, so nothing is lost.
        isDirty: Object.keys(dirtyFields).length > 0 && !readOnly,
    }
}

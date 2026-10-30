import { useAuth } from '@tinycld/core/lib/auth'
import type { EvalContext } from '@tinycld/core/lib/forms/logic'
import { type FormHost, useFormHost } from '@tinycld/core/lib/forms/use-form-hosts'
import { log } from '@tinycld/core/lib/logger'
import { useFormCreate, useFormEdit, useHostUi } from '@tinycld/core/ui/forms'
import { useMemo } from 'react'
import { todayIso } from '../lib/register-range'
import { useBooksAccess } from './useBooksAccess'

// Books declares the host in its own manifest, so a missing host is a broken build
// (the generator did not run), not a state to render around.
function useRequiredHost(hostKey: string, logContext: string): FormHost {
    const host = useFormHost(hostKey)
    if (!host) {
        const error = new Error(`form host ${hostKey} is not registered`)
        log.error(logContext, error)
        throw error
    }
    return host
}

interface RecordFormConfig<R extends { id: string }> {
    hostKey: string
    logContext: string
    mode: 'new' | 'edit'
    // The edited row (edit mode); undefined on a new record.
    record: R | undefined
    // The create form's starting values.
    createValues: Record<string, unknown>
}

/**
 * The open record's form. Both core form hooks run on every render (hooks cannot be
 * conditional, and a route's mode never changes for its life); the one matching the
 * mode is returned and the other stays idle.
 */
export function useRecordForm<R extends { id: string }>(config: RecordFormConfig<R>) {
    const host = useRequiredHost(config.hostKey, config.logContext)
    const ui = useHostUi(host)
    const access = useBooksAccess()
    const { user } = useAuth()
    const userId = user?.id ?? ''
    // Memoized so the form's rules do not re-evaluate against a new object every render.
    const context = useMemo<EvalContext>(() => ({ today: todayIso(), userId }), [userId])
    const create = useFormCreate(host, undefined, context, config.createValues)
    // Spread: the engine reads the row as a plain record, and a generated row
    // interface carries no index signature.
    const edit = useFormEdit(host, config.record ? { ...config.record } : { id: '' }, context)
    const chosen = config.mode === 'edit' ? edit : create
    const readOnly = !access.canWrite
    // Read through the form state proxy, so a change to it re-renders the guard. Not
    // `isDirty`: core useFormEdit resets to the live row with keepDirtyValues, and after
    // an optimistic write and its rollback that turns `isDirty` false while the typed
    // edits and their dirty fields stay.
    const dirtyFields = chosen.form.formState.dirtyFields
    return {
        host,
        ui,
        context,
        create,
        edit,
        definition: chosen.definition,
        form: chosen.form,
        schemaRef: chosen.schemaRef,
        recordId: config.record?.id,
        // The host components and the caller's access level shape the first frame,
        // so the form waits for both.
        isReady: chosen.isReady && ui !== null && access.isReady,
        readOnly,
        canWrite: access.canWrite,
        // A read-only user never changes the stored record, so nothing is lost.
        isDirty: Object.keys(dirtyFields).length > 0 && !readOnly,
    }
}

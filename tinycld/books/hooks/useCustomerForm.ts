import { useAuth } from '@tinycld/core/lib/auth'
import type { EvalContext } from '@tinycld/core/lib/forms/logic'
import { type FormHost, useFormHost } from '@tinycld/core/lib/forms/use-form-hosts'
import { log } from '@tinycld/core/lib/logger'
import { useWatch } from '@tinycld/core/ui/form'
import { useFormCreate, useFormEdit, useHostUi } from '@tinycld/core/ui/forms'
import { useMemo } from 'react'
import { CUSTOMER_HOST_KEY } from '../forms/hosts'
import { customerTitle } from '../lib/customer-display'
import { todayIso } from '../lib/register-range'
import type { BooksCustomers } from '../types'
import { useBooksAccess } from './useBooksAccess'

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

/**
 * The open customer's form. Both core form hooks run on every render (hooks cannot be
 * conditional, and a route's mode never changes for its life); the one matching the
 * target is returned and the other stays idle. A new customer starts with the parent
 * from `?parent` and its shipping address folded into billing (null).
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
        parent: parentId,
        billing_address: null,
        shipping_address: null,
    })
    // Spread: the engine reads the row as a plain record, and a generated row
    // interface carries no index signature.
    const edit = useFormEdit(host, record ? { ...record } : { id: '' }, context)
    const chosen = target.mode === 'edit' ? edit : create
    // A new customer's title follows the Parent customer field, not `?parent`.
    const chosenParent = useWatch({ control: chosen.form.control, name: 'parent' })
    return {
        host,
        ui,
        definition: chosen.definition,
        form: chosen.form,
        schemaRef: chosen.schemaRef,
        context,
        recordId: record?.id,
        // The host components and the caller's access level shape the first frame,
        // so the form waits for both.
        isReady: chosen.isReady && ui !== null && access.isReady,
        readOnly: !access.canWrite,
        title: customerTitle({
            mode: target.mode,
            isSubCustomer: typeof chosenParent === 'string' && chosenParent !== '',
            canWrite: access.canWrite,
        }),
    }
}

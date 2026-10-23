import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { newRecordId } from 'pbtsdb/core'
import { useEffect, useRef } from 'react'
import { canWriteAccounts } from '../lib/account-access'
import { typeLockMessage } from '../lib/account-messages'
import { type AccountFormValues, accountFormSchema } from '../lib/account-schema'
import { parentChoices } from '../lib/account-tree'
import { accountTypeDef } from '../lib/account-types'
import { type PanelTarget, useAccountsPanelStore } from '../stores/accounts-panel-store'
import type { BooksAccounts } from '../types'
import type { AccountRow } from './useAccountsQuery'
import { useAccountUsage } from './useAccountUsage'
import { useBooksAccess } from './useBooksAccess'

const BLANK: AccountFormValues = {
    name: '',
    number: '',
    type: '',
    detail_type: '',
    parent: '',
    description: '',
}

function defaultsFor(target: PanelTarget, accounts: AccountRow[]): AccountFormValues {
    if (target.mode === 'edit') {
        const row = accounts.find(a => a.id === target.id)
        if (!row) return BLANK
        return {
            name: row.name,
            number: row.number,
            type: row.type,
            detail_type: row.detail_type,
            parent: row.parent,
            description: row.description,
        }
    }
    const parent = accounts.find(a => a.id === target.parentId)
    if (!parent) return BLANK
    return { ...BLANK, parent: parent.id, type: parent.type }
}

function targetKey(target: PanelTarget) {
    return target.mode === 'new' ? `new:${target.parentId}` : `edit:${target.id}`
}

type SaveVariables = {
    values: AccountFormValues
    editingId: string | null
    started: PanelTarget | null
}

// The panel moved on while the write ran, so the form that asked for it is gone.
// Identity, not key: a re-opened panel with the same key is a different panel.
function isRetargeted(started: PanelTarget | null) {
    return useAccountsPanelStore.getState().target !== started
}

const USAGE_PENDING_HINT = 'Checking whether this account is used...'

// A refusal for a rule that belongs to no field (depth, inactive parent) comes
// with a message and an empty field map.
function messageOnlyRefusal(error: unknown): string | null {
    const response = (error as { response?: { message?: unknown; data?: unknown } } | null)
        ?.response
    if (!response || typeof response.message !== 'string' || response.message === '') return null
    const data = response.data
    const hasFields = typeof data === 'object' && data !== null && Object.keys(data).length > 0
    return hasFields ? null : response.message
}

function typeLockHint(usage: ReturnType<typeof useAccountUsage>) {
    return usage.isReady ? typeLockMessage(usage) : USAGE_PENDING_HINT
}

export function useAccountForm(target: PanelTarget, accounts: AccountRow[], isReady: boolean) {
    const [accountsCollection] = useStore('books_accounts')
    const access = useBooksAccess()
    const close = useAccountsPanelStore(s => s.close)
    const isEditing = target.mode === 'edit'
    const editingId = target.mode === 'edit' ? target.id : null
    const rowExists = target.mode === 'edit' && accounts.some(a => a.id === target.id)
    const isMissing = isReady && target.mode === 'edit' && !rowExists

    // Seeded once per target: later changes to the stored row never touch what
    // the user is typing. Keeping the same object between renders is what stops
    // react-hook-form from resetting.
    const key = targetKey(target)
    // An edit seeded while its row was absent is re-seeded once, when the row arrives.
    const seed = useRef<{ key: string; values: AccountFormValues; fromRow: boolean } | null>(null)
    const stale =
        seed.current?.key !== key || (isEditing && rowExists && seed.current?.fromRow === false)
    if (stale) {
        seed.current = { key, values: defaultsFor(target, accounts), fromRow: rowExists }
    }
    const seeded = seed.current?.values ?? BLANK

    const form = useForm<AccountFormValues>({
        resolver: zodResolver(accountFormSchema),
        defaultValues: seeded,
        values: seeded,
    })
    const { control, setError, getValues, handleSubmit, reset, watch, clearErrors } = form
    // Only this hook writes the root error, so the flag lets typing skip clearErrors
    // (which re-renders) when there is nothing to clear.
    const hasRootError = useRef(false)

    const type = useWatch({ control, name: 'type' })
    const usage = useAccountUsage(editingId)
    const isReadOnly = !canWriteAccounts(access)
    const typeLocked = isEditing && (!usage.isReady || usage.lines > 0 || usage.children > 0)
    const inFlight = useRef(false)

    const routeFieldErrors = handleMutationErrorsWithForm({ setError, getValues })
    // A form nobody sees cannot show a refusal: no field is known to it, so the
    // handler falls through to notify.
    const routeDeadFormErrors = handleMutationErrorsWithForm({
        setError: () => {},
        getValues: () => ({}),
    })

    // A message-only refusal sits on the root; it is stale once the user edits anything.
    useEffect(() => {
        const subscription = watch(() => {
            if (!hasRootError.current) return
            hasRootError.current = false
            clearErrors('root')
        })
        return () => subscription.unsubscribe()
    }, [watch, clearErrors])
    const mutation = useMutation({
        mutationFn: function* ({ values, editingId: id }: SaveVariables) {
            const fields = {
                name: values.name,
                number: values.number,
                // The schema has already rejected a type that is not a known one.
                type: values.type as BooksAccounts['type'],
                detail_type: values.detail_type,
                parent: values.parent,
                description: values.description,
            }
            if (id === null) {
                yield accountsCollection.insert({ id: newRecordId(), inactive: false, ...fields })
                return
            }
            yield accountsCollection.update(id, draft => {
                Object.assign(draft, fields)
            })
        },
        onError: (error: unknown, { started }: SaveVariables) => {
            if (isRetargeted(started)) {
                routeDeadFormErrors(error)
                return
            }
            const message = messageOnlyRefusal(error)
            if (message) {
                hasRootError.current = true
                setError('root', { type: 'server', message })
            } else routeFieldErrors(error)
        },
    })

    const submit = async (afterSave: () => void) => {
        if (inFlight.current || isMissing) return
        inFlight.current = true
        const started = useAccountsPanelStore.getState().target
        try {
            await handleSubmit(async values => {
                if (isReadOnly) return
                try {
                    await mutation.mutateAsync({ values, editingId, started })
                } catch {
                    // onError has put the refusal on the form.
                    return
                }
                if (!isRetargeted(started)) afterSave()
            })()
        } finally {
            inFlight.current = false
        }
    }

    return {
        form,
        isReadOnly,
        isEditing,
        isMissing,
        typeLocked,
        typeLockReason: isEditing ? typeLockHint(usage) : null,
        parentOptions: parentChoices(accounts, { type, editingId: editingId ?? '' }),
        detailTypeOptions: (accountTypeDef(type)?.detailTypes ?? []).map(({ key, label }) => ({
            key,
            label,
        })),
        save: () => submit(close),
        saveAndNew: () => submit(() => reset(seeded)),
        isSaving: mutation.isPending,
    }
}

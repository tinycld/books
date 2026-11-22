import { extractValidationErrors, handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useForm, zodResolver } from '@tinycld/core/ui/form'
import { router } from 'expo-router'
import { newRecordId } from 'pbtsdb/core'
import { useMemo } from 'react'
import { formatMoney } from '../lib/money'
import { moneyInputText } from '../lib/money-input'
import {
    beginningNoteText,
    type ReconcileStartValues,
    reconcileStartFields,
    reconcileStartSchema,
    sideWords,
    statementFileNoteText,
} from '../lib/reconcile'
import { todayIso } from '../lib/register-range'
import { useReconcileStore } from '../stores/reconcile-store'
import type { ReconcileAccountRowData } from './useReconcileAccounts'

const LOG_CONTEXT = 'books.reconcile'

// The statement file's values the dialog starts with (reconcile spec §3 "The start
// dialog"): the balance as the field shows it, the day and the file's name.
export type StartPrefill = { balance: string; date: string; fileName: string }

// The server's field of each form field (server/reconcile.go and the migration's field
// rules), so a refusal keyed on a field shows under that field.
const FORM_FIELD_OF: Record<string, keyof ReconcileStartValues> = {
    statement_balance: 'balance',
    statement_date: 'date',
    statement_out: 'statementOut',
    statement_in: 'statementIn',
}

type StartVariables = { id: string; values: ReconcileStartValues }

// The latest statement file's values, when the file is dated after the last reconciled
// statement; else none, and the form starts with an empty balance and today.
export function startPrefill(
    statement: { cents: number; day: string; fileName: string } | null,
    lastDate: string
): StartPrefill | null {
    if (statement === null || statement.day <= lastDate) return null
    return {
        balance: moneyInputText(statement.cents),
        date: statement.day,
        fileName: statement.fileName,
    }
}

/**
 * The start dialog's form (reconcile spec §3 "The start dialog", §4 "Writes"): the
 * account's last finished reconciliation (`last`) gives the beginning balance and the date
 * rule; `prefill` is the statement file's balance and day, or null (none, or not read yet),
 * when the form holds an empty balance and today; a prefill that arrives later fills the
 * fields the user has not changed. The submit validates through `reconcileStartSchema`,
 * sets `isStarting` in the store before the insert (synchronously, so the optimistic row
 * that turns the account's button into Resume never closes the dialog), inserts one
 * reconciliation in progress and, after the server stored it, closes the dialog and opens
 * its work screen. A refusal keyed on a statement field goes under that field; any other
 * goes to the form's root (FormErrorSummary). The flag comes off when the insert settles.
 * While it is set the dialog refuses to close (`close`).
 */
export function useReconcileStart(
    account: ReconcileAccountRowData,
    last: ReconcileAccountRowData['lastFinished'],
    prefill: StartPrefill | null
) {
    const [reconciliationsCollection] = useStore('books_reconciliations')
    const orgHref = useOrgHref()
    const isStarting = useReconcileStore(s => s.isStarting)
    const lastDate = last?.statement_date ?? ''
    const today = todayIso()
    const resolver = useMemo(
        () => zodResolver(reconcileStartSchema(lastDate, today)),
        [lastDate, today]
    )
    // The form draws at once; the statement file's values arrive later (or never: a read
    // that fails or does not end gives no prefill) and replace only the fields the user has
    // not typed in (keepDirtyValues).
    const prefillBalance = prefill?.balance ?? ''
    const prefillDate = prefill?.date ?? today
    const values = useMemo<ReconcileStartValues>(
        () => ({ balance: prefillBalance, date: prefillDate, statementOut: '', statementIn: '' }),
        [prefillBalance, prefillDate]
    )
    const form = useForm<ReconcileStartValues>({
        values,
        resetOptions: { keepDirtyValues: true },
        resolver,
    })
    const { setError, getValues } = form

    const showRefusal = (error: unknown) => {
        const fields = Object.entries(extractValidationErrors(error) ?? {})
        const onFields = fields.filter(([key]) => Object.hasOwn(FORM_FIELD_OF, key))
        for (const [key, message] of onFields) {
            setError(FORM_FIELD_OF[key], { type: 'server', message })
        }
        const others = fields.filter(([key]) => !Object.hasOwn(FORM_FIELD_OF, key))
        if (others.length > 0) {
            const message = others.map(([, text]) => text).join(' ')
            setError('root', { type: 'server', message })
            return
        }
        if (onFields.length > 0) return
        handleMutationErrorsWithForm({
            setError,
            getValues,
            rootMessage: true,
            operation: LOG_CONTEXT,
        })(error)
    }

    const start = useMutation({
        mutationFn: function* ({ id, values }: StartVariables) {
            yield reconciliationsCollection.insert({
                id,
                account: account.id,
                ...reconcileStartFields(values),
                status: 'in_progress',
            })
        },
        onSuccess: (_data, { id }) => {
            useReconcileStore.getState().closeStart()
            router.push(orgHref(`books/reconcile/${id}`))
        },
        onError: showRefusal,
        onSettled: () => useReconcileStore.getState().setStarting(false),
    })

    const submit = () =>
        form.handleSubmit(values => {
            // The store's flag, not the render's: two submits in one render both see it.
            const store = useReconcileStore.getState()
            if (store.isStarting) return
            store.setStarting(true)
            start.mutate({ id: newRecordId(), values })
        })()

    const currency = account.currency || 'USD'
    const words = sideWords(account.type)
    return {
        form,
        submit,
        isStarting,
        words,
        currency,
        beginning: formatMoney(last?.statement_balance ?? 0, currency),
        beginningNote: beginningNoteText(lastDate),
        fileNote: prefill ? statementFileNoteText(prefill.fileName) : '',
    }
}

export type ReconcileStartModel = ReturnType<typeof useReconcileStart>

// Cancel, Escape and the backdrop do nothing while the insert runs: the dialog stays until
// the server has answered, so a refusal shows in it.
export function closeStartDialog() {
    const store = useReconcileStore.getState()
    if (store.isStarting) return
    store.closeStart()
}

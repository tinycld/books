import { extractValidationErrors, handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useForm, zodResolver } from '@tinycld/core/ui/form'
import { router } from 'expo-router'
import { newRecordId } from 'pbtsdb/core'
import { useMemo } from 'react'
import { centsToText, formatMoney } from '../lib/money'
import { moneyInputText } from '../lib/money-input'
import {
    beginningNoteText,
    clearedAfterCount,
    type ReconcileStartValues,
    reconcileStartFields,
    reconcileStartSchema,
    sideWords,
    statementFileNoteText,
    unclearedAfterText,
} from '../lib/reconcile'
import { todayIso } from '../lib/register-range'
import { useReconcileStore } from '../stores/reconcile-store'
import type { BooksReconciliations } from '../types'
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

// The statement form of the start dialog and of Edit info: `reconcileStartSchema` with the
// last reconciled statement date, and a server refusal keyed on a statement field under
// that field, any other at the form's root (FormErrorSummary).
function useStatementForm(lastDate: string, values: ReconcileStartValues) {
    const today = todayIso()
    const resolver = useMemo(
        () => zodResolver(reconcileStartSchema(lastDate, today)),
        [lastDate, today]
    )
    // New `values` (a prefill that arrives, Edit info's own optimistic update and its
    // rollback after a refusal) reset the form; the typed fields, the refusal and the
    // submitted state survive that reset, so a refusal stays shown.
    const form = useForm<ReconcileStartValues>({
        values,
        resetOptions: { keepDirtyValues: true, keepErrors: true, keepIsSubmitted: true },
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
    return { form, showRefusal }
}

// The store's flag, not the render's: two submits in one render both see it. Sets the flag
// before the write starts, so the very render its optimistic change triggers sees it.
function claimDialogWrite(): boolean {
    const store = useReconcileStore.getState()
    if (store.isStarting) return false
    store.setStarting(true)
    return true
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
 * While it is set the dialog refuses to close (`closeStartDialog`).
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
    // The form draws at once; the statement file's values arrive later (or never: a read
    // that fails or does not end gives no prefill) and replace only the fields the user has
    // not typed in (keepDirtyValues).
    const today = todayIso()
    const prefillBalance = prefill?.balance ?? ''
    const prefillDate = prefill?.date ?? today
    const values = useMemo<ReconcileStartValues>(
        () => ({ balance: prefillBalance, date: prefillDate, statementOut: '', statementIn: '' }),
        [prefillBalance, prefillDate]
    )
    const { form, showRefusal } = useStatementForm(lastDate, values)

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
            if (!claimDialogWrite()) return
            start.mutate({ id: newRecordId(), values })
        })()

    const currency = account.currency || 'USD'
    const words = sideWords(account.type)
    const model: StatementDialogModel = {
        form,
        submit,
        isStarting,
        words,
        currency,
        beginning: formatMoney(last?.statement_balance ?? 0, currency),
        beginningNote: beginningNoteText(lastDate),
        fileNote: prefill ? statementFileNoteText(prefill.fileName) : '',
        onClose: closeStartDialog,
    }
    return model
}

// What the statement dialog draws and sends, for a start and for Edit info alike.
export type StatementDialogModel = {
    form: ReturnType<typeof useStatementForm>['form']
    submit: () => void
    // The dialog's write is in flight: the submit shows its spinner, Cancel is disabled.
    isStarting: boolean
    words: ReturnType<typeof sideWords>
    currency: string
    beginning: string
    beginningNote: string
    fileNote: string
    onClose: () => void
}

// The reconciliation in progress that Edit info edits, from the work screen's one record
// query: its stored statement fields, its account and the account's last finished
// statement date (the date rule; '' when it has none), and the dates of its cleared rows,
// which give the count an earlier date unclears.
export type ReconcileEditTarget = {
    reconciliation: Pick<
        BooksReconciliations,
        | 'id'
        | 'statement_date'
        | 'statement_balance'
        | 'beginning_balance'
        | 'has_statement_totals'
        | 'statement_out'
        | 'statement_in'
    >
    accountType: string
    currency: string
    lastDate: string
    rows: readonly { date: string; isCleared: boolean }[]
}

function storedValues(reconciliation: ReconcileEditTarget['reconciliation']): ReconcileStartValues {
    const hasTotals = reconciliation.has_statement_totals
    return {
        balance: centsToText(reconciliation.statement_balance),
        date: reconciliation.statement_date,
        statementOut: hasTotals ? centsToText(reconciliation.statement_out) : '',
        statementIn: hasTotals ? centsToText(reconciliation.statement_in) : '',
    }
}

/**
 * Edit info's form (reconcile spec §3 "Edit info", §4 "Writes"): the start dialog's form
 * and rules with the stored values; the account is fixed. The submit sets `isStarting` and
 * `heldStatement` (the stored date, with which the work screen reads its lines meanwhile)
 * before its one `update` of the reconciliation, so the work screen and the dialog stay
 * until the server has answered and a refusal shows in the dialog; after the server stored
 * it the dialog closes;
 * when the new date is earlier, the result line reads how many cleared rows the server
 * unclears (the cleared rows dated after the new date, counted before the save), and
 * nothing when none.
 */
export function useReconcileEdit(target: ReconcileEditTarget) {
    const [reconciliationsCollection] = useStore('books_reconciliations')
    const isStarting = useReconcileStore(s => s.isStarting)
    const { reconciliation } = target
    const values = useMemo(() => storedValues(reconciliation), [reconciliation])
    const { form, showRefusal } = useStatementForm(target.lastDate, values)

    const save = useMutation({
        mutationFn: function* ({ values }: { values: ReconcileStartValues; uncleared: number }) {
            yield reconciliationsCollection.update(reconciliation.id, draft => {
                Object.assign(draft, reconcileStartFields(values))
            })
        },
        onSuccess: (_data, { values, uncleared }) => {
            const store = useReconcileStore.getState()
            store.setEditOpen(false)
            const text = unclearedAfterText(uncleared, values.date)
            if (text !== '') store.setResult(reconciliation.id, { text, tone: 'muted' })
        },
        onError: showRefusal,
        onSettled: () => {
            const store = useReconcileStore.getState()
            store.holdStatement(null)
            store.setStarting(false)
        },
    })

    const submit = () =>
        form.handleSubmit(values => {
            if (!claimDialogWrite()) return
            // The work screen keeps the lines of the stored date until the update settles.
            useReconcileStore.getState().holdStatement({
                reconciliationId: reconciliation.id,
                statementDate: reconciliation.statement_date,
            })
            const uncleared = clearedAfterCount(target.rows, values.date)
            save.mutate({ values, uncleared })
        })()

    const currency = target.currency
    const model: StatementDialogModel = {
        form,
        submit,
        isStarting,
        words: sideWords(target.accountType),
        currency,
        beginning: formatMoney(reconciliation.beginning_balance, currency),
        beginningNote: beginningNoteText(target.lastDate),
        fileNote: '',
        onClose: closeEditDialog,
    }
    return model
}

// Cancel, Escape and the backdrop do nothing while the insert runs: the dialog stays until
// the server has answered, so a refusal shows in it.
export function closeStartDialog() {
    const store = useReconcileStore.getState()
    if (store.isStarting) return
    store.closeStart()
}

// The same rule for Edit info's update.
export function closeEditDialog() {
    const store = useReconcileStore.getState()
    if (store.isStarting) return
    store.setEditOpen(false)
}

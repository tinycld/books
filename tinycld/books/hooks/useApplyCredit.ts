import { extractValidationErrors, handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { atomic, useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { newRecordId } from 'pbtsdb/core'
import { useMemo, useRef, useState } from 'react'
import { Platform, type PressableInstance, type TextInputInstance } from 'react-native'
import {
    APPLY_CREDIT_MESSAGES,
    type ApplyCreditValues,
    appliedToastText,
    applyCreditSchema,
    applySummaryText,
} from '../lib/apply-credit-schema'
import { refusedRecordId } from '../lib/batch-refusal'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { DEFAULT_PAY_BILLS_SORT, sortPayBillsRows } from '../lib/pay-bills-rows'
import {
    amountToApply,
    clearPayments,
    entryCents,
    type OutstandingRow,
    type Payments,
    spreadAmount,
    tickRowCapped,
    typeRowPayment,
    untickRow,
} from '../lib/payment-allocation'
import { fillPaymentText } from '../lib/payment-texts'
import { todayIso } from '../lib/register-range'
import { useApplyCreditStore } from '../stores/apply-credit-store'
import { useBooksSettings } from './useBooksSettings'
import { useOpenBills } from './useOpenBills'

const LOG_CONTEXT = 'books.applyCredit'
const TOAST_MS = 4000

// The posted vendor credit the dialog applies.
export type ApplyCreditTarget = {
    id: string
    vendor: string
    // The vendor's display name, for the empty text.
    vendorName: string
    number: string
    date: string
    // The unapplied credit in cents.
    balance: number
    currency: string
}

type ApplyInsert = { id: string; bill: string; amount: number }
type ApplyVariables = { date: string; inserts: ApplyInsert[] }

// Today, or the credit date when the credit is post-dated (the apply date is never before it).
function defaultApplyDate(creditDate: string): string {
    const today = todayIso()
    return creditDate > today ? creditDate : today
}

// The entries of the listed rows only: a bill that left the list since the dialog opened
// (paid or voided elsewhere) is not applied.
function listedPayments(payments: Payments, rows: readonly OutstandingRow[]): Payments {
    const listed = new Set(rows.map(row => row.id))
    return Object.fromEntries(Object.entries(payments).filter(([id]) => listed.has(id)))
}

// One application per listed row above zero, in list order.
function insertsOf(
    payments: Payments,
    rows: readonly OutstandingRow[],
    currency: string
): ApplyInsert[] {
    return rows.flatMap(row => {
        const cents = entryCents(payments[row.id], currency)
        return cents > 0 ? [{ id: newRecordId(), bill: row.id, amount: cents }] : []
    })
}

// The bill a refusal names: the bill of the insert the batch refused, else the only bill
// written.
function refusedBill(error: unknown, inserts: readonly ApplyInsert[]): string | null {
    const recordId = refusedRecordId(error)
    if (recordId !== null) return inserts.find(insert => insert.id === recordId)?.bill ?? null
    return inserts.length === 1 ? inserts[0].bill : null
}

function appliedCount(payments: Payments, currency: string): number {
    return Object.values(payments).filter(entry => entryCents(entry, currency) > 0).length
}

/**
 * The apply dialog of a posted vendor credit (vendor credit spec §3.9). Rows: the vendor's
 * open bills (useOpenBills) by due date, then bill number. The form's values start once
 * the rows and the settings land: today (or the credit date, when later) and the credit
 * spread over the rows oldest due first, so ⌘↵ applies it in one key. Tick sets a row to
 * the lesser of its open balance and the credit not yet placed (`tickRowCapped`), or clears
 * it; typing keeps the text (`typeRowPayment`); ⌥↵ toggles the focused row; Clear empties
 * every row. Apply credit holds the dialog (`useApplyCreditStore.hold`, synchronous, before
 * the write) and writes one application per row above zero in one atomic batch. A refusal
 * keyed `bill` goes under that row's cell and the rest in the dialog's summary; after
 * success the dialog closes and a toast names what was applied. Retry also recovers
 * `sectionRecovery`, the read section's own failed open-bills read, so its notice returns.
 */
export function useApplyCredit(credit: ApplyCreditTarget, sectionRecovery: LiveRecovery) {
    const { currency } = credit
    const [applicationsCollection] = useStore('books_vendor_credit_applications')
    const settings = useBooksSettings()
    const openBills = useOpenBills({ vendor: credit.vendor })
    const billsRead = openBills.read
    const rows = useMemo(
        () => sortPayBillsRows(openBills.rows, DEFAULT_PAY_BILLS_SORT),
        [openBills.rows]
    )
    const loadFailed = billsRead.isError || settings.hasLoadError
    const isLoading = !loadFailed && (!billsRead.isReady || !settings.isReady)
    const isReady = !loadFailed && !isLoading

    const creditDate = credit.date.slice(0, 10)
    const closeDate = settings.settings?.close_date.slice(0, 10) ?? ''
    const resolver = useMemo(
        () =>
            zodResolver(
                applyCreditSchema({
                    creditDate,
                    closeDate,
                    unappliedCents: credit.balance,
                    rows,
                    currency,
                })
            ),
        [creditDate, closeDate, credit.balance, rows, currency]
    )
    // The start values, once, when the rows first land (adjusted in render, not an effect);
    // `values` hands them to the form, which keeps an Apply date typed while it loaded.
    const [start, setStart] = useState<ApplyCreditValues | null>(null)
    if (start === null && isReady) {
        setStart({
            date: defaultApplyDate(creditDate),
            payments: spreadAmount(rows, credit.balance),
        })
    }
    const form = useForm<ApplyCreditValues>({
        defaultValues: { date: defaultApplyDate(creditDate), payments: {} },
        values: start ?? undefined,
        resetOptions: { keepDirtyValues: true },
        resolver,
    })
    const { control, getValues, setValue, setError, clearErrors, trigger } = form
    // Read in render: the form state proxy updates it only once read here.
    const { isSubmitted } = form.formState
    const watched = useWatch({ control, name: 'payments' })
    const payments = listedPayments(watched ?? {}, rows)

    const applied = amountToApply(payments, currency)
    const summary = applySummaryText(
        applied,
        appliedCount(payments, currency),
        Math.max(0, credit.balance - applied),
        currency
    )

    const rowRefs = useRef(new Map<string, TextInputInstance>())
    const firstRowId = rows[0]?.id ?? ''
    const hasRows = isReady && firstRowId !== ''
    // The dialog names the first cell as its initial focus.
    const firstCellRef = useRef<TextInputInstance | null>(null)
    // Whether the first cell took the focus of this open. The dialog mounts once per open.
    const didFocusRef = useRef(false)
    const clearRef = useRef<PressableInstance | null>(null)
    // The row whose Credit to apply cell has focus, for ⌥↵.
    const focusedRowRef = useRef<string | null>(null)

    // After a submit, a change checks again what it touched, by leaf paths (RHF drops every
    // nested error of an object path it triggers as a whole); the summary's message waits
    // for the next Apply credit.
    const setRows = (next: Payments) => {
        const before = getValues('payments')
        setValue('payments', next, { shouldDirty: true })
        if (!isSubmitted) return
        clearErrors('root')
        const ids = new Set([...Object.keys(before), ...Object.keys(next)])
        void trigger([...ids].map(id => `payments.${id}.amount` as const))
    }

    // The credit the listed rows do not place yet.
    const leftOf = (current: Payments) =>
        credit.balance - amountToApply(listedPayments(current, rows), currency)

    const tickOrClear = (row: OutstandingRow) => {
        const current = getValues('payments')
        const isTicked = entryCents(current[row.id], currency) > 0
        setRows(
            isTicked
                ? untickRow(current, row.id)
                : tickRowCapped(current, row, leftOf(current), currency)
        )
    }

    const type = (row: OutstandingRow, text: string) => {
        setRows(typeRowPayment(getValues('payments'), row, text))
    }

    // ⌥↵ toggles the row whose cell has focus; with none focused it does nothing.
    const toggle = () => {
        const row = rows.find(item => item.id === focusedRowRef.current)
        if (row) tickOrClear(row)
    }

    const clear = () => setRows(clearPayments())

    // The first cell takes the focus once, when the measured list first draws it (web only:
    // a native keyboard would cover the Sheet). It waits one frame, after the dialog's own
    // focus on open took its first field; a later list swap (a resize) does not take it again.
    const focusFirstCell = () => {
        if (Platform.OS !== 'web' || didFocusRef.current) return
        requestAnimationFrame(() => {
            const cell = firstCellRef.current
            if (didFocusRef.current || cell === null) return
            didFocusRef.current = true
            cell.focus()
        })
    }

    const rowRef = (rowId: string) => (node: TextInputInstance | null) => {
        if (node) rowRefs.current.set(rowId, node)
        else rowRefs.current.delete(rowId)
        if (rowId !== firstRowId) return
        firstCellRef.current = node
        if (node) focusFirstCell()
    }

    // Enter in a cell: the next row's cell, or Clear after the last.
    const focusAfterRow = (rowId: string) => {
        const index = rows.findIndex(row => row.id === rowId)
        const next = rows
            .slice(index + 1)
            .map(row => rowRefs.current.get(row.id))
            .find(node => node !== undefined)
        if (next) next.focus()
        else clearRef.current?.focus()
    }

    const onFocusRow = (rowId: string | null) => {
        focusedRowRef.current = rowId
    }

    const retryLoad = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([billsRead.recovery, settings.recovery, sectionRecovery]),
            onError: error => log.error(LOG_CONTEXT, error),
        })
    }

    const showRefusal = (error: unknown, variables: ApplyVariables) => {
        const fields = extractValidationErrors(error) ?? {}
        const bill = refusedBill(error, variables.inserts)
        if (bill !== null && fields.bill) {
            setError(`payments.${bill}.amount`, { type: 'server', message: fields.bill })
            return
        }
        // Every other refusal (the date, the amount, the credit) goes to the summary; the
        // schema's own date rules stay under the date.
        const fieldMessage = Object.values(fields)[0]
        if (fieldMessage) {
            setError('root', { type: 'server', message: fieldMessage })
            return
        }
        handleMutationErrorsWithForm({
            setError,
            getValues,
            rootMessage: true,
            operation: LOG_CONTEXT,
        })(error)
    }

    const apply = useMutation({
        mutationFn: function* ({ date, inserts }: ApplyVariables) {
            yield atomic(() => {
                for (const insert of inserts) {
                    applicationsCollection.insert({
                        id: insert.id,
                        vendor_credit: credit.id,
                        bill: insert.bill,
                        amount: insert.amount,
                        date,
                    })
                }
            })
        },
        onSuccess: (_data, { inserts }) => {
            const cents = inserts.reduce((sum, insert) => sum + insert.amount, 0)
            useApplyCreditStore.getState().close()
            useToastStore.getState().addToast({
                title: appliedToastText(cents, inserts.length, currency),
                variant: 'success',
                duration: TOAST_MS,
            })
        },
        onError: showRefusal,
        onSettled: () => useApplyCreditStore.getState().release(),
    })
    const isSaving = apply.isPending

    const submit = () =>
        form.handleSubmit(values => {
            // The store's flag, not the render's `isPending`: two submits in one render both
            // see it, since it is set synchronously below.
            const store = useApplyCreditStore.getState()
            if (store.isHeld) return
            // The schema counts only the listed rows, so at least one of them has an amount.
            const inserts = insertsOf(values.payments, rows, currency)
            // Synchronous, before the optimistic inserts change the credit under the dialog.
            store.hold()
            apply.mutate({ date: values.date, inserts })
        })()

    return {
        form,
        rows,
        payments,
        isLoading,
        loadFailed,
        retryLoad,
        isEmpty: isReady && rows.length === 0,
        hasRows,
        emptyText: fillPaymentText(APPLY_CREDIT_MESSAGES.noOpenBills, credit.vendorName),
        canSave: hasRows && !isSaving,
        summary,
        tick: tickOrClear,
        type,
        toggle,
        clear,
        submit,
        isSaving,
        // Focus.
        firstCellRef,
        clearRef,
        rowRef,
        onFocusRow,
        focusAfterRow,
    }
}

export type ApplyCreditState = ReturnType<typeof useApplyCredit>

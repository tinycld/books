import { extractValidationErrors, handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { atomic, useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { newRecordId } from 'pbtsdb/core'
import { useMemo, useRef, useState } from 'react'
import { Platform, type PressableInstance, type TextInputInstance } from 'react-native'
import {
    type ApplyCreditValues,
    type ApplyFrom,
    type ApplyRow,
    appliedToastText,
    applyCreditSchema,
    applyDefaultDate,
    applyDialogState,
    applyRefusalTarget,
    applySideTexts,
    applySummaryText,
    sortApplyRows,
    spreadForDocument,
} from '../lib/apply-credit-schema'
import { refusedRecordId } from '../lib/batch-refusal'
import type { CreditApplicationKind } from '../lib/credit-application-kinds'
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
import { useMyCloseOverride } from './useMyCloseOverride'
import { useOpenBills } from './useOpenBills'
import { type OutstandingInvoice, useOutstandingInvoices } from './useOutstandingInvoices'
import { useUnappliedCreditMemos } from './useUnappliedCreditMemos'

const LOG_CONTEXT = 'books.applyCredit'
const TOAST_MS = 4000
const NO_STORED_INVOICES: readonly OutstandingInvoice[] = []

// The fixed side of the apply dialog (plan decision 3): a posted credit (`from: 'credit'`,
// the party's open documents are the rows) or a posted invoice (`from: 'document'`, the
// customer's credit memos with unapplied credit are the rows).
export type ApplyCreditTarget = {
    kind: CreditApplicationKind
    from: ApplyFrom
    id: string
    // The credit's or the invoice's party (vendor or customer).
    party: string
    // The party's display name, for the empty text.
    partyName: string
    number: string
    date: string
    // The fixed side's amount in cents: the credit's unapplied credit, or the invoice's open
    // balance.
    balance: number
    currency: string
    // The invoice a credit memo was made from (its `invoice`), or ''.
    sourceInvoice: string
}

type ApplyInsert = { id: string; rowId: string; amount: number }
type ApplyVariables = { date: string; inserts: ApplyInsert[] }
type RowsRead = { isReady: boolean; isError: boolean; recovery: LiveRecovery }

// The entries of the listed rows only: a row that left the list since the dialog opened
// (paid, applied or voided elsewhere) is not applied.
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
        return cents > 0 ? [{ id: newRecordId(), rowId: row.id, amount: cents }] : []
    })
}

// The row a refusal names: the row of the insert the batch refused, else the only row
// written.
function refusedRow(error: unknown, inserts: readonly ApplyInsert[]): string | null {
    const recordId = refusedRecordId(error)
    if (recordId !== null) return inserts.find(insert => insert.id === recordId)?.rowId ?? null
    return inserts.length === 1 ? inserts[0].rowId : null
}

function appliedCount(payments: Payments, currency: string): number {
    return Object.values(payments).filter(entry => entryCents(entry, currency) > 0).length
}

// The credit memos made from the invoice first (spec §3.3), each part in the list's order.
function sourceMemosFirst(rows: readonly ApplyRow[], sourceIds: ReadonlySet<string>) {
    return [
        ...rows.filter(row => sourceIds.has(row.id)),
        ...rows.filter(row => !sourceIds.has(row.id)),
    ]
}

/**
 * The rows of the dialog for its use, each read off for the other uses (plan decision 3):
 * a vendor credit's vendor's open bills (useOpenBills, by due date then number); a credit
 * memo's customer's open invoices (useOutstandingInvoices, this customer only), the invoice
 * the memo was made from first, then by due date, then number (sortApplyRows); an invoice's
 * customer's credit memos with unapplied credit (useUnappliedCreditMemos) as rows whose
 * `open` is the memo's unapplied credit and whose due date and `creditDate` are its date, a
 * memo made from the invoice first, then by date, then number.
 */
function useApplyRows(target: ApplyCreditTarget): { rows: ApplyRow[]; read: RowsRead } {
    const isVendor = target.kind.key === 'vendor_credit'
    const isFromDocument = target.from === 'document'
    const openBills = useOpenBills({ vendor: target.party, isEnabled: isVendor })
    const invoices = useOutstandingInvoices(
        !isVendor && !isFromDocument ? target.party : '',
        NO_STORED_INVOICES
    )
    const memos = useUnappliedCreditMemos(!isVendor && isFromDocument ? target.party : '')
    const billRows = openBills.rows
    const invoiceRows = invoices.rows
    const memoRows = memos.credits
    const { sourceInvoice, id } = target
    const rows = useMemo<ApplyRow[]>(() => {
        if (isVendor) return sortPayBillsRows(billRows, DEFAULT_PAY_BILLS_SORT)
        if (!isFromDocument) return sortApplyRows(invoiceRows, sourceInvoice)
        const credits = memoRows.map(memo => ({
            id: memo.id,
            number: memo.number,
            date: memo.date,
            due_date: memo.date,
            total: memo.total,
            open: memo.balance,
            creditDate: memo.date,
        }))
        const sourceIds = new Set(memoRows.filter(memo => memo.invoice === id).map(m => m.id))
        return sourceMemosFirst(sortApplyRows(credits, ''), sourceIds)
    }, [isVendor, isFromDocument, billRows, invoiceRows, memoRows, sourceInvoice, id])
    if (isVendor) return { rows, read: openBills.read }
    if (isFromDocument) return { rows, read: memos }
    return { rows, read: invoices }
}

// The ⌥↵ key's words in the dialog's modal scope (the shortcut list groups it by them).
function toggleKeyTexts(target: ApplyCreditTarget) {
    const { kind } = target
    if (target.from === 'document') {
        return {
            description: `Apply this ${kind.creditNoun.toLowerCase()}, or clear it`,
            group: `Apply credit to ${kind.documentNoun.toLowerCase()}`,
        }
    }
    return {
        description: `Apply the credit to this ${kind.documentNoun.toLowerCase()}, or clear it`,
        group: `Apply ${kind.creditNoun.toLowerCase()}`,
    }
}

/**
 * The shared apply dialog's state (vendor credit spec §3.9, apply credit spec §3.2–§3.4)
 * for one fixed side (`target`): the rows of its use (useApplyRows), the settings' close
 * date and the user's close-date override (useMyCloseOverride), which the schema reads
 * (applyCreditSchema with the kind's texts and `from`). The form's values start once the
 * rows land: from a credit, the credit spread over the rows in list order and the Apply
 * date today or the credit's date when later; from an invoice, the open balance placed over
 * the credit memos in list order (spreadForDocument) and the Apply date today or the latest
 * credit date of the memos that took a part. A tick sets a row to the lesser of its own
 * limit and what the fixed side has not placed yet (`tickRowCapped`), or clears it; typing
 * keeps the text; ⌥↵ toggles the focused row; Clear empties every row. `state`
 * (applyDialogState) picks the body (loading, load error, empty, rows), whether Apply
 * credit takes a press (rows, online, no write held) and whether the fields are disabled
 * (while the write is held). Apply credit holds the dialog (`useApplyCreditStore.hold`,
 * synchronous, before the write) and writes one application per row above zero in one
 * atomic batch. A refusal keyed by a row's document or credit (applyRefusalTarget) goes
 * under that row's cell, the rest in the dialog's summary; after success the dialog closes
 * and a toast names what was applied. Retry recovers every failed read of the dialog and
 * `sectionRecovery`, the read view's own failed read of the party's open documents, so its
 * notice returns too.
 */
export function useApplyCredit(target: ApplyCreditTarget, sectionRecovery: LiveRecovery) {
    const { kind, from, currency } = target
    const texts = applySideTexts(kind.texts, from)
    const [vendorApplications, memoApplications] = useStore(
        'books_vendor_credit_applications',
        'books_credit_memo_applications'
    )
    const settings = useBooksSettings()
    const closeOverride = useMyCloseOverride()
    const writes = useWritesAvailable()
    const isHeld = useApplyCreditStore(state => state.isHeld)
    const { rows, read: rowsRead } = useApplyRows(target)
    const loadFailed = rowsRead.isError || settings.hasLoadError || closeOverride.isError
    const isLoading =
        !loadFailed && (!rowsRead.isReady || !settings.isReady || !closeOverride.isReady)
    const isReady = !loadFailed && !isLoading
    const state = applyDialogState({
        isLoading,
        hasLoadError: loadFailed,
        rowCount: rows.length,
        writesAvailable: writes.available,
        isHeld,
    })

    const creditDate = from === 'credit' ? target.date.slice(0, 10) : ''
    const closeDate = settings.settings?.close_date.slice(0, 10) ?? ''
    const hasOverride = closeOverride.override !== undefined
    const fixedCents = target.balance
    const resolver = useMemo(
        () =>
            zodResolver(
                applyCreditSchema({
                    texts: kind.texts,
                    from,
                    creditDate,
                    closeDate,
                    hasOverride,
                    fixedCents,
                    rows,
                    currency,
                })
            ),
        [kind.texts, from, creditDate, closeDate, hasOverride, fixedCents, rows, currency]
    )
    const today = todayIso()
    const openDate = applyDefaultDate(today, creditDate === '' ? [] : [creditDate])
    // The start values, once, when the rows first land (adjusted in render, not an effect);
    // `values` hands them to the form, which keeps an Apply date typed while it loaded.
    const [start, setStart] = useState<ApplyCreditValues | null>(null)
    if (start === null && isReady) {
        if (from === 'credit') {
            setStart({ date: openDate, payments: spreadAmount(rows, fixedCents) })
        } else {
            const payments = spreadForDocument(rows, fixedCents)
            const placed = rows.filter(row => entryCents(payments[row.id], currency) > 0)
            const dates = placed.map(row => row.creditDate ?? '')
            setStart({ date: applyDefaultDate(today, dates), payments })
        }
    }
    const form = useForm<ApplyCreditValues>({
        defaultValues: { date: openDate, payments: {} },
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
        kind.texts,
        from,
        applied,
        appliedCount(payments, currency),
        Math.max(0, fixedCents - applied),
        currency
    )

    const rowRefs = useRef(new Map<string, TextInputInstance>())
    const firstRowId = rows[0]?.id ?? ''
    const hasRows = state.body === 'rows'
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

    // What the fixed side has not placed on the listed rows yet.
    const leftOf = (current: Payments) =>
        fixedCents - amountToApply(listedPayments(current, rows), currency)

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
            ...mergeRecoveries([
                rowsRead.recovery,
                settings.recovery,
                closeOverride.recovery,
                sectionRecovery,
            ]),
            onError: error => log.error(LOG_CONTEXT, error),
        })
    }

    const showRefusal = (error: unknown, variables: ApplyVariables) => {
        const fields = extractValidationErrors(error) ?? {}
        const rowKey = Object.keys(fields).find(key => applyRefusalTarget(key) === 'row')
        const rowId = refusedRow(error, variables.inserts)
        if (rowKey !== undefined && rowId !== null) {
            setError(`payments.${rowId}.amount`, { type: 'server', message: fields[rowKey] })
            return
        }
        // Every other refusal (the date, the close date, the amount) goes to the summary;
        // the schema's own date rules stay under the date.
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

    // One application for an insert: from a credit, the target is the credit and the row the
    // document; from a document, the other way round. Two typed branches, one per kind's
    // collection (plan decision 4).
    const insertApplication = (insert: ApplyInsert, date: string) => {
        const credit = from === 'credit' ? target.id : insert.rowId
        const document = from === 'credit' ? insert.rowId : target.id
        const { id, amount } = insert
        if (kind.key === 'vendor_credit') {
            vendorApplications.insert({ id, vendor_credit: credit, bill: document, amount, date })
        } else {
            memoApplications.insert({ id, credit_memo: credit, invoice: document, amount, date })
        }
    }

    const apply = useMutation({
        mutationFn: function* ({ date, inserts }: ApplyVariables) {
            yield atomic(() => {
                for (const insert of inserts) insertApplication(insert, date)
            })
        },
        onSuccess: (_data, { inserts }) => {
            const cents = inserts.reduce((sum, insert) => sum + insert.amount, 0)
            useApplyCreditStore.getState().close()
            useToastStore.getState().addToast({
                title: appliedToastText(kind.texts, from, cents, inserts.length, currency),
                variant: 'success',
                duration: TOAST_MS,
            })
        },
        onError: showRefusal,
        onSettled: () => useApplyCreditStore.getState().release(),
    })

    const submit = () =>
        form.handleSubmit(values => {
            // The store's flag, not the render's `isPending`: two submits in one render both
            // see it, since it is set synchronously below.
            const store = useApplyCreditStore.getState()
            if (store.isHeld) return
            // The schema counts only the listed rows, so at least one of them has an amount.
            const inserts = insertsOf(values.payments, rows, currency)
            // Synchronous, before the optimistic inserts change the balances under the dialog.
            store.hold()
            apply.mutate({ date: values.date, inserts })
        })()

    return {
        form,
        rows,
        payments,
        state,
        retryLoad,
        texts,
        title: fillPaymentText(texts.title, target.number),
        emptyText: fillPaymentText(texts.empty, target.partyName),
        toggleKey: toggleKeyTexts(target),
        listDoc:
            from === 'document'
                ? (kind.outstanding.document ?? kind.outstanding.credit)
                : kind.outstanding.credit,
        hasRows,
        summary,
        tick: tickOrClear,
        type,
        toggle,
        clear,
        submit,
        // Focus.
        firstCellRef,
        clearRef,
        rowRef,
        onFocusRow,
        focusAfterRow,
    }
}

export type ApplyCreditState = ReturnType<typeof useApplyCredit>

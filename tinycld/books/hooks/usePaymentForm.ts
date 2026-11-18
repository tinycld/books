import { log } from '@tinycld/core/lib/logger'
import { useForm, zodResolver } from '@tinycld/core/ui/form'
import { useMemo, useRef } from 'react'
import { type FieldErrors, type PathValue, useWatch } from 'react-hook-form'
import type { PressableInstance, TextInputInstance } from 'react-native'
import { moneyInputCents } from '../lib/money-input'
import {
    amountToApply,
    clearPayments,
    entryCents,
    followedAmount,
    isEveryRowPaid,
    type OutstandingRow,
    type Payments,
    payAll,
    spreadAmount,
    tickRow,
    toggleRow,
    typeRowPayment,
    untickRow,
} from '../lib/payment-allocation'
import { type PaymentFlow, sumErrorOf } from '../lib/payment-flow'
import { paymentSchemaWith } from '../lib/payment-schema'
import type { PaymentFormValues } from '../lib/payment-values'

interface PaymentFormValuesInput {
    flow: PaymentFlow
    initial: PaymentFormValues
    currency: string
    // The values the account field lists.
    accountOptions: readonly string[]
    // A row's document date by id, for the flow's row-date rule; null runs none.
    rowDates?: Readonly<Record<string, string>> | null
    // The refusal a new payment's form handed to this draft's form, as form errors; it
    // keeps one identity for the form's life, so the form applies it once.
    initialErrors?: FieldErrors<PaymentFormValues>
}

/**
 * A payment form's values under the flow's rules (`paymentSchemaWith`), and the values as
 * drawn. The first hook of a flow's form: its reads (the party's open documents, the
 * party's name) follow the drawn party.
 */
export function usePaymentFormValues({
    flow,
    initial,
    currency,
    accountOptions,
    rowDates = null,
    initialErrors,
}: PaymentFormValuesInput) {
    const optionsKey = accountOptions.join('\n')
    const resolver = useMemo(
        () =>
            zodResolver(
                paymentSchemaWith({
                    currency,
                    accountOptions: optionsKey.split('\n'),
                    texts: flow.texts,
                    sumRule: flow.sumRule,
                    rowDates,
                })
            ),
        [currency, optionsKey, flow, rowDates]
    )
    const form = useForm<PaymentFormValues>({
        defaultValues: initial,
        resolver,
        errors: initialErrors,
    })
    const values = useWatch({ control: form.control }) as PaymentFormValues
    return { form, values }
}

export type PaymentFormValuesState = ReturnType<typeof usePaymentFormValues>

// The open documents of the drawn party, as the flow's own read gives them.
export type PaymentOutstanding = {
    rows: OutstandingRow[]
    isReady: boolean
    isError: boolean
    retry: () => void
}

interface PaymentFormInput {
    flow: PaymentFlow
    formValues: PaymentFormValuesState
    currency: string
    outstanding: PaymentOutstanding
    // A one-time read of a party's open documents, for the pick that re-applies a typed
    // amount in the event (the flow's loader); a failed read rejects.
    loadOutstanding: (partyId: string) => Promise<OutstandingRow[]>
    partyName: string
}

// The lines under the list (the flow's totals) and the live sum refusal, before any
// submit: the flow's sum rule (`sumErrorOf`), the same one the schema refuses with.
function totalsOf(flow: PaymentFlow, values: PaymentFormValues, currency: string) {
    const input = {
        amountCents: moneyInputCents(values.amount, currency),
        rowsCents: amountToApply(values.payments, currency),
        currency,
    }
    return { lines: flow.totals(input), sumError: sumErrorOf(flow, input) }
}

/**
 * A payment form's allocation handlers (lib/payment-allocation.ts) over the flow's open
 * documents. While the amount was not typed it follows the rows after every row change;
 * typing it spreads it over the rows. The header tick box pays every row, or clears them
 * all when every row is paid. A pick of another party clears the rows; with a typed
 * amount it reads the new party's list once and spreads the amount in the same event, and
 * a pick that a later pick overtook drops its result.
 */
export function usePaymentForm({
    flow,
    formValues,
    currency,
    outstanding,
    loadOutstanding,
    partyName,
}: PaymentFormInput) {
    const { form, values } = formValues
    const { setValue, getValues, setError, trigger } = form
    // Read in render: the form state proxy updates `isSubmitted` only once it is read here.
    const { isSubmitted } = form.formState
    const totals = totalsOf(flow, values, currency)

    const dateRef = useRef<TextInputInstance | null>(null)
    const clearRef = useRef<PressableInstance | null>(null)
    const rowRefs = useRef(new Map<string, TextInputInstance>())
    // The row whose Payment cell has focus, for ⌥↵.
    const focusedRowRef = useRef<string | null>(null)

    const write = <K extends 'payments' | 'amount' | 'amountTyped' | 'party'>(
        name: K,
        value: PathValue<PaymentFormValues, K>
    ) => {
        setValue(name, value, { shouldDirty: true })
    }

    // After a submit, a change checks again what it touched. `payments` is checked by its
    // leaf paths (each row's amount and the sum rule's `payments.root`): RHF drops every
    // nested error of an object path that it triggers as a whole. `before` names the rows a
    // change removed, so their errors go too.
    const revalidate = (before: Payments, withParty = false) => {
        if (!isSubmitted) return
        const ids = new Set([...Object.keys(before), ...Object.keys(getValues('payments'))])
        const rowNames = [...ids].map(id => `payments.${id}.amount` as const)
        const party = withParty ? (['party'] as const) : []
        void trigger(['amount', 'payments.root', ...party, ...rowNames])
    }

    // A row change: the amount follows it unless the user typed it.
    const setRows = (next: Payments) => {
        const before = getValues('payments')
        write('payments', next)
        if (!getValues('amountTyped')) write('amount', followedAmount(next, currency))
        revalidate(before)
    }

    const rowById = (id: string): OutstandingRow | undefined =>
        outstanding.rows.find(row => row.id === id)

    const onAmountTyped = (text: string) => {
        const before = getValues('payments')
        const isEmpty = text.trim() === ''
        const cents = moneyInputCents(text, currency)
        const spread = cents === null ? clearPayments() : spreadAmount(outstanding.rows, cents)
        write('amount', text)
        write('amountTyped', !isEmpty)
        write('payments', isEmpty ? clearPayments() : spread)
        revalidate(before)
    }

    const onRowTick = (row: OutstandingRow) => {
        const payments = getValues('payments')
        const isPaid = entryCents(payments[row.id], currency) > 0
        setRows(isPaid ? untickRow(payments, row.id) : tickRow(payments, row))
    }

    const onRowType = (row: OutstandingRow, text: string) => {
        setRows(typeRowPayment(getValues('payments'), row, text))
    }

    // ⌥↵ toggles the row whose Payment cell has focus; with none focused it does nothing.
    const onRowToggle = () => {
        const row = focusedRowRef.current ? rowById(focusedRowRef.current) : undefined
        if (!row) return
        setRows(toggleRow(getValues('payments'), row, currency))
    }

    const onPayAll = () => setRows(payAll(outstanding.rows))

    const onClear = () => setRows(clearPayments())

    // The header tick box: with every row paid it clears them all (as the clear link
    // does), else it pays every row (as ⌥A does).
    const onTickAll = () => {
        const isAllPaid = isEveryRowPaid(outstanding.rows, getValues('payments'), currency)
        setRows(isAllPaid ? clearPayments() : payAll(outstanding.rows))
    }

    const onPartyPicked = async (id: string) => {
        // Picking the chosen party again changes nothing; the picker still moves focus.
        if (id === getValues('party')) return
        const before = getValues('payments')
        write('party', id)
        write('payments', clearPayments())
        const isTyped = getValues('amountTyped')
        if (!isTyped) write('amount', '')
        revalidate(before, true)
        if (!isTyped) return
        const cents = moneyInputCents(getValues('amount'), currency)
        if (cents === null || cents <= 0 || id === '') return
        try {
            const rows = await loadOutstanding(id)
            if (getValues('party') !== id) return
            const cleared = getValues('payments')
            write('payments', spreadAmount(rows, cents))
            revalidate(cleared)
        } catch (err) {
            log.error(flow.logContext, err)
            if (getValues('party') !== id) return
            setError('root', { type: 'server', message: flow.texts.listLoadFailed })
        }
    }

    // Find invoice no. found the invoice while no customer was chosen: its customer becomes
    // the form's. A typed amount above zero keeps its value and is re-applied to the
    // invoice, up to its open balance (the rest is Amount to credit). Else the invoice is
    // paid in full and the amount follows that payment.
    const onFindPicked = (document: OutstandingRow, party: string) => {
        if (getValues('party') !== '') return
        const before = getValues('payments')
        const cents = moneyInputCents(getValues('amount'), currency)
        const isTyped = getValues('amountTyped') && cents !== null && cents > 0
        write('party', party)
        if (isTyped) {
            write('payments', spreadAmount([document], cents))
        } else {
            const payments = tickRow(clearPayments(), document)
            write('payments', payments)
            write('amountTyped', false)
            write('amount', followedAmount(payments, currency))
        }
        revalidate(before, true)
    }

    // Enter in a Payment cell: the next drawn row's cell (a row the find filter hides has
    // no cell), or the clear link after the last.
    const focusAfterRow = (rowId: string) => {
        const index = outstanding.rows.findIndex(row => row.id === rowId)
        const next = outstanding.rows
            .slice(index + 1)
            .map(row => rowRefs.current.get(row.id))
            .find(node => node !== undefined)
        if (next) next.focus()
        else clearRef.current?.focus()
    }

    const rowRef = (rowId: string) => (node: TextInputInstance | null) => {
        if (node) rowRefs.current.set(rowId, node)
        else rowRefs.current.delete(rowId)
    }

    return {
        form,
        values,
        outstanding,
        partyName,
        totals,
        dateRef,
        clearRef,
        rowRef,
        focusedRowRef,
        onAmountTyped,
        onRowTick,
        onRowType,
        onRowToggle,
        onPayAll,
        onClear,
        onTickAll,
        onPartyPicked,
        onFindPicked,
        focusAfterRow,
        focusDate: () => dateRef.current?.focus(),
    }
}

export type PaymentFormState = ReturnType<typeof usePaymentForm>

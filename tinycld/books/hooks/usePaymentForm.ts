import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { useForm, zodResolver } from '@tinycld/core/ui/form'
import { useMemo, useRef } from 'react'
import { type FieldErrors, type PathValue, useWatch } from 'react-hook-form'
import type { PressableInstance, TextInputInstance } from 'react-native'
import { formatMoney } from '../lib/money'
import { moneyInputCents } from '../lib/money-input'
import {
    amountToApply,
    amountToCredit,
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
import { paymentSchema } from '../lib/payment-schema'
import { fillPaymentText, PAYMENT_MESSAGES } from '../lib/payment-texts'
import type { PaymentFormValues } from '../lib/payment-values'
import {
    type OutstandingInvoice,
    useOutstandingInvoices,
    useOutstandingLoader,
} from './useOutstandingInvoices'

interface PaymentFormInput {
    initial: PaymentFormValues
    currency: string
    // The values Deposit to lists (`paymentDepositOptions`).
    depositOptions: readonly string[]
    // The invoices the stored applications name, and what a corrected original applied.
    storedInvoices: readonly OutstandingInvoice[]
    extraOpen?: Readonly<Record<string, number>>
    // The refusal a new payment's form handed to this draft's form, as form errors; it
    // keeps one identity for the form's life, so the form applies it once.
    initialErrors?: FieldErrors<PaymentFormValues>
}

// The figures under the list, from the values; the refusal line is live, before any submit.
function totalsOf(values: PaymentFormValues, currency: string, customerName: string) {
    const applyCents = amountToApply(values.payments, currency)
    const amountCents = moneyInputCents(values.amount, currency)
    const creditCents = amountToCredit(amountCents, applyCents)
    const isOver = amountCents !== null && amountCents > 0 && applyCents > amountCents
    const over = isOver
        ? fillPaymentText(
              PAYMENT_MESSAGES.sumOverAmount,
              formatMoney(applyCents, currency),
              formatMoney(amountCents, currency)
          )
        : ''
    return {
        apply: formatMoney(applyCents, currency),
        credit: creditCents > 0 ? formatMoney(creditCents, currency) : '',
        creditNote: fillPaymentText(PAYMENT_MESSAGES.keptAsCredit, customerName),
        over,
    }
}

/**
 * The receive-payment form: its values under `paymentSchema`, the outstanding list of the
 * chosen customer, and the allocation handlers (lib/payment-allocation.ts). While Amount
 * received was not typed it follows the rows after every row change; typing it spreads it
 * over the rows. The header tick box pays every row, or clears them all when every row is
 * paid. A pick of another customer clears the rows; with a typed amount it reads the new
 * customer's list once and spreads the amount in the same event, and a pick that a later
 * pick overtook drops its result.
 */
export function usePaymentForm({
    initial,
    currency,
    depositOptions,
    storedInvoices,
    extraOpen,
    initialErrors,
}: PaymentFormInput) {
    const optionsKey = depositOptions.join('\n')
    const resolver = useMemo(
        () => zodResolver(paymentSchema(currency, optionsKey.split('\n'))),
        [currency, optionsKey]
    )
    const form = useForm<PaymentFormValues>({
        defaultValues: initial,
        resolver,
        errors: initialErrors,
    })
    const { control, setValue, getValues, setError, trigger } = form
    // Read in render: the form state proxy updates `isSubmitted` only once it is read here.
    const { isSubmitted } = form.formState
    const values = useWatch({ control }) as PaymentFormValues
    const outstanding = useOutstandingInvoices(values.customer, storedInvoices, extraOpen)
    const loadOutstanding = useOutstandingLoader(storedInvoices, extraOpen)
    const [customersCollection] = useStore('books_customers')
    const customerRow = useRecord(customersCollection, values.customer || null)
    const customerName = customerRow.record?.display_name ?? ''
    const totals = totalsOf(values, currency, customerName)

    const dateRef = useRef<TextInputInstance | null>(null)
    const clearRef = useRef<PressableInstance | null>(null)
    const rowRefs = useRef(new Map<string, TextInputInstance>())
    // The row whose Payment cell has focus, for ⌥↵.
    const focusedRowRef = useRef<string | null>(null)

    const write = <K extends 'payments' | 'amount' | 'amountTyped' | 'customer'>(
        name: K,
        value: PathValue<PaymentFormValues, K>
    ) => {
        setValue(name, value, { shouldDirty: true })
    }

    // After a submit, a change checks again what it touched. `payments` is checked by its
    // leaf paths (each row's amount and the sum rule's `payments.root`): RHF drops every
    // nested error of an object path that it triggers as a whole. `before` names the rows a
    // change removed, so their errors go too.
    const revalidate = (before: Payments, withCustomer = false) => {
        if (!isSubmitted) return
        const ids = new Set([...Object.keys(before), ...Object.keys(getValues('payments'))])
        const rowNames = [...ids].map(id => `payments.${id}.amount` as const)
        const customer = withCustomer ? (['customer'] as const) : []
        void trigger(['amount', 'payments.root', ...customer, ...rowNames])
    }

    // A row change: Amount received follows it unless the user typed it.
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

    // The header tick box: with every row paid it clears them all (as Clear payments
    // does), else it pays every row (as Pay all does).
    const onTickAll = () => {
        const isAllPaid = isEveryRowPaid(outstanding.rows, getValues('payments'), currency)
        setRows(isAllPaid ? clearPayments() : payAll(outstanding.rows))
    }

    const onCustomerPicked = async (id: string) => {
        // Picking the chosen customer again changes nothing; the picker still moves focus.
        if (id === getValues('customer')) return
        const before = getValues('payments')
        write('customer', id)
        write('payments', clearPayments())
        const isTyped = getValues('amountTyped')
        if (!isTyped) write('amount', '')
        revalidate(before, true)
        if (!isTyped) return
        const cents = moneyInputCents(getValues('amount'), currency)
        if (cents === null || cents <= 0 || id === '') return
        try {
            const rows = await loadOutstanding(id)
            if (getValues('customer') !== id) return
            const cleared = getValues('payments')
            write('payments', spreadAmount(rows, cents))
            revalidate(cleared)
        } catch (err) {
            log.error('books.payment', err)
            if (getValues('customer') !== id) return
            setError('root', { type: 'server', message: PAYMENT_MESSAGES.listLoadFailed })
        }
    }

    // Find invoice no. found the invoice while no customer was chosen: its customer becomes
    // the form's, and the invoice is paid in full. Amount received follows that payment.
    const onFindPicked = (invoice: OutstandingRow, customer: string) => {
        if (getValues('customer') !== '') return
        const before = getValues('payments')
        const payments = tickRow(clearPayments(), invoice)
        write('customer', customer)
        write('payments', payments)
        write('amountTyped', false)
        write('amount', followedAmount(payments, currency))
        revalidate(before, true)
    }

    // Enter in a Payment cell: the next drawn row's cell (a row the find filter hides has
    // no cell), or Clear payments after the last.
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
        customerName,
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
        onCustomerPicked,
        onFindPicked,
        focusAfterRow,
        focusDate: () => dateRef.current?.focus(),
    }
}

export type PaymentFormState = ReturnType<typeof usePaymentForm>

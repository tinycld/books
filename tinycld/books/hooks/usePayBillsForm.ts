import { useForm, zodResolver } from '@tinycld/core/ui/form'
import { useMemo, useRef, useState } from 'react'
import { get, useWatch } from 'react-hook-form'
import type { PressableInstance, TextInputInstance } from 'react-native'
import { useSearchPicker } from '../components/SearchPicker'
import type { PaidFromAccount } from '../forms/payment-fields'
import { formatMoney } from '../lib/money'
import { defaultMethodFor } from '../lib/paid-from'
import { newBalanceCents } from '../lib/pay-bills-balance'
import { checkPlanText, payBillsGroups } from '../lib/pay-bills-plan'
import {
    DEFAULT_PAY_BILLS_SORT,
    type DueFilter,
    filterPayBillsRows,
    hiddenPaidCount,
    type PayBillsRow,
    type PayBillsSort,
    type PayBillsVendorOption,
    sortPayBillsRows,
} from '../lib/pay-bills-rows'
import { payBillsSchema } from '../lib/pay-bills-schema'
import { type PayBillsList, payBillsListOf } from '../lib/pay-bills-screen-state'
import {
    hiddenText,
    openCountText,
    originalNowText,
    selectedText,
    totalFigureText,
} from '../lib/pay-bills-texts'
import {
    correctionPayBillsValues,
    newPayBillsValues,
    type PayBillsFormValues,
} from '../lib/pay-bills-values'
import {
    clearPayments,
    entryCents,
    isEveryRowPaid,
    type Payments,
    payAll,
    tickRow,
    toggleRow,
    typeRowPayment,
    untickRow,
} from '../lib/payment-allocation'
import { usePayBillsStore } from '../stores/pay-bills-store'
import type { BooksBillPaymentLines, BooksBillPayments, BooksVendors } from '../types'
import { usePaidFromAccounts } from './usePaidFromAccounts'

// The screen's filters and sort (spec §3.3 "Filters are screen state"): this screen's own,
// so a second Pay Bills stacked on it neither shares nor clears them.
type PayBillsFilterState = { vendor: string; due: DueFilter; sort: PayBillsSort }

export type PayBillsFormInput = {
    // Every open bill listed, in any order.
    rows: readonly PayBillsRow[]
    vendorOptions: readonly PayBillsVendorOption[]
    currency: string
    // ISO day: the default Payment date and the Due filters' today.
    today: string
    // `?bill=`: that bill paid for its open balance and its vendor filtered.
    startBill: string | null
    // `?vendor=`: the Vendor filter's vendor.
    startVendor: string | null
    mode: 'new' | 'replaces'
    // `?replaces`: the posted payment the form corrects; null on a new screen.
    original: PayBillsOriginal | null
}

// The posted payment a correction starts from, and its lines.
export type PayBillsOriginal = {
    payment: Pick<
        BooksBillPayments,
        | 'id'
        | 'number'
        | 'vendor'
        | 'total'
        | 'paid_from'
        | 'date'
        | 'payment_method'
        | 'reference_no'
    > & { vendorRow?: Pick<BooksVendors, 'display_name'> }
    lines: readonly Pick<BooksBillPaymentLines, 'bill' | 'amount'>[]
}

export const ALL_VENDORS_TEXT = 'All vendors'

const DUE_LABELS: Record<DueFilter, string> = {
    any: 'Any time',
    overdue: 'Overdue',
    week: 'Due in 7 days',
}

const DUE_ORDER: readonly DueFilter[] = ['any', 'overdue', 'week']

// The touch sort chip's choices (the grid's sortable headers, by their header text).
const SORT_LABELS: Record<PayBillsSort['column'], string> = {
    due: 'Due date',
    vendor: 'Vendor',
}

const SORT_ORDER: readonly PayBillsSort['column'][] = ['due', 'vendor']

export type PayBillsDueItem = {
    id: DueFilter
    label: string
    isSelected: boolean
    onSelect: () => void
}

export type PayBillsSortItem = {
    id: PayBillsSort['column']
    label: string
    isSelected: boolean
    onSelect: () => void
}

// A header press or a sort choice: sort by that column, or reverse it when it already is.
function nextSort(sort: PayBillsSort, column: PayBillsSort['column']): PayBillsSort {
    if (sort.column === column) return { column, descending: !sort.descending }
    return { column, descending: false }
}

function sortLabelOf(sort: PayBillsSort): string {
    const arrow = sort.descending ? '↓' : '↑'
    return `Sort: ${SORT_LABELS[sort.column]} ${arrow}`
}

export type PayBillsBalances = {
    isVisible: boolean
    current: string
    // `?replaces`, paid from the original's account: "Payment 1004 now" and the original
    // total it puts back ("+$920.00"; "−$920.00" on a credit card account).
    originalNow: { isVisible: boolean; label: string; amount: string }
    totalPayment: string
    newBalance: string
    // A bank account goes below zero: New balance shows in the danger tone.
    isNewBalanceNegative: boolean
}

const NO_ORIGINAL_NOW = { isVisible: false, label: '', amount: '' }

const NO_BALANCES: PayBillsBalances = {
    isVisible: false,
    current: '',
    originalNow: NO_ORIGINAL_NOW,
    totalPayment: '',
    newBalance: '',
    isNewBalanceNegative: false,
}

function balanceAccountType(type: string): 'bank' | 'credit_card' | null {
    if (type === 'bank' || type === 'credit_card') return type
    return null
}

function matchesTerm(label: string, term: string): boolean {
    const needle = term.trim().toLowerCase()
    return needle === '' || label.toLowerCase().includes(needle)
}

// The row ids with an error under their Payment cell: a filter never hides them.
function refusedRowIds(errors: unknown, rows: readonly PayBillsRow[]): string[] {
    return rows
        .filter(row => get(errors, `payments.${row.id}.amount`) !== undefined)
        .map(row => row.id)
}

// The vendor the screen filters to: a correction's own vendor (fixed); on a new screen
// `?bill=`'s vendor, else `?vendor=`.
function startFilterVendor(input: PayBillsFormInput): string {
    if (input.original) return input.original.payment.vendor
    const bill = input.startBill ? input.rows.find(row => row.id === input.startBill) : undefined
    return bill?.vendor ?? input.startVendor ?? ''
}

// The values the form mounts with: a correction's from its original (spec §3.6), else a
// new screen's.
function startValues(input: PayBillsFormInput): PayBillsFormValues {
    const { original } = input
    if (original) {
        return correctionPayBillsValues({
            payment: original.payment,
            lines: original.lines,
            rows: input.rows,
        })
    }
    return newPayBillsValues({
        paidFrom: '',
        method: '',
        today: input.today,
        billId: input.startBill,
        rows: input.rows,
    })
}

/**
 * The Pay Bills form (spec §3.2–§3.4): its values under `payBillsSchema`, the list the
 * filters and the sort keep (this screen's own state), the selection handlers
 * (lib/payment-allocation.ts), and every text and figure the view draws, so the view holds
 * no logic. A filter keeps a hidden row's payment; ⌥A and the header tick box act on the
 * shown rows only. Picking Paid from sets the method (`defaultMethodFor`).
 */
export function usePayBillsForm(input: PayBillsFormInput) {
    const { rows, vendorOptions, currency, today, mode, original } = input
    const openByBill = useMemo(
        () => Object.fromEntries(rows.map(row => [row.id, row.open])),
        [rows]
    )
    const resolver = useMemo(
        () => zodResolver(payBillsSchema(currency, openByBill, mode)),
        [currency, openByBill, mode]
    )
    // The defaults are read once, when the form mounts (the screen mounts it ready).
    const [initial] = useState(() => startValues(input))
    const form = useForm<PayBillsFormValues>({ defaultValues: initial, resolver })
    const { control, setValue, getValues, trigger, clearErrors } = form
    // Read in render: the form state proxy updates these only once read here.
    const { isSubmitted, errors } = form.formState
    const [paidFromId, paymentMethod, referenceNo, payments] = useWatch({
        control,
        name: ['paid_from', 'payment_method', 'reference_no', 'payments'],
    })

    // The filters start from the route (`?bill`'s vendor, else `?vendor`) when the form
    // mounts; the screen mounts it once its reads are ready.
    const [filters, setFilters] = useState<PayBillsFilterState>(() => ({
        vendor: startFilterVendor(input),
        due: 'any',
        sort: DEFAULT_PAY_BILLS_SORT,
    }))
    const { vendor: vendorFilter, due, sort } = filters
    const isHolding = usePayBillsStore(s => s.holding)

    const keep = refusedRowIds(errors, rows)
    // Every listed row in the list's order, hidden ones too (a hidden row keeps its
    // payment): the write plan numbers each vendor's lines in this order.
    const listRows = sortPayBillsRows(rows, sort)
    const shown = filterPayBillsRows(listRows, { vendor: vendorFilter, due, today, keep })
    const list: PayBillsList = payBillsListOf(rows.length, shown.length)

    const paidRows = rows.filter(row => entryCents(payments[row.id], currency) > 0)
    const paidVendors = new Set(paidRows.map(row => row.vendor)).size
    // Every listed row's entry, parsable or not: the figure shows "—" for an amount that
    // does not parse and "Too large" above the stored limit.
    const listedPayments: Payments = Object.fromEntries(
        rows.flatMap(row => {
            const entry = payments[row.id]
            return entry ? [[row.id, entry]] : []
        })
    )
    const totalCents = paidRows.reduce(
        (sum, row) => sum + entryCents(payments[row.id], currency),
        0
    )
    const hiddenCount = hiddenPaidCount(rows, shown, payments, currency)
    // A correction keeps one check number, its own Check no., so it has no check plan.
    const checkPlan =
        mode === 'new'
            ? checkPlanText({
                  vendors: payBillsGroups({
                      rows: listRows,
                      payments,
                      currency,
                      startCheckNo: referenceNo,
                      method: paymentMethod,
                  }),
              })
            : ''

    const paidFrom = usePaidFromAccounts()
    const balances = balancesOf({
        account: paidFrom.accounts.find(account => account.id === paidFromId),
        current: paidFrom.balanceOf(paidFromId),
        totalCents,
        currency,
        original: original?.payment ?? null,
    })

    const vendorPicker = useSearchPicker()
    const vendorLabel =
        vendorOptions.find(option => option.id === vendorFilter)?.label ??
        original?.payment.vendorRow?.display_name ??
        ALL_VENDORS_TEXT
    const vendorPickerOptions = vendorOptions.filter(option =>
        matchesTerm(option.label, vendorPicker.debouncedTerm)
    )
    const setVendorFilter = (vendor: string) => setFilters(current => ({ ...current, vendor }))
    const setDue = (next: DueFilter) => setFilters(current => ({ ...current, due: next }))
    const onSort = (column: PayBillsSort['column']) =>
        setFilters(current => ({ ...current, sort: nextSort(current.sort, column) }))
    // A correction's vendor is fixed: clearing the filters keeps it.
    const baseVendor = original?.payment.vendor ?? ''
    const resetFilters = () =>
        setFilters({ vendor: baseVendor, due: 'any', sort: DEFAULT_PAY_BILLS_SORT })

    const dueItems: PayBillsDueItem[] = DUE_ORDER.map(id => ({
        id,
        label: DUE_LABELS[id],
        isSelected: id === due,
        onSelect: () => setDue(id),
    }))
    // Choosing the sorted column again reverses it, as a second header press does.
    const sortItems: PayBillsSortItem[] = SORT_ORDER.map(id => ({
        id,
        label: SORT_LABELS[id],
        isSelected: id === sort.column,
        onSelect: () => onSort(id),
    }))

    const clearRef = useRef<PressableInstance | null>(null)
    const rowRefs = useRef(new Map<string, TextInputInstance>())
    // The row whose Payment cell has focus, for ⌥↵.
    const focusedRowRef = useRef<string | null>(null)
    // Paid from takes the focus when it mounts (web); Pay & new remounts it to focus again.
    const [paidFromMount, setPaidFromMount] = useState(0)

    // After a submit, a change checks again what it touched, by leaf paths (RHF drops
    // every nested error of an object path it triggers as a whole). `before` names the
    // rows a change removed, so their errors go too.
    const revalidate = (before: Payments) => {
        if (!isSubmitted) return
        const ids = new Set([...Object.keys(before), ...Object.keys(getValues('payments'))])
        const rowNames = [...ids].map(id => `payments.${id}.amount` as const)
        void trigger(rowNames)
    }

    const setRows = (next: Payments) => {
        const before = getValues('payments')
        setValue('payments', next, { shouldDirty: true })
        revalidate(before)
    }

    const rowById = (id: string) => rows.find(row => row.id === id)

    const onRowTick = (row: PayBillsRow) => {
        const current = getValues('payments')
        const isPaid = entryCents(current[row.id], currency) > 0
        setRows(isPaid ? untickRow(current, row.id) : tickRow(current, row))
    }

    const onRowType = (row: PayBillsRow, text: string) => {
        setRows(typeRowPayment(getValues('payments'), row, text))
    }

    // ⌥↵ toggles the row whose Payment cell has focus; with none focused it does nothing.
    const onRowToggle = () => {
        const row = focusedRowRef.current ? rowById(focusedRowRef.current) : undefined
        if (!row) return
        setRows(toggleRow(getValues('payments'), row, currency))
    }

    // ⌥A, the header tick box and Pay all: every shown row paid in full, or, when every
    // shown row is paid, the shown rows cleared. A hidden row keeps its payment.
    const onTickAll = () => {
        const current = getValues('payments')
        const isAllPaid = isEveryRowPaid(shown, current, currency)
        const shownIds = new Set(shown.map(row => row.id))
        const hidden = Object.fromEntries(
            Object.entries(current).filter(([id]) => !shownIds.has(id))
        )
        setRows(isAllPaid ? hidden : { ...hidden, ...payAll(shown) })
    }

    // ⌥⌫ and Clear payments: every row, shown or hidden.
    const onClear = () => setRows(clearPayments())

    // The pick sets a valid method, so a shown error on it (the required rule after a
    // submit, or a server refusal) goes; after a submit the rules run again on it.
    const onPaidFromPick = (_id: string, account: PaidFromAccount | undefined) => {
        if (!account) return
        clearErrors('payment_method')
        setValue('payment_method', defaultMethodFor(account), {
            shouldDirty: true,
            shouldValidate: isSubmitted,
        })
    }

    const onVendorPick = (id: string) => {
        if (original) return
        setVendorFilter(id)
    }

    const clearFilters = () =>
        setFilters(current => ({ ...current, vendor: baseVendor, due: 'any' }))

    // Enter in a Payment cell: the next shown row's cell, or Clear payments after the last.
    const focusAfterRow = (rowId: string) => {
        const index = shown.findIndex(row => row.id === rowId)
        const next = shown
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

    const onRowFocus = (rowId: string) => {
        focusedRowRef.current = rowId
    }

    const onRowBlur = (rowId: string) => {
        if (focusedRowRef.current === rowId) focusedRowRef.current = null
    }

    return {
        form,
        payments,
        // Rows: every listed row in the sort's order, and the rows the filters keep.
        listRows,
        shown,
        list,
        isHolding,
        hasShownRows: shown.length > 0,
        hasPaidRows: paidRows.length > 0,
        isAllShownPaid: isEveryRowPaid(shown, payments, currency),
        isCheckNoVisible: paymentMethod === 'check',
        // Starting check no. on a new screen; the payment's own Check no. on `?replaces`.
        checkNoLabel: mode === 'new' ? 'Starting check no.' : 'Check no.',
        // Starting check no. takes digits only; a payment's Check no. any text.
        isCheckNoDigits: mode === 'new',
        // `?replaces`: the vendor is the payment's own, so its filter is fixed.
        isVendorLocked: mode === 'replaces',
        // Texts and figures.
        figureText: totalFigureText(listedPayments, currency),
        openCountText: openCountText(shown.length, mode),
        selectedText: selectedText(paidRows.length, paidVendors),
        checkPlanText: checkPlan,
        isCheckPlanVisible: checkPlan !== '',
        hiddenText: hiddenCount > 0 ? hiddenText(hiddenCount) : '',
        isHiddenVisible: hiddenCount > 0,
        totals: {
            open: shown.reduce((sum, row) => sum + row.open, 0),
            payment: totalCents,
        },
        balances,
        // Filters and sort.
        vendorFilter,
        vendorLabel,
        isVendorFiltered: vendorFilter !== '',
        vendorPicker,
        vendorPickerOptions,
        dueFilter: due,
        dueLabel: `Due: ${DUE_LABELS[due]}`,
        dueItems,
        sort,
        sortLabel: sortLabelOf(sort),
        sortItems,
        // Refs and focus.
        paidFromMount,
        clearRef,
        rowRef,
        focusedRowRef,
        // Handlers.
        onRowTick,
        onRowType,
        onRowToggle,
        onRowFocus,
        onRowBlur,
        onTickAll,
        onClear,
        onPaidFromPick,
        onVendorPick,
        onSort,
        clearFilters,
        resetFilters,
        focusAfterRow,
        focusPaidFrom: () => setPaidFromMount(count => count + 1),
    }
}

type BalancesInput = {
    account: PaidFromAccount | undefined
    current: number | null | undefined
    totalCents: number
    currency: string
    original: Pick<PayBillsOriginal['payment'], 'number' | 'total' | 'paid_from'> | null
}

// Current balance, Total payment and New balance once Paid from is picked and its balance
// is exact (spec §3.4). On `?replaces` paid from the original's own account, Current
// balance already holds the original payment, so "Payment 1004 now" puts it back first;
// from another account the original never touched that balance, so there is nothing to
// put back.
function balancesOf({
    account,
    current,
    totalCents,
    currency,
    original,
}: BalancesInput): PayBillsBalances {
    const accountType = account ? balanceAccountType(account.type) : null
    if (accountType === null || current === null || current === undefined) return NO_BALANCES
    const heldOriginal = original && original.paid_from === account?.id ? original : null
    const originalTotal = heldOriginal?.total ?? 0
    const next = newBalanceCents({ accountType, current, originalTotal, total: totalCents })
    // The sign the Total payment line uses, the other way: the original comes back.
    const sign = accountType === 'credit_card' ? '-' : '+'
    const originalNow = heldOriginal
        ? {
              isVisible: true,
              label: originalNowText(heldOriginal.number),
              amount: `${sign}${formatMoney(originalTotal, currency)}`,
          }
        : NO_ORIGINAL_NOW
    return {
        isVisible: true,
        current: formatMoney(current, currency),
        originalNow,
        totalPayment: `-${formatMoney(totalCents, currency)}`,
        newBalance: formatMoney(next, currency),
        isNewBalanceNegative: accountType === 'bank' && next < 0,
    }
}

export type PayBillsFormState = ReturnType<typeof usePayBillsForm>

import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import type { ReactNode } from 'react'
import { get } from 'react-hook-form'
import { View } from 'react-native'
import type { PayBillsFormState } from '../../hooks/usePayBillsForm'
import { BILL_OUTSTANDING } from '../../lib/outstanding-documents'
import type { PayBillsRow } from '../../lib/pay-bills-rows'
import type { OutstandingRow } from '../../lib/payment-allocation'
import { OutstandingCards } from '../payments/OutstandingCards'
import {
    OutstandingGrid,
    type OutstandingGridProps,
    tickAllState,
} from '../payments/OutstandingGrid'
import { PayBillsEmpty } from './PayBillsEmpty'
import { PayBillsFilters } from './PayBillsFilters'

function rowErrorText(errors: unknown, rowId: string): string {
    const message: unknown = get(errors, `payments.${rowId}.amount`)?.message
    return typeof message === 'string' ? message : ''
}

// The shared grid's and cards' props for the shown bills: the bill descriptor, the sort
// headers and the totals row. The shared parts hand back an OutstandingRow; the handlers
// take the listed PayBillsRow with that id.
function billListOf(
    payForm: PayBillsFormState,
    currency: string,
    today: string,
    isDisabled: boolean
): OutstandingGridProps {
    const { shown, listRows, form, focusedRowRef } = payForm
    const listed = new Map(listRows.map(row => [row.id, row]))
    const withRow =
        <A extends unknown[]>(handler: (row: PayBillsRow, ...rest: A) => void) =>
        (row: OutstandingRow, ...rest: A) => {
            const bill = listed.get(row.id)
            if (bill) handler(bill, ...rest)
        }
    const payments = payForm.payments
    const errors = form.formState.errors
    const rowErrors = Object.fromEntries(shown.map(row => [row.id, rowErrorText(errors, row.id)]))
    const onFocusRow = (rowId: string | null) => {
        if (rowId === null) focusedRowRef.current = null
        else payForm.onRowFocus(rowId)
    }
    return {
        doc: BILL_OUTSTANDING,
        rows: shown,
        tickAll: tickAllState(shown, payments, currency),
        payments,
        rowErrors,
        currency,
        today,
        isDisabled,
        onTick: withRow(payForm.onRowTick),
        onTickAll: payForm.onTickAll,
        onType: withRow(payForm.onRowType),
        onNext: payForm.focusAfterRow,
        onFocusRow,
        rowRef: payForm.rowRef,
        sort: payForm.sort,
        onSort: payForm.onSort,
        totals: payForm.totals,
    }
}

function BillRows({
    isVisible,
    isCards,
    list,
}: {
    isVisible: boolean
    isCards: boolean
    list: OutstandingGridProps
}) {
    if (!isVisible) return null
    if (isCards) return <OutstandingCards {...list} />
    return <OutstandingGrid {...list} />
}

interface PayBillsOpenBillsProps {
    payForm: PayBillsFormState
    currency: string
    today: string
    // A Pay runs: the filters, tick boxes and cells wait for it.
    isDisabled: boolean
    // Drawn between the filters and the bills (the notice of unapplied vendor credits).
    notice: ReactNode
}

/**
 * The open bills (spec §3.3): the filter chips, the `notice` (unapplied vendor credits),
 * then the shown bills as receive-payment's
 * grid (its own width at least the grid's least width, `BILL_OUTSTANDING.gridMinWidth`) or
 * cards (below), or the empty and filtered-empty states. One list in the page scroller, no
 * paging, no sideways scroll.
 */
export function PayBillsOpenBills({
    payForm,
    currency,
    today,
    isDisabled,
    notice,
}: PayBillsOpenBillsProps) {
    const { width, onLayout } = useContainerWidth()
    const isCards = width > 0 && width < BILL_OUTSTANDING.gridMinWidth
    const list = billListOf(payForm, currency, today, isDisabled)
    return (
        <View testID="pay-bills-open" className="gap-3" onLayout={onLayout}>
            <PayBillsFilters payForm={payForm} isDisabled={isDisabled} isSortVisible={isCards} />
            {notice}
            <PayBillsEmpty
                list={payForm.list}
                onClearFilters={payForm.clearFilters}
                isDisabled={isDisabled}
            />
            <BillRows isVisible={payForm.list === 'rows'} isCards={isCards} list={list} />
        </View>
    )
}

import { Button, ButtonText } from '@tinycld/core/ui/button'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { Text, View } from 'react-native'
import { filterRowsByNumber, type OutstandingRow } from '../../lib/payment-allocation'
import { fillPaymentText, PAYMENT_MESSAGES } from '../../lib/payment-texts'
import { FindInvoiceField, type FindInvoiceFieldState } from './FindInvoiceField'
import { OutstandingCards } from './OutstandingCards'
import { OutstandingGrid, type OutstandingGridProps, tickAllState } from './OutstandingGrid'

export type OutstandingListMode = 'no-customer' | 'loading' | 'error' | 'none' | 'rows'

export function outstandingListMode(input: {
    customer: string
    isReady: boolean
    isError: boolean
    rowCount: number
}): OutstandingListMode {
    if (input.customer === '') return 'no-customer'
    if (input.isError) return 'error'
    if (!input.isReady) return 'loading'
    return input.rowCount === 0 ? 'none' : 'rows'
}

function ListSkeleton() {
    const bars = [0, 1, 2].map(index => (
        <View key={index} className="flex-row items-center gap-3 border-b border-border py-3">
            <View className="h-5 w-5 rounded bg-muted" />
            <View className="h-4 flex-1 rounded bg-muted" />
            <View className="h-4 w-24 rounded bg-muted" />
            <View className="h-9 w-32 rounded bg-muted" />
        </View>
    ))
    return (
        <View testID="payment-list-loading" accessibilityLabel="Loading open invoices">
            {bars}
        </View>
    )
}

// The Books error banner (ListBanner's look) with Retry.
function ListError({ onRetry }: { onRetry: () => void }) {
    return (
        <View
            testID="payment-list-error"
            accessibilityRole="alert"
            className="flex-row items-center gap-2 rounded-lg border border-danger-soft-foreground bg-danger-soft px-3 py-1"
        >
            <Text className="min-w-0 flex-1 text-sm text-danger">
                {PAYMENT_MESSAGES.listLoadFailed}
            </Text>
            <Button
                testID="payment-list-retry"
                variant="outline"
                size="sm"
                style={{ minHeight: 44 }}
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function ListMessage({ text, testID }: { text: string; testID: string }) {
    return (
        <Text testID={testID} className="py-6 text-sm text-muted-foreground">
            {text}
        </Text>
    )
}

// The list's props: every listed row; the list draws those the find filter keeps.
export type OutstandingListProps = Omit<OutstandingGridProps, 'tickAll'>

interface OutstandingInvoicesProps {
    mode: OutstandingListMode
    customerName: string
    onRetry: () => void
    // Find invoice no.: the form owns it, so its customer pick handlers can clear it.
    find: FindInvoiceFieldState
    list: OutstandingListProps
}

// The rows the find filter keeps, and every row with a message under its Payment cell, so
// a refusal is never hidden.
function shownRows(list: OutstandingListProps, filterText: string): OutstandingRow[] {
    const kept = new Set(filterRowsByNumber(list.rows, filterText).map(row => row.id))
    return list.rows.filter(row => kept.has(row.id) || (list.rowErrors[row.id] ?? '') !== '')
}

/**
 * The list area of the payment form (spec §3.3, §3.5): Find invoice no., then with no
 * customer the hint, while loading a skeleton of three rows, a failed read the error banner
 * with Retry, a customer with no open invoice the credit note, else the rows the find text
 * keeps: a grid, or cards while the list's own width is below the grid's least width
 * (`doc.gridMinWidth`). A find text that keeps no row says so.
 */
export function OutstandingInvoices({
    mode,
    customerName,
    onRetry,
    find,
    list,
}: OutstandingInvoicesProps) {
    const { width, onLayout } = useContainerWidth()
    const isCards = width > 0 && width < list.doc.gridMinWidth
    const drawn = {
        ...list,
        rows: shownRows(list, find.filterText),
        tickAll: tickAllState(list.rows, list.payments, list.currency),
    }
    const body = listBody({
        mode,
        customerName,
        onRetry,
        grid: drawn,
        isCards,
        filterText: find.filterText.trim(),
    })
    return (
        <View testID="payment-outstanding" className="gap-3" onLayout={onLayout}>
            <Text className="text-sm font-semibold text-foreground">Outstanding invoices</Text>
            <FindInvoiceField field={find} isFullWidth={isCards} isDisabled={list.isDisabled} />
            {body}
        </View>
    )
}

function listBody({
    mode,
    customerName,
    onRetry,
    grid,
    isCards,
    filterText,
}: {
    mode: OutstandingListMode
    customerName: string
    onRetry: () => void
    grid: OutstandingGridProps
    isCards: boolean
    // The find text, trimmed.
    filterText: string
}) {
    if (mode === 'no-customer') {
        return (
            <ListMessage text={PAYMENT_MESSAGES.chooseCustomer} testID="payment-choose-customer" />
        )
    }
    if (mode === 'loading') return <ListSkeleton />
    if (mode === 'error') return <ListError onRetry={onRetry} />
    if (mode === 'none') {
        const text = fillPaymentText(PAYMENT_MESSAGES.noOpenInvoices, customerName)
        return <ListMessage text={text} testID="payment-list-empty" />
    }
    if (grid.rows.length === 0) {
        const text = fillPaymentText(PAYMENT_MESSAGES.filterEmpty, filterText)
        return <ListMessage text={text} testID="payment-filter-empty" />
    }
    if (isCards) return <OutstandingCards {...grid} />
    return <OutstandingGrid {...grid} />
}

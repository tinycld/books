import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { fillPaymentText, PAYMENT_MESSAGES } from '../../lib/payment-texts'
import { OutstandingGrid, type OutstandingGridProps } from './OutstandingGrid'

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

interface OutstandingInvoicesProps {
    mode: OutstandingListMode
    customerName: string
    onRetry: () => void
    grid: OutstandingGridProps
}

/**
 * The list area of the payment form (spec §3.3): with no customer the hint, while loading
 * a skeleton of three rows, a failed read the error banner with Retry, a customer with no
 * open invoice the credit note, else the grid.
 */
export function OutstandingInvoices({
    mode,
    customerName,
    onRetry,
    grid,
}: OutstandingInvoicesProps) {
    const body = listBody(mode, customerName, onRetry, grid)
    return (
        <View testID="payment-outstanding" className="gap-3">
            <Text className="text-sm font-semibold text-foreground">Outstanding invoices</Text>
            {body}
        </View>
    )
}

function listBody(
    mode: OutstandingListMode,
    customerName: string,
    onRetry: () => void,
    grid: OutstandingGridProps
) {
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
    return <OutstandingGrid {...grid} />
}

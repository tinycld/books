import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import type { BillPaymentReadState } from '../../lib/bill-payment-read-state'
import { PAY_BILLS_MESSAGES } from '../../lib/pay-bills-texts'
import { EntryBackLink } from '../entries/EntryHeader'

export type BillPaymentNoticeState = Exclude<BillPaymentReadState, 'ready'>

const MESSAGES: Record<Exclude<BillPaymentNoticeState, 'loading'>, string> = {
    error: PAY_BILLS_MESSAGES.paymentLoadFailed,
    'not-found': PAY_BILLS_MESSAGES.notFound,
}

function RetryButton({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <Button
            testID="bill-payment-retry"
            variant="outline"
            style={{ minHeight: 44 }}
            onPress={onRetry}
        >
            <ButtonText>Retry</ButtonText>
        </Button>
    )
}

/**
 * The bill payment read view's states other than the payment (spec §3.8): loading, a
 * failed read with Retry (one recovery over every failed read), and a payment that does
 * not exist. Each but loading has the back link.
 */
export function BillPaymentStateNotice({
    state,
    onRetry,
}: {
    state: BillPaymentNoticeState
    onRetry: () => void
}) {
    if (state === 'loading') {
        return (
            <View testID="bill-payment-loading" className="flex-1 bg-background">
                <LoadingState />
            </View>
        )
    }
    const isError = state === 'error'
    const role = isError ? 'alert' : undefined
    const message = MESSAGES[state]
    return (
        <View className="flex-1 bg-background px-4 pt-2">
            <EntryBackLink />
            <View
                testID={`bill-payment-${state}`}
                accessibilityRole={role}
                className="flex-1 items-center gap-3 p-6"
            >
                <Text className="text-base font-medium text-foreground">{message}</Text>
                <RetryButton isVisible={isError} onRetry={onRetry} />
            </View>
        </View>
    )
}

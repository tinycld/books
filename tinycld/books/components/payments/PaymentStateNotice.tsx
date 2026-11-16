import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import type { PaymentScreenState } from '../../lib/payment-screen-state'
import { PAYMENT_MESSAGES } from '../../lib/payment-texts'
import { EntryBackLink } from '../entries/EntryHeader'

export type PaymentNoticeState = Exclude<PaymentScreenState, 'form' | 'read'>

const MESSAGES: Record<Exclude<PaymentNoticeState, 'loading'>, string> = {
    error: PAYMENT_MESSAGES.loadFailed,
    'not-found': PAYMENT_MESSAGES.notFound,
    'no-access': PAYMENT_MESSAGES.noAccess,
    'cannot-edit': PAYMENT_MESSAGES.cannotEdit,
}

function RetryButton({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <Button
            testID="payment-retry"
            variant="outline"
            style={{ minHeight: 44 }}
            onPress={onRetry}
        >
            <ButtonText>Retry</ButtonText>
        </Button>
    )
}

/**
 * The screen's states other than the form and the read view (spec §3.8): loading, a
 * failed read with Retry, a payment that does not exist, no write access, and a
 * correction of a payment that is not posted. Each but loading has the back link.
 */
export function PaymentStateNotice({
    state,
    onRetry,
}: {
    state: PaymentNoticeState
    onRetry: () => void
}) {
    if (state === 'loading') {
        return (
            <View testID="payment-loading" className="flex-1 bg-background">
                <LoadingState />
            </View>
        )
    }
    const isError = state === 'error'
    const role = isError ? 'alert' : undefined
    const testID = `payment-${state}`
    const message = MESSAGES[state]
    return (
        <View className="flex-1 bg-background px-4 pt-2">
            <EntryBackLink />
            <View
                testID={testID}
                accessibilityRole={role}
                className="flex-1 items-center gap-3 p-6"
            >
                <Text className="text-base font-medium text-foreground">{message}</Text>
                <RetryButton isVisible={isError} onRetry={onRetry} />
            </View>
        </View>
    )
}

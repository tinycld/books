import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import type { PaymentFlow } from '../../lib/payment-flow'
import type { PaymentScreenState } from '../../lib/payment-screen-state'
import { EntryBackLink } from '../entries/EntryHeader'

export type PaymentNoticeState = Exclude<PaymentScreenState, 'form' | 'read'>

// The flow's text of each state but loading.
function messageOf(flow: PaymentFlow, state: Exclude<PaymentNoticeState, 'loading'>): string {
    const messages: Record<Exclude<PaymentNoticeState, 'loading'>, string> = {
        error: flow.texts.loadFailed,
        'not-found': flow.texts.notFound,
        'no-access': flow.texts.noAccess,
        'cannot-edit': flow.texts.cannotEdit,
    }
    return messages[state]
}

function RetryButton({
    isVisible,
    onRetry,
    testID,
}: {
    isVisible: boolean
    onRetry: () => void
    testID: string
}) {
    if (!isVisible) return null
    return (
        <Button testID={testID} variant="outline" style={{ minHeight: 44 }} onPress={onRetry}>
            <ButtonText>Retry</ButtonText>
        </Button>
    )
}

/**
 * The screen's states other than the form and the read view (spec §3.8): loading, a
 * failed read with Retry, a payment that does not exist, no write access, and a
 * correction of a payment that is not posted. Each but loading has the back link. The
 * flow gives the texts and the test ids (`<flow.testId>-<state>`).
 */
export function PaymentStateNotice({
    flow,
    state,
    onRetry,
}: {
    flow: PaymentFlow
    state: PaymentNoticeState
    onRetry: () => void
}) {
    if (state === 'loading') {
        return (
            <View testID={`${flow.testId}-loading`} className="flex-1 bg-background">
                <LoadingState />
            </View>
        )
    }
    const isError = state === 'error'
    const role = isError ? 'alert' : undefined
    const testID = `${flow.testId}-${state}`
    const message = messageOf(flow, state)
    return (
        <View className="flex-1 bg-background px-4 pt-2">
            <EntryBackLink />
            <View
                testID={testID}
                accessibilityRole={role}
                className="flex-1 items-center gap-3 p-6"
            >
                <Text className="text-base font-medium text-foreground">{message}</Text>
                <RetryButton
                    isVisible={isError}
                    onRetry={onRetry}
                    testID={`${flow.testId}-retry`}
                />
            </View>
        </View>
    )
}

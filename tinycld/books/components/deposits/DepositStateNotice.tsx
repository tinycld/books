import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import type { DepositScreenState } from '../../lib/deposit-screen-state'
import { DEPOSIT_MESSAGES } from '../../lib/deposit-texts'
import { DepositBackLink } from './DepositBackLink'

export type DepositNoticeKind = Exclude<DepositScreenState, 'loading' | 'form' | 'read'>

const MESSAGES: Record<DepositNoticeKind, string> = {
    error: DEPOSIT_MESSAGES.loadFailed,
    'not-found': DEPOSIT_MESSAGES.notFound,
    'no-access': DEPOSIT_MESSAGES.noAccess,
    'cannot-edit': DEPOSIT_MESSAGES.cannotEdit,
}

function RetryButton({ isVisible, onRetry }: { isVisible: boolean; onRetry(): void }) {
    if (!isVisible) return null
    return (
        <Button
            testID="deposit-retry"
            variant="outline"
            style={{ minHeight: 44 }}
            onPress={onRetry}
        >
            <ButtonText>Retry</ButtonText>
        </Button>
    )
}

/**
 * The deposit screen in place of the form or the read view (bank deposit spec §3.9): a
 * failed read ("Books could not load this deposit.") with Retry, a deposit that does not
 * exist, no write access, and `?replaces` of a deposit that is not posted. Each has the
 * back link to Journal entries.
 */
export function DepositStateNotice({
    kind,
    onRetry,
}: {
    kind: DepositNoticeKind
    onRetry(): void
}) {
    const isError = kind === 'error'
    const role = isError ? 'alert' : undefined
    const message = MESSAGES[kind]
    return (
        <View className="flex-1 bg-background px-4 pt-2">
            <DepositBackLink />
            <View
                testID="deposit-message"
                accessibilityRole={role}
                className="flex-1 items-center gap-3 p-6"
            >
                <Text className="text-base font-medium text-foreground">{message}</Text>
                <RetryButton isVisible={isError} onRetry={onRetry} />
            </View>
        </View>
    )
}

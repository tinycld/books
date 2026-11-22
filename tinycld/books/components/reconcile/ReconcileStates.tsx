import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import type { ReconcileScreenModel } from '../../hooks/useReconcileScreen'
import { RECONCILE_TEXTS } from '../../lib/reconcile'

function LoadError({ onRetry }: { onRetry: () => void }) {
    return (
        <View
            testID="reconcile-error"
            accessibilityRole="alert"
            className="flex-1 items-center gap-3 p-6"
        >
            <Text className="text-base font-medium text-foreground">
                {RECONCILE_TEXTS.loadError}
            </Text>
            <Button
                testID="reconcile-retry"
                variant="outline"
                className="min-h-11"
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function NotFound() {
    return (
        <View
            testID="reconcile-not-found"
            className="flex-1 items-center justify-center gap-3 px-4 py-6"
        >
            <Text className="text-center text-sm text-muted-foreground">
                {RECONCILE_TEXTS.notFound}
            </Text>
        </View>
    )
}

/**
 * The work screen's body before it has a reconciliation to show (reconcile spec §3
 * "States"): loading, the load error with Retry (useReconcileScreen's onRetry recovers each
 * failed read), or not found. Null in the work and finished states.
 */
export function ReconcileStates({ model }: { model: ReconcileScreenModel }) {
    if (model.state === 'loading') {
        return (
            <View testID="reconcile-loading" className="flex-1">
                <LoadingState />
            </View>
        )
    }
    if (model.state === 'error') return <LoadError onRetry={model.onRetry} />
    if (model.state === 'not-found') return <NotFound />
    return null
}

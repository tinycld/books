import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { ReconcileScreenModel } from '../../hooks/useReconcileScreen'
import { emptyLinesText, RECONCILE_TEXTS } from '../../lib/reconcile'
import { useReconcileStore } from '../../stores/reconcile-store'

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

function ListState({
    testID,
    text,
    children,
}: {
    testID: string
    text: string
    children?: ReactNode
}) {
    return (
        <View testID={testID} className="flex-1 items-center justify-center gap-3 px-4 py-6">
            <Text className="text-center text-sm text-muted-foreground">{text}</Text>
            {children}
        </View>
    )
}

function NoMatch() {
    const resetFilters = useReconcileStore(s => s.resetFilters)
    return (
        <ListState testID="reconcile-no-match" text={RECONCILE_TEXTS.noMatch}>
            <Button
                testID="reconcile-no-match-clear"
                variant="outline"
                className="min-h-11"
                onPress={resetFilters}
            >
                <ButtonText>{RECONCILE_TEXTS.clearFilters}</ButtonText>
            </Button>
        </ListState>
    )
}

export type ReconcileLinesState = 'empty' | 'no-match' | 'list'

// No transaction waits to be cleared (nothing filtered), or none matches the filters.
export function linesStateOf(model: ReconcileScreenModel): ReconcileLinesState {
    if (model.rows.length === 0) return 'empty'
    return model.shown.length === 0 ? 'no-match' : 'list'
}

/**
 * The list's own states (reconcile spec §3 "States"): empty with nothing filtered ("No
 * transaction on 1000 Business Checking up to Oct 31, 2026 waits to be cleared."), and
 * empty under a filter, with "Clear filters". Null while the list has rows to show.
 */
export function ReconcileLinesStates({ model }: { model: ReconcileScreenModel }) {
    const state = linesStateOf(model)
    if (state === 'no-match') return <NoMatch />
    if (state === 'list' || !model.reconciliation) return null
    const text = emptyLinesText(model.accountLabel, model.reconciliation.statement_date)
    return <ListState testID="reconcile-empty" text={text} />
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

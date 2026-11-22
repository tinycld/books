import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { PickMenu } from '@tinycld/core/ui/pick-menu'
import { Text, View } from 'react-native'
import { useFitsTable } from '../../hooks/useFitsTable'
import type {
    ReconcileHistoryModel,
    ReconcileHistoryRowData,
} from '../../hooks/useReconcileHistory'
import {
    HISTORY_CARD_HEIGHT,
    HISTORY_MIN_WIDTH,
    HISTORY_ROW_HEIGHT,
    HISTORY_TEXTS,
} from '../../lib/reconcile-history'
import { ListCards } from '../ListCards'
import { ListTable } from '../ListTable'
import {
    type HistoryRowProps,
    ReconcileHistoryCard,
    ReconcileHistoryHeader,
    ReconcileHistoryRow,
} from './ReconcileHistoryRow'
import { ReconcileTabs } from './ReconcileTabs'

type Fits = ReturnType<typeof useFitsTable>

function ignore() {}

function historyKey(row: ReconcileHistoryRowData): string {
    return row.id
}

function historyCardHeight(): number {
    return HISTORY_CARD_HEIGHT
}

function HistoryError({ model }: { model: ReconcileHistoryModel }) {
    return (
        <View
            testID="reconcile-history-error"
            accessibilityRole="alert"
            className="flex-1 items-center gap-3 p-6"
        >
            <Text className="text-base font-medium text-foreground">{HISTORY_TEXTS.loadError}</Text>
            <Button
                testID="reconcile-history-retry"
                variant="outline"
                className="min-h-11"
                onPress={model.onRetry}
            >
                <ButtonText>{HISTORY_TEXTS.retry}</ButtonText>
            </Button>
        </View>
    )
}

// No finished reconciliation at all: Go to Accounts.
function HistoryEmpty({ model }: { model: ReconcileHistoryModel }) {
    return (
        <View
            testID="reconcile-history-empty"
            className="flex-1 items-center justify-center gap-3 px-4 py-6"
        >
            <Text className="text-center text-sm text-muted-foreground">{HISTORY_TEXTS.empty}</Text>
            <Button
                testID="reconcile-history-accounts"
                className="min-h-11"
                onPress={model.onGoToAccounts}
            >
                <ButtonText>{HISTORY_TEXTS.goToAccounts}</ButtonText>
            </Button>
        </View>
    )
}

// The picked account has no finished reconciliation: Clear filter.
function HistoryEmptyFiltered({ model }: { model: ReconcileHistoryModel }) {
    const text = HISTORY_TEXTS.emptyFiltered(model.pickedLabel)
    return (
        <View
            testID="reconcile-history-empty"
            className="flex-1 items-center justify-center gap-3 px-4 py-6"
        >
            <Text className="text-center text-sm text-muted-foreground">{text}</Text>
            <Button
                testID="reconcile-history-empty-clear"
                variant="outline"
                className="min-h-11"
                onPress={model.onClearFilter}
            >
                <ButtonText>{HISTORY_TEXTS.clearFilter}</ButtonText>
            </Button>
        </View>
    )
}

// The table at or above its own minimum width, the cards below it; never a sideways
// scroller.
function HistoryList({ model, fits }: { model: ReconcileHistoryModel; fits: Fits }) {
    const rowProps = (row: ReconcileHistoryRowData): HistoryRowProps => ({
        row,
        isFocused: row.id === model.focusedId,
        hasReport: model.hasReport,
        onOpen: model.onOpenRow,
        onOpenReport: model.onOpenReport,
    })
    if (fits.showCards) {
        const renderCard = (row: ReconcileHistoryRowData) => (
            <ReconcileHistoryCard {...rowProps(row)} />
        )
        return (
            <ListCards
                testID="reconcile-history-cards"
                rows={model.shown}
                heightOf={historyCardHeight}
                keyOf={historyKey}
                renderCard={renderCard}
                onNearEnd={ignore}
                scrollToIndex={model.focusedIndex}
            />
        )
    }
    const renderRow = (row: ReconcileHistoryRowData) => <ReconcileHistoryRow {...rowProps(row)} />
    const header = <ReconcileHistoryHeader sort={model.historySort} onSort={model.onSort} />
    return (
        <ListTable
            testID="reconcile-history-table"
            minWidth={HISTORY_MIN_WIDTH}
            rowHeight={HISTORY_ROW_HEIGHT}
            header={header}
            rows={model.shown}
            keyOf={historyKey}
            renderRow={renderRow}
            onNearEnd={ignore}
            onGutter={fits.onGutter}
            scrollToIndex={model.focusedIndex}
        />
    )
}

function HistoryBody({ model, fits }: { model: ReconcileHistoryModel; fits: Fits }) {
    if (model.state === 'loading') return <LoadingState />
    if (model.state === 'error') return <HistoryError model={model} />
    if (model.state === 'empty') return <HistoryEmpty model={model} />
    if (model.state === 'empty-filtered') return <HistoryEmptyFiltered model={model} />
    return <HistoryList model={model} fits={fits} />
}

function ClearFilter({ isVisible, onPress }: { isVisible: boolean; onPress: () => void }) {
    if (!isVisible) return null
    return (
        <Text
            testID="reconcile-history-clear"
            accessibilityRole="link"
            onPress={onPress}
            className="text-sm text-primary"
        >
            {HISTORY_TEXTS.clearFilter}
        </Text>
    )
}

// The Account filter; its items come ready from useReconcileHistory (`filterItems`).
function AccountFilter({ model }: { model: ReconcileHistoryModel }) {
    return (
        <View className="flex-row items-center gap-3">
            <PickMenu
                testID="reconcile-history-account"
                purpose={HISTORY_TEXTS.accountPurpose}
                label={model.filterLabel}
                size="touch"
                items={model.filterItems}
            />
            <ClearFilter isVisible={model.hasFilter} onPress={model.onClearFilter} />
        </View>
    )
}

/**
 * The History tab of Reconcile, `books/reconcile/history` (reconciliation report spec §3
 * "The history"): the title, the tab row with History selected and the line; the Account
 * filter with Clear filter; then the finished reconciliations (a table, or cards below the
 * table's own minimum width), or the loading, error or empty state.
 */
export function ReconcileHistoryView(model: ReconcileHistoryModel) {
    const fits = useFitsTable(HISTORY_MIN_WIDTH)
    const isWide = useBreakpoint() !== 'mobile'
    const padding = isWide ? 'p-6' : 'p-4'
    return (
        <View testID="reconcile-history-screen" className={`flex-1 gap-4 bg-background ${padding}`}>
            <View className="gap-3">
                <Text className="text-2xl font-semibold text-foreground">Reconcile</Text>
                <ReconcileTabs selected="history" />
                <Text className="text-sm text-muted-foreground">{HISTORY_TEXTS.line}</Text>
            </View>
            <AccountFilter model={model} />
            <View className="min-h-0 min-w-0 flex-1" onLayout={fits.onLayout}>
                <HistoryBody model={model} fits={fits} />
            </View>
        </View>
    )
}

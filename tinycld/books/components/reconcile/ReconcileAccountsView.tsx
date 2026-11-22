import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { useFitsTable } from '../../hooks/useFitsTable'
import type {
    ReconcileAccountRowData,
    ReconcileAccountsModel,
} from '../../hooks/useReconcileAccounts'
import { RECONCILE_TEXTS } from '../../lib/reconcile'
import { ListCards } from '../ListCards'
import { ListTable } from '../ListTable'
import {
    ACCOUNT_CARD_HEIGHT,
    ACCOUNT_ROW_HEIGHT,
    ACCOUNTS_MIN_WIDTH,
    ReconcileAccountCard,
    ReconcileAccountsHeader,
    ReconcileAccountTableRow,
} from './ReconcileAccountRow'
import { ReconcileStartDialog } from './ReconcileStartDialog'

type Fits = ReturnType<typeof useFitsTable>

function ignore() {}

function accountKey(row: ReconcileAccountRowData): string {
    return row.id
}

function accountCardHeight(): number {
    return ACCOUNT_CARD_HEIGHT
}

function AccountsError({ model }: { model: ReconcileAccountsModel }) {
    return (
        <View
            testID="reconcile-accounts-error"
            accessibilityRole="alert"
            className="flex-1 items-center gap-3 p-6"
        >
            <Text className="text-base font-medium text-foreground">
                {RECONCILE_TEXTS.accountsLoadError}
            </Text>
            <Button
                testID="reconcile-accounts-retry"
                variant="outline"
                className="min-h-11"
                onPress={model.onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function OpenChartButton({ model }: { model: ReconcileAccountsModel }) {
    if (!model.canWrite) return null
    return (
        <Button testID="reconcile-open-chart" className="min-h-11" onPress={model.onOpenChart}>
            <ButtonText>{RECONCILE_TEXTS.openChart}</ButtonText>
        </Button>
    )
}

function AccountsEmpty({ model }: { model: ReconcileAccountsModel }) {
    return (
        <View
            testID="reconcile-accounts-empty"
            className="flex-1 items-center justify-center gap-3 px-4 py-6"
        >
            <Text className="text-center text-sm text-muted-foreground">
                {RECONCILE_TEXTS.accountsEmpty}
            </Text>
            <OpenChartButton model={model} />
        </View>
    )
}

// The table at or above its own minimum width, the cards below it; never a sideways
// scroller.
function AccountsList({ model, fits }: { model: ReconcileAccountsModel; fits: Fits }) {
    const rowProps = (row: ReconcileAccountRowData) => ({
        row,
        action: model.actionOf(row),
        isFocused: row.id === model.focusedId,
        onPress: model.onRowPress,
        onThroughPress: model.onThroughPress,
    })
    if (fits.showCards) {
        const renderCard = (row: ReconcileAccountRowData) => (
            <ReconcileAccountCard {...rowProps(row)} />
        )
        return (
            <ListCards
                testID="reconcile-accounts-cards"
                rows={model.rows}
                heightOf={accountCardHeight}
                keyOf={accountKey}
                renderCard={renderCard}
                onNearEnd={ignore}
                scrollToIndex={model.focusedIndex}
            />
        )
    }
    const renderRow = (row: ReconcileAccountRowData) => (
        <ReconcileAccountTableRow {...rowProps(row)} />
    )
    const header = <ReconcileAccountsHeader />
    return (
        <ListTable
            testID="reconcile-accounts-table"
            minWidth={ACCOUNTS_MIN_WIDTH}
            rowHeight={ACCOUNT_ROW_HEIGHT}
            header={header}
            rows={model.rows}
            keyOf={accountKey}
            renderRow={renderRow}
            onNearEnd={ignore}
            onGutter={fits.onGutter}
            scrollToIndex={model.focusedIndex}
        />
    )
}

function AccountsBody({ model, fits }: { model: ReconcileAccountsModel; fits: Fits }) {
    if (model.state === 'loading') return <LoadingState />
    if (model.state === 'error') return <AccountsError model={model} />
    if (model.state === 'empty') return <AccountsEmpty model={model} />
    return <AccountsList model={model} fits={fits} />
}

/**
 * The accounts screen of `books/reconcile` (reconcile spec §3 "The accounts screen"): the
 * title and its line, then the accounts that can be reconciled (a table, or cards below
 * the table's own minimum width), or the loading, error or empty state; and the start
 * dialog of the account the store names, for a writer.
 */
export function ReconcileAccountsView(model: ReconcileAccountsModel) {
    const fits = useFitsTable(ACCOUNTS_MIN_WIDTH)
    const isWide = useBreakpoint() !== 'mobile'
    const padding = isWide ? 'p-6' : 'p-4'
    return (
        <View
            testID="reconcile-accounts-screen"
            className={`flex-1 gap-4 bg-background ${padding}`}
        >
            <View className="gap-1">
                <Text className="text-2xl font-semibold text-foreground">Reconcile</Text>
                <Text className="text-sm text-muted-foreground">
                    {RECONCILE_TEXTS.accountsLine}
                </Text>
            </View>
            <View className="min-h-0 min-w-0 flex-1" onLayout={fits.onLayout}>
                <AccountsBody model={model} fits={fits} />
            </View>
            <ReconcileStartDialog account={model.startRow} mode="start" />
        </View>
    )
}

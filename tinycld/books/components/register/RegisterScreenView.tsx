import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useWindowHeight } from '@tinycld/core/components/workspace/useBreakpoint'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { ScrollView, Text, View } from 'react-native'
import type { RegisterScreenModel } from '../../hooks/useRegisterScreen'
import { useRowWindow } from '../../hooks/useRowWindow'
import { balanceTone } from '../../lib/register'
import { EntryDrawer } from './EntryDrawer'
import { CARD_HEIGHT, RegisterCard } from './RegisterCard'
import { RegisterEmptyState } from './RegisterEmptyState'
import { BackOnlyHeader, RegisterHeader } from './RegisterHeader'
import { balanceText } from './RegisterRow'
import { RegisterTable, type TableItem, tableItems } from './RegisterTable'

function LoadingBody({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="register-loading" className="flex-1">
            <LoadingState />
        </View>
    )
}

function ErrorBody({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View testID="register-error" accessibilityRole="alert" className="items-center gap-3 p-6">
            <Text className="text-base font-medium text-foreground">
                Could not load this register
            </Text>
            <Button
                testID="register-retry"
                variant="outline"
                style={{ minHeight: 44 }}
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function EmptyBody({ model }: { model: RegisterScreenModel }) {
    if (model.state !== 'empty' && model.state !== 'empty-range') return null
    return (
        <RegisterEmptyState
            kind={model.state}
            canCreate={model.isNewEntryVisible}
            onNewEntry={model.onNewEntry}
            onShowFiscalYear={() => model.onPreset('this-fiscal-year')}
            isOtherPresetSelected={model.isOtherPresetSelected}
        />
    )
}

function OpeningCard({ balance, currency }: { balance: number | null; currency: string }) {
    return (
        <View
            testID="register-opening-card"
            className="flex-row items-center justify-between gap-3 border-b border-border bg-background px-4"
            style={{ height: CARD_HEIGHT }}
        >
            <Text className="text-sm italic text-muted-foreground">Opening balance</Text>
            <Text className={`text-right text-sm font-medium ${balanceTone(balance)}`}>
                {balanceText(balance, currency)}
            </Text>
        </View>
    )
}

function CardItem({ item, model }: { item: TableItem; model: RegisterScreenModel }) {
    if (item.kind === 'opening') {
        return <OpeningCard balance={model.register.openingBalance} currency={model.currency} />
    }
    return (
        <RegisterCard
            row={item.row}
            currency={model.currency}
            onOpenEntry={model.onOpenEntry}
            isSelected={item.row.entryId === model.selectedEntryId}
        />
    )
}

function CardList({ model }: { model: RegisterScreenModel }) {
    const { register, order } = model
    const items = tableItems(register.rows, register.showOpeningRow, order)
    const viewHeight = useWindowHeight()
    const rowWindow = useRowWindow({ total: items.length, rowHeight: CARD_HEIGHT, viewHeight })
    const visible = items
        .slice(rowWindow.first, rowWindow.last)
        .map(item => (
            <CardItem
                key={item.kind === 'opening' ? 'opening' : item.row.id}
                item={item}
                model={model}
            />
        ))
    return (
        <ScrollView
            testID="register-cards"
            className="flex-1"
            onScroll={rowWindow.onScroll}
            scrollEventThrottle={16}
        >
            <View style={{ height: rowWindow.topSpace }} />
            {visible}
            <View style={{ height: rowWindow.bottomSpace }} />
        </ScrollView>
    )
}

function ListBody({ model }: { model: RegisterScreenModel }) {
    if (model.state !== 'ready') return null
    if (!model.isWide) return <CardList model={model} />
    return (
        <View className="min-w-0 flex-1">
            <RegisterTable
                rows={model.register.rows}
                showOpeningRow={model.register.showOpeningRow}
                openingBalance={model.register.openingBalance}
                currency={model.currency}
                order={model.order}
                onToggleOrder={model.onToggleOrder}
                onOpenEntry={model.onOpenEntry}
                selectedEntryId={model.selectedEntryId}
            />
        </View>
    )
}

function NotFound({ model }: { model: RegisterScreenModel }) {
    return (
        <View className="flex-1 bg-background">
            <BackOnlyHeader onBack={model.onBack} />
            <View className="items-center p-8">
                <Text testID="register-not-found" className="text-base text-foreground">
                    This account does not exist
                </Text>
            </View>
        </View>
    )
}

export function RegisterScreenView(model: RegisterScreenModel) {
    if (model.state === 'not-found') return <NotFound model={model} />
    return (
        <View className="flex-1 flex-row bg-background">
            <View className="min-w-0 flex-1">
                <RegisterHeader model={model} />
                <LoadingBody isVisible={model.state === 'loading'} />
                <ErrorBody isVisible={model.state === 'error'} onRetry={model.onRetry} />
                <EmptyBody model={model} />
                <ListBody model={model} />
            </View>
            <EntryDrawer
                detail={model.selectedEntry}
                currency={model.currency}
                isWide={model.isWide}
                isTablet={model.isTablet}
                onClose={model.onCloseEntry}
            />
        </View>
    )
}

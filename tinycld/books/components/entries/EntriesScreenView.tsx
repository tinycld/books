import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useWindowHeight } from '@tinycld/core/components/workspace/useBreakpoint'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { ScrollView, Text, View } from 'react-native'
import type { EntriesScreenModel } from '../../hooks/useEntriesScreen'
import { ROW_OVERSCAN, useRowWindow } from '../../hooks/useRowWindow'
import { useFabClearanceStyle } from '../../lib/fab-clearance'
import { ENTRY_CARD_HEIGHT, EntryCard } from './EntryCard'
import { EntryEmptyState } from './EntryEmptyState'
import { EntryTable } from './EntryTable'
import { EntryToolbar } from './EntryToolbar'

function LoadingBody({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="entries-loading" className="flex-1">
            <LoadingState />
        </View>
    )
}

function ErrorBody({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View testID="entries-error" accessibilityRole="alert" className="items-center gap-3 p-6">
            <Text className="text-base font-medium text-foreground">
                Could not load journal entries
            </Text>
            <Button
                testID="entries-retry"
                variant="outline"
                style={{ minHeight: 44 }}
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function CardList({ model }: { model: EntriesScreenModel }) {
    const fabClearanceStyle = useFabClearanceStyle()
    const viewHeight = useWindowHeight()
    const rowWindow = useRowWindow({
        total: model.entries.length,
        rowHeight: ENTRY_CARD_HEIGHT,
        viewHeight,
    })
    const visible = model.entries
        .slice(rowWindow.first, rowWindow.last)
        .map(entry => (
            <EntryCard
                key={entry.id}
                entry={entry}
                currency={model.currency}
                onOpenEntry={model.onOpenEntry}
            />
        ))
    const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        rowWindow.onScroll(event)
        const { contentOffset, layoutMeasurement } = event.nativeEvent
        const lastShown = (contentOffset.y + layoutMeasurement.height) / ENTRY_CARD_HEIGHT
        if (lastShown + ROW_OVERSCAN >= model.entries.length) model.onNearEnd()
    }
    return (
        <ScrollView
            testID="entries-cards"
            className="flex-1"
            contentContainerStyle={fabClearanceStyle}
            onScroll={onScroll}
            scrollEventThrottle={16}
        >
            <View style={{ height: rowWindow.topSpace }} />
            {visible}
            <View style={{ height: rowWindow.bottomSpace }} />
        </ScrollView>
    )
}

function ListBody({ isVisible, model }: { isVisible: boolean; model: EntriesScreenModel }) {
    if (!isVisible) return null
    if (!model.isWide) return <CardList model={model} />
    return (
        <View className="min-w-0 flex-1">
            <EntryTable
                entries={model.entries}
                currency={model.currency}
                onOpenEntry={model.onOpenEntry}
                onNearEnd={model.onNearEnd}
            />
        </View>
    )
}

export function EntriesScreenView({ model }: { model: EntriesScreenModel }) {
    const { viewState } = model
    return (
        <View testID="entries-screen" className="min-w-0 flex-1 bg-background">
            <EntryToolbar canWrite={model.canWrite} filters={model.filters} onNew={model.onNew} />
            <LoadingBody isVisible={viewState === 'loading'} />
            <ErrorBody isVisible={viewState === 'error'} onRetry={model.onRetry} />
            <EntryEmptyState
                isVisible={viewState === 'empty'}
                kind="none"
                canWrite={model.canWrite}
                onNew={model.onNew}
                onClearFilters={model.onClearFilters}
            />
            <EntryEmptyState
                isVisible={viewState === 'no-match'}
                kind="no-match"
                canWrite={model.canWrite}
                onNew={model.onNew}
                onClearFilters={model.onClearFilters}
            />
            <ListBody isVisible={viewState === 'ready'} model={model} />
        </View>
    )
}

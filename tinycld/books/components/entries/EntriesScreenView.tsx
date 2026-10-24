import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { ScrollView, Text, View } from 'react-native'
import type { EntriesScreenModel } from '../../hooks/useEntriesScreen'
import { useFabClearanceStyle } from '../../lib/fab-clearance'
import { EntryEmptyState } from './EntryEmptyState'
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

function ListBody({
    isVisible,
    entries,
}: {
    isVisible: boolean
    entries: EntriesScreenModel['entries']
}) {
    const fabClearanceStyle = useFabClearanceStyle()
    if (!isVisible) return null
    const memos = entries.map(entry => (
        <Text
            key={entry.id}
            testID={`entries-memo-${entry.id}`}
            className="px-4 py-3 text-sm text-foreground"
        >
            {entry.memo}
        </Text>
    ))
    return (
        <ScrollView className="flex-1" contentContainerStyle={fabClearanceStyle}>
            {memos}
        </ScrollView>
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
            <ListBody isVisible={viewState === 'ready'} entries={model.entries} />
        </View>
    )
}

import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

interface EntryEmptyStateProps {
    isVisible: boolean
    kind: 'none' | 'no-match'
    canWrite: boolean
    onNew(): void
    onClearFilters(): void
}

function NewEntryAction({ isVisible, onNew }: { isVisible: boolean; onNew: () => void }) {
    if (!isVisible) return null
    return (
        <Button testID="entries-new" style={{ minHeight: 44 }} onPress={onNew}>
            <ButtonText>New journal entry</ButtonText>
        </Button>
    )
}

function ReadOnlyNote({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text className="text-center text-sm text-muted-foreground">
            Journal entries appear here once a bookkeeper creates them.
        </Text>
    )
}

function NoneState({ canWrite, onNew }: Pick<EntryEmptyStateProps, 'canWrite' | 'onNew'>) {
    return (
        <View testID="entries-empty" className="items-center gap-3 p-8">
            <Text className="text-base font-medium text-foreground">No journal entries yet</Text>
            <NewEntryAction isVisible={canWrite} onNew={onNew} />
            <ReadOnlyNote isVisible={!canWrite} />
        </View>
    )
}

function NoMatchState({ onClearFilters }: Pick<EntryEmptyStateProps, 'onClearFilters'>) {
    return (
        <View testID="entries-no-match" className="items-center gap-3 p-8">
            <Text className="text-base font-medium text-foreground">No entries match</Text>
            <Button
                testID="entries-clear-filters"
                variant="outline"
                style={{ minHeight: 44 }}
                onPress={onClearFilters}
            >
                <ButtonText>Clear filters</ButtonText>
            </Button>
        </View>
    )
}

export function EntryEmptyState({
    isVisible,
    kind,
    canWrite,
    onNew,
    onClearFilters,
}: EntryEmptyStateProps) {
    if (!isVisible) return null
    if (kind === 'none') return <NoneState canWrite={canWrite} onNew={onNew} />
    return <NoMatchState onClearFilters={onClearFilters} />
}

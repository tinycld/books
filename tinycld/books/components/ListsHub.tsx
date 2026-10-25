import { EmptyState } from '@tinycld/core/components/EmptyState'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useListsHub } from '../hooks/useListsHub'
import { useFabClearanceStyle } from '../lib/fab-clearance'
import type { ListEntry } from '../lib/shell-nav'
import { SetupCard } from './SetupCard'

interface ListsHubProps {
    entries?: readonly ListEntry[]
}

interface ListCardProps {
    entry: ListEntry
    onPress: (entry: ListEntry) => void
}

function ListCard({ entry, onPress }: ListCardProps) {
    return (
        <Pressable
            testID={`books-list-card-${entry.id}`}
            accessibilityRole="button"
            onPress={() => onPress(entry)}
            className="w-64 gap-1 rounded-xl border border-border bg-background p-4"
            style={{ minHeight: 44 }}
        >
            <Text className="text-base font-semibold text-foreground">{entry.label}</Text>
            <Text className="text-xs text-muted-foreground">{entry.description}</Text>
        </Pressable>
    )
}

function EmptyHub({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View className="items-center gap-1">
            <EmptyState message="No lists yet" />
            <Text className="text-sm text-muted-foreground">
                Lists appear here as Books features are added.
            </Text>
        </View>
    )
}

export function ListsHub({ entries }: ListsHubProps) {
    const { cards, isEmpty, open, showSetupCard } = useListsHub(entries)
    const fabClearanceStyle = useFabClearanceStyle()

    return (
        <ScrollView className="flex-1 bg-background" contentContainerStyle={fabClearanceStyle}>
            <View className="gap-4 p-6">
                <Text className="text-2xl font-semibold text-foreground">Lists</Text>
                <SetupCard isVisible={showSetupCard} />
                <View className="flex-row flex-wrap gap-3">
                    {cards.map(entry => (
                        <ListCard key={entry.id} entry={entry} onPress={open} />
                    ))}
                </View>
                <EmptyHub isVisible={isEmpty} />
            </View>
        </ScrollView>
    )
}

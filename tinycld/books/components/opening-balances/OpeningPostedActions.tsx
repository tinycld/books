import { Button, ButtonText } from '@tinycld/core/ui/button'
import { type Href, router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'

interface OpeningPostedActionsProps {
    isVisible: boolean
    entryHref: Href | null
    canWrite: boolean
    onEdit: () => void
}

function EditBalancesButton({ isVisible, onPress }: { isVisible: boolean; onPress: () => void }) {
    if (!isVisible) return null
    return (
        <Button testID="opening-edit-balances" style={{ minHeight: 44 }} onPress={onPress}>
            <ButtonText>Edit balances</ButtonText>
        </Button>
    )
}

function ViewEntryLink({ href }: { href: Href | null }) {
    if (href === null) return null
    return (
        <Pressable
            testID="opening-view-entry"
            accessibilityRole="link"
            onPress={() => router.push(href)}
            className="justify-center"
            style={{ minHeight: 44 }}
        >
            <Text className="text-sm font-medium text-primary">View journal entry</Text>
        </Pressable>
    )
}

export function OpeningPostedActions({
    isVisible,
    entryHref,
    canWrite,
    onEdit,
}: OpeningPostedActionsProps) {
    if (!isVisible) return null
    return (
        <View className="flex-row flex-wrap items-center gap-3">
            <ViewEntryLink href={entryHref} />
            <EditBalancesButton isVisible={canWrite} onPress={onEdit} />
        </View>
    )
}

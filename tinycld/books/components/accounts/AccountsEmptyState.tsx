import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'

interface AccountsEmptyStateProps {
    hasFilters: boolean
    hasHiddenInactive: boolean
    canWrite: boolean
    onNew: () => void
    onClear: () => void
    onShowInactive: () => void
}

function ShowInactiveAction({
    isVisible,
    onShowInactive,
}: {
    isVisible: boolean
    onShowInactive: () => void
}) {
    if (!isVisible) return null
    return (
        <Button
            testID="account-empty-show-inactive"
            size="sm"
            variant="outline"
            onPress={onShowInactive}
        >
            <ButtonText>Show inactive</ButtonText>
        </Button>
    )
}

function ClearAction({ isVisible, onClear }: { isVisible: boolean; onClear: () => void }) {
    if (!isVisible) return null
    return (
        <Button size="sm" variant="outline" onPress={onClear}>
            <ButtonText>Clear filters</ButtonText>
        </Button>
    )
}

function WriterActions({ isVisible, onNew }: { isVisible: boolean; onNew: () => void }) {
    const orgHref = useOrgHref()
    if (!isVisible) return null
    return (
        <View className="items-center gap-3">
            <Button size="sm" onPress={onNew}>
                <ButtonText>New account</ButtonText>
            </Button>
            <Pressable
                testID="account-empty-import"
                accessibilityRole="link"
                onPress={() => router.push(orgHref('books/accounts/import'))}
                style={{ minHeight: 32, justifyContent: 'center' }}
            >
                <Text className="text-sm text-primary">Import from CSV</Text>
            </Pressable>
        </View>
    )
}

export function AccountsEmptyState({
    hasFilters,
    hasHiddenInactive,
    canWrite,
    onNew,
    onClear,
    onShowInactive,
}: AccountsEmptyStateProps) {
    const noMatch = hasFilters || hasHiddenInactive
    const message = noMatch ? 'No accounts match' : 'No accounts yet'
    return (
        <View testID="accounts-empty" className="items-center gap-4 p-8">
            <Text className="text-base font-medium text-foreground">{message}</Text>
            <ClearAction isVisible={hasFilters} onClear={onClear} />
            <ShowInactiveAction
                isVisible={hasHiddenInactive && !hasFilters}
                onShowInactive={onShowInactive}
            />
            <WriterActions isVisible={!noMatch && canWrite} onNew={onNew} />
        </View>
    )
}

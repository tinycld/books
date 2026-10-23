import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'

interface AccountsEmptyStateProps {
    hasFilters: boolean
    hasHiddenInactive: boolean
    canWrite: boolean
    isWide: boolean
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

function NewAction({ isVisible, onNew }: { isVisible: boolean; onNew: () => void }) {
    if (!isVisible) return null
    return (
        <Button size="sm" onPress={onNew}>
            <ButtonText>New account</ButtonText>
        </Button>
    )
}

function WriterActions({
    isVisible,
    showNew,
    onNew,
}: {
    isVisible: boolean
    showNew: boolean
    onNew: () => void
}) {
    const orgHref = useOrgHref()
    if (!isVisible) return null
    return (
        <View className="items-center gap-3">
            <NewAction isVisible={showNew} onNew={onNew} />
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
    isWide,
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
            {/* The phone header already carries "New account". */}
            <WriterActions isVisible={!noMatch && canWrite} showNew={isWide} onNew={onNew} />
        </View>
    )
}

import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

interface CustomersEmptyStateProps {
    kind: 'none' | 'no-match' | 'all-inactive' | null
    canWrite: boolean
    onNew(): void
    onClearSearch(): void
    onShowInactive(): void
}

function NewCustomerAction({ isVisible, onNew }: { isVisible: boolean; onNew: () => void }) {
    if (!isVisible) return null
    return (
        <Button testID="customers-empty-new" size="sm" style={{ minHeight: 44 }} onPress={onNew}>
            <ButtonText>New customer</ButtonText>
        </Button>
    )
}

function NoneState({ canWrite, onNew }: Pick<CustomersEmptyStateProps, 'canWrite' | 'onNew'>) {
    const hint = canWrite
        ? 'Add the people and companies you sell to.'
        : 'Customers appear here once a bookkeeper adds them.'
    return (
        <View testID="customers-empty" className="items-center gap-4 p-8">
            <Text className="text-base font-medium text-foreground">No customers yet</Text>
            <Text className="text-center text-sm text-muted-foreground">{hint}</Text>
            <NewCustomerAction isVisible={canWrite} onNew={onNew} />
        </View>
    )
}

function NoMatchState({ onClearSearch }: Pick<CustomersEmptyStateProps, 'onClearSearch'>) {
    return (
        <View testID="customers-no-match" className="items-center gap-4 p-8">
            <Text className="text-base font-medium text-foreground">No customers match</Text>
            <Button
                testID="customers-clear-search"
                variant="outline"
                size="sm"
                style={{ minHeight: 44 }}
                onPress={onClearSearch}
            >
                <ButtonText>Clear search</ButtonText>
            </Button>
        </View>
    )
}

function AllInactiveState({ onShowInactive }: Pick<CustomersEmptyStateProps, 'onShowInactive'>) {
    return (
        <View className="items-center gap-4 p-8">
            <Text className="text-base font-medium text-foreground">No active customers</Text>
            <Button variant="outline" size="sm" style={{ minHeight: 44 }} onPress={onShowInactive}>
                <ButtonText>Show inactive</ButtonText>
            </Button>
        </View>
    )
}

// `kind` null draws nothing: the list has rows, or is still loading.
export function CustomersEmptyState({
    kind,
    canWrite,
    onNew,
    onClearSearch,
    onShowInactive,
}: CustomersEmptyStateProps) {
    if (kind === 'none') return <NoneState canWrite={canWrite} onNew={onNew} />
    if (kind === 'no-match') return <NoMatchState onClearSearch={onClearSearch} />
    if (kind === 'all-inactive') return <AllInactiveState onShowInactive={onShowInactive} />
    return null
}

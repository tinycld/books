import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { listWriteControls } from '../lib/party-list'

type EmptyCopy = { singular: string; plural: string; emptyHint: string }

interface ListEmptyStateProps {
    kind: 'none' | 'no-match' | 'all-inactive' | null
    testIdPrefix: string
    copy: EmptyCopy
    canWrite: boolean
    onNew(): void
    onClearSearch(): void
    onShowInactive(): void
}

function NewAction({
    isVisible,
    testIdPrefix,
    singular,
    onNew,
}: {
    isVisible: boolean
    testIdPrefix: string
    singular: string
    onNew: () => void
}) {
    if (!isVisible) return null
    const label = `New ${singular}`
    return (
        <Button
            testID={`${testIdPrefix}-empty-new`}
            size="sm"
            style={{ minHeight: 44 }}
            onPress={onNew}
        >
            <ButtonText>{label}</ButtonText>
        </Button>
    )
}

function NoneState({
    testIdPrefix,
    copy,
    canWrite,
    onNew,
}: Pick<ListEmptyStateProps, 'testIdPrefix' | 'copy' | 'canWrite' | 'onNew'>) {
    const { showEmptyNew } = listWriteControls(canWrite)
    const title = `No ${copy.plural} yet`
    return (
        <View testID={`${testIdPrefix}-empty`} className="items-center gap-4 p-8">
            <Text className="text-base font-medium text-foreground">{title}</Text>
            <Text className="text-center text-sm text-muted-foreground">{copy.emptyHint}</Text>
            <NewAction
                isVisible={showEmptyNew}
                testIdPrefix={testIdPrefix}
                singular={copy.singular}
                onNew={onNew}
            />
        </View>
    )
}

function NoMatchState({
    testIdPrefix,
    plural,
    onClearSearch,
}: Pick<ListEmptyStateProps, 'testIdPrefix' | 'onClearSearch'> & { plural: string }) {
    const title = `No ${plural} match`
    return (
        <View testID={`${testIdPrefix}-no-match`} className="items-center gap-4 p-8">
            <Text className="text-base font-medium text-foreground">{title}</Text>
            <Button
                testID={`${testIdPrefix}-clear-search`}
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

function AllInactiveState({
    testIdPrefix,
    plural,
    onShowInactive,
}: Pick<ListEmptyStateProps, 'testIdPrefix' | 'onShowInactive'> & { plural: string }) {
    const title = `No active ${plural}`
    return (
        <View testID={`${testIdPrefix}-all-inactive`} className="items-center gap-4 p-8">
            <Text className="text-base font-medium text-foreground">{title}</Text>
            <Button
                testID={`${testIdPrefix}-all-inactive-show`}
                variant="outline"
                size="sm"
                style={{ minHeight: 44 }}
                onPress={onShowInactive}
            >
                <ButtonText>Show inactive</ButtonText>
            </Button>
        </View>
    )
}

// `kind` null draws nothing: the list has rows, or is still loading.
export function ListEmptyState({
    kind,
    testIdPrefix,
    copy,
    canWrite,
    onNew,
    onClearSearch,
    onShowInactive,
}: ListEmptyStateProps) {
    if (kind === 'none') {
        return (
            <NoneState testIdPrefix={testIdPrefix} copy={copy} canWrite={canWrite} onNew={onNew} />
        )
    }
    if (kind === 'no-match') {
        return (
            <NoMatchState
                testIdPrefix={testIdPrefix}
                plural={copy.plural}
                onClearSearch={onClearSearch}
            />
        )
    }
    if (kind === 'all-inactive') {
        return (
            <AllInactiveState
                testIdPrefix={testIdPrefix}
                plural={copy.plural}
                onShowInactive={onShowInactive}
            />
        )
    }
    return null
}

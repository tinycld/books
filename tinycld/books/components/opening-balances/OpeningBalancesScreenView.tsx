import { EmptyState } from '@tinycld/core/components/EmptyState'
import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import type { OpeningScreen } from '../../hooks/useOpeningBalancesScreen'
import { OpeningBalancesHeader, type OpeningStatusBadge } from './OpeningBalancesHeader'
import { OpeningEmptyState } from './OpeningEmptyState'
import { OpeningFormScreen } from './OpeningFormScreen'

const EXPLANATION =
    'Enter what each account held at the end of your starting date. Books posts one journal entry and balances it with Opening Balance Equity.'

function LoadingBody({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="opening-loading" className="flex-1">
            <LoadingState />
        </View>
    )
}

function ErrorBody({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View
            testID="opening-error"
            accessibilityRole="alert"
            className="flex-row items-center justify-between gap-3 border-y border-danger/40 bg-danger/10 px-4 py-2"
        >
            <Text className="min-w-0 flex-1 text-sm text-danger">
                Could not load opening balances
            </Text>
            <Button
                testID="opening-retry"
                variant="outline"
                size="sm"
                style={{ minHeight: 44 }}
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function NoAccessBody({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <EmptyState message="You do not have access to Books." />
}

function NoEntryBody({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="opening-no-entry" className="items-center p-8">
            <Text className="text-base text-muted-foreground">
                No opening balances have been entered.
            </Text>
        </View>
    )
}

function FormBody({ screen }: { screen: OpeningScreen }) {
    if (screen.formKey === null) return null
    return <OpeningFormScreen key={screen.formKey} screen={screen} />
}

const DRAFT_BADGE: OpeningStatusBadge = { label: 'Draft', tone: 'draft' }

export function OpeningBalancesScreenView({ screen }: { screen: OpeningScreen }) {
    const kind = screen.state.kind
    const hasDraft = kind === 'draft' && screen.formKey !== null
    return (
        <View testID="opening-balances-screen" className="flex-1 bg-background">
            <OpeningBalancesHeader
                title="Opening balances"
                subtitleLine={EXPLANATION}
                statusBadge={hasDraft ? DRAFT_BADGE : undefined}
            />
            <LoadingBody isVisible={kind === 'loading'} />
            <ErrorBody isVisible={kind === 'error' || screen.hasLateError} onRetry={screen.retry} />
            <NoAccessBody isVisible={kind === 'no-access'} />
            <OpeningEmptyState isVisible={kind === 'empty-chart'} />
            <NoEntryBody isVisible={kind === 'new' && !screen.canWrite} />
            <FormBody screen={screen} />
        </View>
    )
}

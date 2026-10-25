import { EmptyState } from '@tinycld/core/components/EmptyState'
import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import type { OpeningScreen } from '../../hooks/useOpeningBalancesScreen'
import { postedLine } from '../../lib/opening-balances'
import { OpeningBalancesHeader, type OpeningStatusBadge } from './OpeningBalancesHeader'
import { OpeningEmptyState } from './OpeningEmptyState'
import { OpeningFormScreen } from './OpeningFormScreen'
import { OpeningPostedView } from './OpeningPostedView'

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
const POSTED_BADGE: OpeningStatusBadge = { label: 'Posted', tone: 'posted' }

function PostedBody({ screen, isVisible }: { screen: OpeningScreen; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <OpeningPostedView
            bands={screen.bands}
            accounts={screen.accounts}
            savedLines={screen.savedLines}
            equityAccountId={screen.equityAccount?.id ?? ''}
            currency={screen.settings?.currency ?? 'USD'}
            entryHref={screen.entryHref}
        />
    )
}

function isPostedEntry(screen: OpeningScreen) {
    return 'entry' in screen.state && screen.state.entry.status === 'posted'
}

// The posted view stands in for the form when the entry is posted, and for a user who
// cannot write (they see a draft as text too).
function isPostedView(screen: OpeningScreen) {
    const { kind } = screen.state
    const hasEntry = kind === 'draft' || kind === 'posted' || kind === 'replace'
    return hasEntry && (kind === 'posted' || !screen.canWrite)
}

function badgeFor(screen: OpeningScreen): OpeningStatusBadge | undefined {
    if (isPostedEntry(screen)) return POSTED_BADGE
    if (isPostedView(screen)) return DRAFT_BADGE
    if (screen.state.kind === 'draft' && screen.formKey !== null) return DRAFT_BADGE
    return undefined
}

function subtitleOf(screen: OpeningScreen) {
    const { entry } = screen
    if (!entry || !isPostedEntry(screen)) return { lead: EXPLANATION, tail: '' }
    return postedLine({
        number: entry.number,
        date: entry.date,
        postedBy: screen.postedBy,
        postedAt: screen.postedAt,
    })
}

export function OpeningBalancesScreenView({ screen }: { screen: OpeningScreen }) {
    const { kind } = screen.state
    const isPosted = isPostedEntry(screen)
    return (
        <View testID="opening-balances-screen" className="flex-1 bg-background">
            <OpeningBalancesHeader
                title="Opening balances"
                subtitle={subtitleOf(screen)}
                subtitleTestID={isPosted ? 'opening-posted-line' : undefined}
                statusBadge={badgeFor(screen)}
            />
            <LoadingBody isVisible={kind === 'loading'} />
            <ErrorBody isVisible={kind === 'error' || screen.hasLateError} onRetry={screen.retry} />
            <NoAccessBody isVisible={kind === 'no-access'} />
            <OpeningEmptyState isVisible={kind === 'empty-chart'} />
            <NoEntryBody isVisible={kind === 'new' && !screen.canWrite} />
            <PostedBody screen={screen} isVisible={isPostedView(screen)} />
            <FormBody screen={screen} />
        </View>
    )
}

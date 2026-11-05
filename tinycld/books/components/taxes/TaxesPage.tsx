import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { ScrollView, Text, View } from 'react-native'
import type { useTaxesScreen } from '../../hooks/useTaxesScreen'
import { useFabClearanceStyle } from '../../lib/fab-clearance'
import { TAXES_LOAD_ERROR } from '../../lib/tax-messages'
import { emptyState, type TaxesView } from '../../lib/taxes-view'
import { useTaxesStore } from '../../stores/taxes-store'
import { ListBanner } from '../ListBanner'
import { ShowInactiveChip } from '../ShowInactiveChip'
import { AgencyCard } from './AgencyCard'
import { GroupsCard } from './GroupsCard'
import { TaxesEmpty } from './TaxesEmpty'

type TaxesScreen = ReturnType<typeof useTaxesScreen>

interface TaxesPageProps {
    screen: TaxesScreen
}

const noTrailing = () => null

function Actions({ isVisible }: { isVisible: boolean }) {
    const showInactive = useTaxesStore(s => s.showInactive)
    const setShowInactive = useTaxesStore(s => s.setShowInactive)
    const toggleShowInactive = () => setShowInactive(!showInactive)
    if (!isVisible) return null
    return (
        <View testID="taxes-actions" className="flex-row flex-wrap items-center gap-2">
            <ShowInactiveChip
                testID="taxes-show-inactive"
                isOn={showInactive}
                onToggle={toggleShowInactive}
                minHeight={36}
            />
        </View>
    )
}

// Wide, the actions sit right of the title; on a phone they wrap under it.
function Header({ showActions, isWide }: { showActions: boolean; isWide: boolean }) {
    const layout = isWide ? 'flex-row items-center justify-between' : ''
    return (
        <View className={`gap-3 ${layout}`}>
            <Text testID="taxes-title" className="text-2xl font-semibold text-foreground">
                Sales tax
            </Text>
            <Actions isVisible={showActions} />
        </View>
    )
}

function Loading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="taxes-loading" className="h-64">
            <LoadingState />
        </View>
    )
}

function Cards({ view }: { view: TaxesView }) {
    const cards = view.agencies.map(card => (
        <AgencyCard
            key={card.id}
            card={card}
            menu={null}
            footer={null}
            renderRowTrailing={noTrailing}
        />
    ))
    return (
        <>
            {cards}
            <GroupsCard rows={view.groups} hint={view.groupsHint} renderRowTrailing={noTrailing} />
        </>
    )
}

function Ready({ isVisible, screen }: { isVisible: boolean; screen: TaxesScreen }) {
    const empty = emptyState(screen.access.canWrite)
    if (!isVisible) return null
    if (screen.view.isEmpty) return <TaxesEmpty state={empty} action={null} />
    return <Cards view={screen.view} />
}

export function TaxesPage({ screen }: TaxesPageProps) {
    const fabClearance = useFabClearanceStyle()
    const isWide = useBreakpoint() !== 'mobile'
    const pad = isWide ? 'p-6' : 'px-4 py-4'
    const { state, view, controls } = screen
    const isLoading = state === 'loading'
    const isReady = state === 'ready'
    const loadError = state === 'error' ? TAXES_LOAD_ERROR : null
    // In the loading and error states nothing under the actions reacts to them.
    const showActions = isReady && controls.showActions && !view.isEmpty
    return (
        <ScrollView className="flex-1 bg-background" contentContainerStyle={fabClearance}>
            <View testID="taxes-screen" className={`w-full max-w-[880px] gap-4 ${pad}`}>
                <Header showActions={showActions} isWide={isWide} />
                <ListBanner
                    testIdPrefix="taxes"
                    message={loadError}
                    onRetry={screen.retry}
                    isFlush
                />
                <Loading isVisible={isLoading} />
                <Ready isVisible={isReady} screen={screen} />
            </View>
        </ScrollView>
    )
}

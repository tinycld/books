import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Plus } from 'lucide-react-native'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { useTaxesScreen } from '../../hooks/useTaxesScreen'
import { useFabClearanceStyle } from '../../lib/fab-clearance'
import { TAXES_LOAD_ERROR } from '../../lib/tax-messages'
import { emptyState, type TaxesControls, type TaxesView } from '../../lib/taxes-view'
import { useTaxesStore } from '../../stores/taxes-store'
import { ListBanner } from '../ListBanner'
import { ShowInactiveChip } from '../ShowInactiveChip'
import { AgencyCard } from './AgencyCard'
import { GroupsCard } from './GroupsCard'
import { TaxDialogs } from './TaxDialogs'
import { TaxesEmpty } from './TaxesEmpty'

type TaxesScreen = ReturnType<typeof useTaxesScreen>

interface TaxesPageProps {
    screen: TaxesScreen
}

const noTrailing = () => null

interface AddAgencyButtonProps {
    isVisible: boolean
    testID: string
    minHeight: number
    isDisabled: boolean
}

function AddAgencyButton({ isVisible, testID, minHeight, isDisabled }: AddAgencyButtonProps) {
    const openDialog = useTaxesStore(s => s.openDialog)
    if (!isVisible) return null
    return (
        <Button
            testID={testID}
            size="sm"
            style={{ minHeight }}
            isDisabled={isDisabled}
            onPress={() => openDialog({ kind: 'agency', id: null })}
        >
            <ButtonText>Add agency</ButtonText>
        </Button>
    )
}

interface AddRateButtonProps {
    isVisible: boolean
    agencyId: string
    isDisabled: boolean
}

// Under an agency's rates: a new rate starts on this agency.
function AddRateButton({ isVisible, agencyId, isDisabled }: AddRateButtonProps) {
    const openDialog = useTaxesStore(s => s.openDialog)
    const color = useThemeColor('primary')
    if (!isVisible) return null
    const dim = isDisabled ? 'opacity-50' : ''
    return (
        <Pressable
            testID={`tax-agency-add-rate-${agencyId}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: isDisabled }}
            disabled={isDisabled}
            onPress={() => openDialog({ kind: 'rate', id: null, agencyId })}
            className={`mt-1 flex-row items-center gap-1 self-start ${dim}`}
            style={{ minHeight: 44 }}
        >
            <Plus size={16} color={color} />
            <Text className="text-sm font-medium text-primary">Add rate</Text>
        </Pressable>
    )
}

function Actions({ isVisible, canPressWrites }: { isVisible: boolean; canPressWrites: boolean }) {
    const showInactive = useTaxesStore(s => s.showInactive)
    const setShowInactive = useTaxesStore(s => s.setShowInactive)
    const toggleShowInactive = () => setShowInactive(!showInactive)
    if (!isVisible) return null
    return (
        <View testID="taxes-actions" className="flex-row flex-wrap items-center gap-2">
            <AddAgencyButton
                isVisible
                testID="taxes-add-agency"
                minHeight={36}
                isDisabled={!canPressWrites}
            />
            <ShowInactiveChip
                testID="taxes-show-inactive"
                isOn={showInactive}
                onToggle={toggleShowInactive}
                minHeight={36}
            />
        </View>
    )
}

interface HeaderProps {
    showActions: boolean
    canPressWrites: boolean
    isWide: boolean
}

// Wide, the actions sit right of the title; on a phone they wrap under it.
function Header({ showActions, canPressWrites, isWide }: HeaderProps) {
    const layout = isWide ? 'flex-row items-center justify-between' : ''
    return (
        <View className={`gap-3 ${layout}`}>
            <Text testID="taxes-title" className="text-2xl font-semibold text-foreground">
                Sales tax
            </Text>
            <Actions isVisible={showActions} canPressWrites={canPressWrites} />
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

function Cards({ view, controls }: { view: TaxesView; controls: TaxesControls }) {
    const cards = view.agencies.map(card => (
        <AgencyCard
            key={card.id}
            card={card}
            menu={null}
            footer={
                // The server refuses a rate on an inactive agency, so its card offers none.
                <AddRateButton
                    isVisible={controls.showActions && !card.inactive}
                    agencyId={card.id}
                    isDisabled={!controls.canPressWrites}
                />
            }
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
    if (screen.view.isEmpty) {
        const action = (
            <AddAgencyButton
                isVisible={empty.showAddAgency}
                testID="taxes-empty-add-agency"
                minHeight={44}
                isDisabled={!screen.controls.canPressWrites}
            />
        )
        return <TaxesEmpty state={empty} action={action} />
    }
    return <Cards view={screen.view} controls={screen.controls} />
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
            <TaxDialogs />
            <View testID="taxes-screen" className={`w-full max-w-[880px] gap-4 ${pad}`}>
                <Header
                    showActions={showActions}
                    canPressWrites={controls.canPressWrites}
                    isWide={isWide}
                />
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

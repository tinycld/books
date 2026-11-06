import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Plus } from 'lucide-react-native'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { useTaxesScreen } from '../../hooks/useTaxesScreen'
import { useFabClearanceStyle } from '../../lib/fab-clearance'
import type { AgencyMenuItem, TaxDeleteTarget, TaxMenuItem } from '../../lib/tax-menu'
import {
    type AgencyCardView,
    addGroupEnabled,
    emptyState,
    type TaxRowView,
} from '../../lib/taxes-view'
import { useTaxesStore } from '../../stores/taxes-store'
import { ListBanner } from '../ListBanner'
import { ShowInactiveChip } from '../ShowInactiveChip'
import { AgencyCard } from './AgencyCard'
import { AgencyMenu } from './AgencyMenu'
import { DefaultCard } from './DefaultCard'
import { GroupsCard } from './GroupsCard'
import { TaxDialogs } from './TaxDialogs'
import { TaxesEmpty } from './TaxesEmpty'
import { TaxRowMenu } from './TaxRowMenu'

type TaxesScreen = ReturnType<typeof useTaxesScreen>

interface TaxesPageProps {
    screen: TaxesScreen
}

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

function AddGroupButton({ isDisabled }: { isDisabled: boolean }) {
    const openDialog = useTaxesStore(s => s.openDialog)
    return (
        <Button
            testID="taxes-add-group"
            variant="outline"
            size="sm"
            style={{ minHeight: 36 }}
            isDisabled={isDisabled}
            onPress={() => openDialog({ kind: 'group', id: null })}
        >
            <ButtonText>Add group</ButtonText>
        </Button>
    )
}

interface ActionsProps {
    isVisible: boolean
    canPressWrites: boolean
    canAddGroup: boolean
}

function Actions({ isVisible, canPressWrites, canAddGroup }: ActionsProps) {
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
            <AddGroupButton isDisabled={!canAddGroup} />
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
    canAddGroup: boolean
    isWide: boolean
}

// Wide, the actions sit right of the title; on a phone they wrap under it.
function Header({ showActions, canPressWrites, canAddGroup, isWide }: HeaderProps) {
    const layout = isWide ? 'flex-row items-center justify-between' : ''
    return (
        <View className={`gap-3 ${layout}`}>
            <Text testID="taxes-title" className="text-2xl font-semibold text-foreground">
                Sales tax
            </Text>
            <Actions
                isVisible={showActions}
                canPressWrites={canPressWrites}
                canAddGroup={canAddGroup}
            />
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

// What each menu item does. A rate's Edit opens the rate dialog on the rate's own
// agency; a group is a books_tax_rates row, so its writes go through the rates' actions.
function useMenuSelect(screen: TaxesScreen) {
    const openDialog = useTaxesStore(s => s.openDialog)
    const { actions, view } = screen
    const currentDefaultId = view.defaultRow?.id ?? ''

    // A fresh dialog shows the record as it is now, not an earlier refusal about it.
    const openDelete = (target: TaxDeleteTarget, id: string, name: string) => {
        actions.clearRefusal(id)
        openDialog({ kind: 'delete', target, id, name })
    }

    const selectAgency = (card: AgencyCardView, item: AgencyMenuItem) => {
        if (item === 'edit') openDialog({ kind: 'agency', id: card.id })
        else if (item === 'delete') openDelete('agency', card.id, card.name)
        else void actions.agencies.setInactive(card.id, item === 'make-inactive')
    }

    const selectRow = (row: TaxRowView, agencyId: string, item: TaxMenuItem) => {
        if (item === 'edit' && row.kind === 'group') openDialog({ kind: 'group', id: row.id })
        else if (item === 'edit') openDialog({ kind: 'rate', id: row.id, agencyId })
        else if (item === 'make-default') void actions.setDefault(row.id, currentDefaultId)
        else if (item === 'remove-default') void actions.setDefault('', row.id)
        else if (item === 'delete') openDelete(row.kind, row.id, row.name)
        else void actions.rates.setInactive(row.id, item === 'make-inactive')
    }

    return { selectAgency, selectRow }
}

function Cards({ screen }: { screen: TaxesScreen }) {
    const { view, controls, actions, defaultOptions } = screen
    const { selectAgency, selectRow } = useMenuSelect(screen)
    const chooseDefault = (id: string) => {
        void actions.setDefault(id, view.defaultRow?.id ?? '')
    }
    // The menus are not dimmed with an inactive row's texts, so they stay legible.
    const rowMenu = (agencyId: string) => (row: TaxRowView) => (
        <TaxRowMenu
            row={row}
            controls={controls}
            isWorking={actions.isWorking}
            onSelect={item => selectRow(row, agencyId, item)}
        />
    )
    const cards = view.agencies.map(card => (
        <AgencyCard
            key={card.id}
            card={card}
            menu={
                <AgencyMenu
                    card={card}
                    controls={controls}
                    isWorking={actions.isWorking}
                    onSelect={item => selectAgency(card, item)}
                />
            }
            footer={
                // The server refuses a rate on an inactive agency, so its card offers none.
                <AddRateButton
                    isVisible={controls.showActions && !card.inactive}
                    agencyId={card.id}
                    isDisabled={!controls.canPressWrites}
                />
            }
            renderRowTrailing={rowMenu(card.id)}
        />
    ))
    return (
        <>
            <DefaultCard
                view={view}
                controls={controls}
                options={defaultOptions}
                isWorking={actions.isWorking}
                onChoose={chooseDefault}
            />
            {cards}
            <GroupsCard rows={view.groups} hint={view.groupsHint} renderRowTrailing={rowMenu('')} />
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
    return <Cards screen={screen} />
}

export function TaxesPage({ screen }: TaxesPageProps) {
    const fabClearance = useFabClearanceStyle()
    const isWide = useBreakpoint() !== 'mobile'
    const pad = isWide ? 'p-6' : 'px-4 py-4'
    const { state, view, controls } = screen
    const isLoading = state === 'loading'
    const isReady = state === 'ready'
    // The load error offers Retry; a row action's refusal can be dismissed.
    const isLoadError = state === 'error'
    const onRetry = isLoadError ? screen.retry : undefined
    const onDismiss = isLoadError ? undefined : screen.dismissBanner
    // In the loading and error states nothing under the actions reacts to them.
    const showActions = isReady && controls.showActions && !view.isEmpty
    const canAddGroup = addGroupEnabled(controls, view)
    return (
        <ScrollView className="flex-1 bg-background" contentContainerStyle={fabClearance}>
            <TaxDialogs actions={screen.actions} />
            <View testID="taxes-screen" className={`w-full max-w-[880px] gap-4 ${pad}`}>
                <Header
                    showActions={showActions}
                    canPressWrites={controls.canPressWrites}
                    canAddGroup={canAddGroup}
                    isWide={isWide}
                />
                <ListBanner
                    testIdPrefix="taxes"
                    message={screen.bannerMessage}
                    onRetry={onRetry}
                    onDismiss={onDismiss}
                    isFlush
                />
                <Loading isVisible={isLoading} />
                <Ready isVisible={isReady} screen={screen} />
            </View>
        </ScrollView>
    )
}

import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { useAccountActions } from '../../hooks/useAccountActions'
import type { useAccountSelection } from '../../hooks/useAccountSelection'
import type { AccountRow } from '../../hooks/useAccountsQuery'
import type { AccountMenuHandlers } from '../../hooks/useAccountsScreen'
import type { useAccountTree } from '../../hooks/useAccountTree'
import type { VisibleRow } from '../../lib/account-tree'
import { useFabClearanceStyle } from '../../lib/fab-clearance'
import { useAccountsPanelStore } from '../../stores/accounts-panel-store'
import { AccountCard } from './AccountCard'
import { AccountPanel } from './AccountPanel'
import { AccountsEmptyState } from './AccountsEmptyState'
import { AccountsErrorBanner } from './AccountsErrorBanner'
import { AccountToolbar } from './AccountToolbar'
import { AccountTree } from './AccountTree'
import { DeleteAccountDialog } from './DeleteAccountDialog'

interface AccountsScreenViewProps {
    isReady: boolean
    isWide: boolean
    isTablet: boolean
    canWrite: boolean
    isError: boolean
    tree: ReturnType<typeof useAccountTree<AccountRow>>
    onOpen: (id: string) => void
    onNew: () => void
    onRetry: () => void
    selection: Selection
    selectedCount: number
    menu: AccountMenuHandlers
    makeSelectedInactive: () => void
    deleteTarget: AccountRow | null
    cancelDelete: () => void
    actions: ReturnType<typeof useAccountActions>
    isWorking: boolean
    actionError: string | null
    clearActionError: () => void
}

type Selection = Pick<ReturnType<typeof useAccountSelection>, 'isSelected' | 'toggle'>

function BackLink() {
    const orgHref = useOrgHref()
    const color = useThemeColor('muted-foreground')
    return (
        <Pressable
            accessibilityRole="link"
            onPress={() => router.push(orgHref('books/lists'))}
            className="flex-row items-center gap-1 self-start"
            style={{ minHeight: 28 }}
        >
            <ArrowLeft size={14} color={color} />
            <Text className="text-sm text-muted-foreground">All lists</Text>
        </Pressable>
    )
}

function NewAccountButton({ isVisible, onNew }: { isVisible: boolean; onNew: () => void }) {
    if (!isVisible) return null
    return (
        <Button testID="account-new-header" size="sm" onPress={onNew}>
            <ButtonText>New account</ButtonText>
        </Button>
    )
}

function ScreenHeader({ isPhoneWriter, onNew }: { isPhoneWriter: boolean; onNew: () => void }) {
    return (
        <View className="gap-2 px-4 pb-3 pt-4">
            <BackLink />
            <View className="flex-row items-center justify-between gap-3">
                <Text className="text-2xl font-semibold text-foreground">Chart of Accounts</Text>
                <NewAccountButton isVisible={isPhoneWriter} onNew={onNew} />
            </View>
        </View>
    )
}

interface AccountListProps {
    isVisible: boolean
    rows: VisibleRow<AccountRow>[]
    canToggle: boolean
    onToggle: (id: string) => void
    onOpen: (id: string) => void
    selectedId: string
    canWrite: boolean
    isWorking: boolean
    selection: Selection
    menu: AccountMenuHandlers
}

function AccountCards({
    isVisible,
    rows,
    canToggle,
    onToggle,
    onOpen,
    selectedId,
    canWrite,
    isWorking,
    selection,
    menu,
}: AccountListProps) {
    const fabClearanceStyle = useFabClearanceStyle()
    if (!isVisible) return null
    const cards = rows.map(row => (
        <AccountCard
            key={row.node.account.id}
            row={row}
            canToggle={canToggle}
            onToggle={onToggle}
            onOpen={onOpen}
            selectedId={selectedId}
            canWrite={canWrite}
            isWorking={isWorking}
            isSelected={selection.isSelected}
            onSelect={selection.toggle}
            menu={menu}
        />
    ))
    return (
        <ScrollView className="flex-1" contentContainerStyle={fabClearanceStyle}>
            {cards}
        </ScrollView>
    )
}

function AccountsError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View testID="accounts-error" accessibilityRole="alert" className="items-center gap-3 p-6">
            <Text className="text-sm text-foreground">Could not load accounts</Text>
            <Button size="sm" variant="outline" onPress={onRetry}>
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function AccountsLoading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <LoadingState />
}

export function AccountsScreenView({
    isReady,
    isWide,
    isTablet,
    canWrite,
    isError,
    tree,
    onOpen,
    onNew,
    onRetry,
    selection,
    selectedCount,
    menu,
    makeSelectedInactive,
    deleteTarget,
    cancelDelete,
    actions,
    isWorking,
    actionError,
    clearActionError,
}: AccountsScreenViewProps) {
    const { rows, sort, canToggle, onSort, toggleCollapsed } = tree
    const selectedId = useAccountsPanelStore(s => (s.target?.mode === 'edit' ? s.target.id : ''))
    const isLoaded = isReady && !isError
    const isEmpty = isLoaded && rows.length === 0
    const showList = isLoaded && !isEmpty
    const hasFilters = tree.query.trim() !== '' || tree.group !== ''
    const hasHiddenInactive = !tree.isEmpty && !tree.showInactive && !hasFilters

    return (
        <View className="flex-1 flex-row bg-background">
            <View className="min-w-0 flex-1">
                <ScreenHeader isPhoneWriter={canWrite && !isWide} onNew={onNew} />
                <AccountsError isVisible={isError} onRetry={onRetry} />
                <AccountsErrorBanner
                    message={deleteTarget ? null : actionError}
                    onDismiss={clearActionError}
                />
                <AccountsLoading isVisible={!isReady && !isError} />
                <ToolbarSlot
                    isVisible={isLoaded && !tree.isEmpty}
                    tree={tree}
                    canWrite={canWrite}
                    isWide={isWide}
                    onNew={onNew}
                    selectedCount={selectedCount}
                    onMakeInactive={makeSelectedInactive}
                    isWorking={isWorking}
                />
                <EmptySlot
                    isVisible={isEmpty}
                    hasFilters={hasFilters}
                    hasHiddenInactive={hasHiddenInactive}
                    canWrite={canWrite}
                    isWide={isWide}
                    onNew={onNew}
                    onClear={tree.clearFilters}
                    onShowInactive={() => tree.setShowInactive(true)}
                />
                <WideTable
                    isVisible={showList && isWide}
                    rows={rows}
                    sort={sort}
                    canToggle={canToggle}
                    onSort={onSort}
                    onToggle={toggleCollapsed}
                    onOpen={onOpen}
                    selectedId={selectedId}
                    canWrite={canWrite}
                    isWorking={isWorking}
                    selection={selection}
                    menu={menu}
                />
                <AccountCards
                    isVisible={showList && !isWide}
                    rows={rows}
                    canToggle={canToggle}
                    onToggle={toggleCollapsed}
                    onOpen={onOpen}
                    selectedId={selectedId}
                    canWrite={canWrite}
                    isWorking={isWorking}
                    selection={selection}
                    menu={menu}
                />
            </View>
            <AccountPanel
                isWide={isWide}
                isTablet={isTablet}
                onViewRegister={menu.onViewRegister}
            />
            <DeleteAccountDialog account={deleteTarget} actions={actions} onClose={cancelDelete} />
        </View>
    )
}

function ToolbarSlot({
    isVisible,
    ...props
}: { isVisible: boolean } & Parameters<typeof AccountToolbar>[0]) {
    if (!isVisible) return null
    return <AccountToolbar {...props} />
}

function EmptySlot({
    isVisible,
    ...props
}: { isVisible: boolean } & Parameters<typeof AccountsEmptyState>[0]) {
    if (!isVisible) return null
    return <AccountsEmptyState {...props} />
}

type WideTableProps = AccountListProps & {
    sort: ReturnType<typeof useAccountTree<AccountRow>>['sort']
    onSort: ReturnType<typeof useAccountTree<AccountRow>>['onSort']
}

function WideTable({
    isVisible,
    rows,
    sort,
    canToggle,
    onSort,
    onToggle,
    onOpen,
    selectedId,
    canWrite,
    isWorking,
    selection,
    menu,
}: WideTableProps) {
    if (!isVisible) return null
    return (
        <AccountTree
            rows={rows}
            sort={sort}
            canToggle={canToggle}
            onSort={onSort}
            onToggle={onToggle}
            onOpen={onOpen}
            selectedId={selectedId}
            canWrite={canWrite}
            isWorking={isWorking}
            isSelected={selection.isSelected}
            onSelect={selection.toggle}
            menu={menu}
        />
    )
}

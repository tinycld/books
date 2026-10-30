import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint, useWindowHeight } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { type ReactNode, useMemo, useState } from 'react'
import {
    Pressable,
    ScrollView,
    Text,
    useWindowDimensions,
    View,
    type ViewStyle,
} from 'react-native'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useCustomerActions } from '../../hooks/useCustomerActions'
import { useCustomerNavigation, useIsShowingCustomer } from '../../hooks/useCustomerNavigation'
import { useCustomersList } from '../../hooks/useCustomersList'
import { type CustomerRecord, useCustomersQuery } from '../../hooks/useCustomersQuery'
import { useDetailSurface } from '../../hooks/useDetailSurface'
import { useRowWindow } from '../../hooks/useRowWindow'
import { useTableMinWidth } from '../../hooks/useTableMinWidth'
import { type CustomerMenuItem, customerMenuItems } from '../../lib/customer-actions'
import {
    CUSTOMER_COLUMNS,
    CUSTOMER_ROW_HEIGHT,
    CUSTOMERS_TABLE_MIN_WIDTH,
    customerCardHeight,
} from '../../lib/customer-display'
import type { CustomerListRow, CustomerListViewState } from '../../lib/customer-tree'
import { useFabClearanceStyle } from '../../lib/fab-clearance'
import { useCustomerFormStore } from '../../stores/customer-form-store'
import { CustomerCard } from './CustomerCard'
import { CUSTOMER_ROW_CLASS, CustomerRow } from './CustomerRow'
import { CustomerRowMenu } from './CustomerRowMenu'
import { CustomersBanner } from './CustomersBanner'
import { CustomersEmptyState } from './CustomersEmptyState'
import { CustomerToolbar } from './CustomerToolbar'
import { DeleteCustomerDialog } from './DeleteCustomerDialog'

type Rows = CustomerListRow<CustomerRecord>[]

type Row = Rows[number]

interface BodyProps {
    isVisible: boolean
    rows: Rows
    onOpen: (id: string) => void
    // The row menu for one customer, or null for a reader.
    menuFor: (row: Row) => ReactNode
}

// Only the table can sit beside the panel (cards show below 768 px, the panel at 1360 px).
interface TableProps extends BodyProps {
    // The row drawn as selected: the open customer on the panel surface, else none.
    selectedId: string
}

const LOAD_ERROR = 'Could not load customers'

function BackLink({ onPress }: { onPress: () => void }) {
    const color = useThemeColor('muted-foreground')
    return (
        <Pressable
            testID="customers-back"
            accessibilityRole="link"
            onPress={onPress}
            className="flex-row items-center gap-1 self-start"
            style={{ minHeight: 28 }}
        >
            <ArrowLeft size={14} color={color} />
            <Text className="text-sm text-muted-foreground">All lists</Text>
        </Pressable>
    )
}

function NewCustomerButton({ isVisible, onPress }: { isVisible: boolean; onPress: () => void }) {
    if (!isVisible) return null
    return (
        <Button testID="customer-new-header" size="sm" style={{ minHeight: 36 }} onPress={onPress}>
            <ButtonText>New customer</ButtonText>
        </Button>
    )
}

interface HeaderProps {
    canWrite: boolean
    onBack: () => void
    onNew: () => void
}

function ListHeader({ canWrite, onBack, onNew }: HeaderProps) {
    return (
        <View className="gap-2 px-4 pb-3 pt-4">
            <BackLink onPress={onBack} />
            <View className="flex-row items-center justify-between gap-3">
                <Text testID="customers-title" className="text-2xl font-semibold text-foreground">
                    Customers
                </Text>
                <NewCustomerButton isVisible={canWrite} onPress={onNew} />
            </View>
        </View>
    )
}

function ListToolbar({
    isVisible,
    ...props
}: { isVisible: boolean } & Parameters<typeof CustomerToolbar>[0]) {
    if (!isVisible) return null
    return <CustomerToolbar {...props} />
}

function LoadingBody({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="customers-loading" className="flex-1">
            <LoadingState />
        </View>
    )
}

function HeaderCell({ label, style }: { label: string; style: ViewStyle }) {
    return (
        <View className="min-w-0 pr-3" style={style}>
            <Text
                numberOfLines={1}
                className="text-xs font-semibold uppercase text-muted-foreground"
            >
                {label}
            </Text>
        </View>
    )
}

function TableHeader() {
    return (
        <View
            className={`${CUSTOMER_ROW_CLASS} border-b border-border bg-background`}
            style={{ minHeight: 44 }}
        >
            <HeaderCell label="Name" style={CUSTOMER_COLUMNS.name} />
            <HeaderCell label="Email" style={CUSTOMER_COLUMNS.email} />
            <HeaderCell label="Phone" style={CUSTOMER_COLUMNS.phone} />
            <View style={CUSTOMER_COLUMNS.menu} />
        </View>
    )
}

function CustomersTable({ isVisible, rows, selectedId, onOpen, menuFor }: TableProps) {
    const viewHeight = useWindowHeight()
    const rowWindow = useRowWindow({
        total: rows.length,
        rowHeight: CUSTOMER_ROW_HEIGHT,
        viewHeight,
    })
    const table = useTableMinWidth(CUSTOMERS_TABLE_MIN_WIDTH)
    if (!isVisible) return null
    const visible = rows
        .slice(rowWindow.first, rowWindow.last)
        .map(row => (
            <CustomerRow
                key={row.customer.id}
                row={row}
                onOpen={onOpen}
                isSelected={row.customer.id === selectedId}
                menu={menuFor(row)}
            />
        ))
    return (
        <ScrollView
            horizontal
            testID="customers-table"
            className="flex-1"
            contentContainerStyle={table.contentStyle}
        >
            <View className="flex-1">
                <ScrollView
                    ref={table.rowsScrollRef}
                    onLayout={table.onRowsLayout}
                    className="flex-1 web:[scrollbar-gutter:stable]"
                    stickyHeaderIndices={[0]}
                    onScroll={rowWindow.onScroll}
                    scrollEventThrottle={16}
                >
                    <TableHeader />
                    <View>
                        <View style={{ height: rowWindow.topSpace }} />
                        {visible}
                        <View style={{ height: rowWindow.bottomSpace }} />
                    </View>
                </ScrollView>
            </View>
        </ScrollView>
    )
}

function CustomerCards({ isVisible, rows, onOpen, menuFor }: BodyProps) {
    const fabClearanceStyle = useFabClearanceStyle()
    const viewHeight = useWindowHeight()
    // Reactive, so a change of the system text size while the list is open re-sizes the cards
    // (the window keeps its first row, so the view settles on the next scroll).
    const { fontScale } = useWindowDimensions()
    // Scrolling re-renders this list; the heights change only with the rows or the font scale.
    const heights = useMemo(
        () => rows.map(row => customerCardHeight(row.customer, fontScale)),
        [rows, fontScale]
    )
    const rowWindow = useRowWindow({ total: heights.length, heights, viewHeight })
    if (!isVisible) return null
    const visible = rows
        .slice(rowWindow.first, rowWindow.last)
        .map((row, offset) => (
            <CustomerCard
                key={row.customer.id}
                row={row}
                onOpen={onOpen}
                height={heights[rowWindow.first + offset]}
                menu={menuFor(row)}
            />
        ))
    return (
        <ScrollView
            testID="customers-cards"
            className="flex-1"
            contentContainerStyle={fabClearanceStyle}
            onScroll={rowWindow.onScroll}
            scrollEventThrottle={16}
        >
            <View style={{ height: rowWindow.topSpace }} />
            {visible}
            <View style={{ height: rowWindow.bottomSpace }} />
        </ScrollView>
    )
}

type ViewState = CustomerListViewState

function emptyKindFor(viewState: ViewState) {
    if (viewState === 'empty') return 'none'
    if (viewState === 'no-match') return 'no-match'
    if (viewState === 'all-inactive') return 'all-inactive'
    return null
}

// The toolbar shows once at least one customer exists, so it stays while a search or the
// inactive filter hides every row.
const TOOLBAR_STATES: ReadonlySet<ViewState> = new Set(['ready', 'no-match', 'all-inactive'])

type Navigation = ReturnType<typeof useCustomerNavigation>

/**
 * The row menus and the Delete customer dialog they open. The one `useCustomerActions`
 * lives here, so the list's banner and the dialog read the same refusals. The dialog
 * shows the customer as it was when Delete was chosen: the delete removes the row from
 * the list at once, and a refusal must still show in the dialog.
 */
function useCustomerRowMenus(openId: string, canWrite: boolean, navigation: Navigation) {
    const actions = useCustomerActions()
    const isShowingCustomer = useIsShowingCustomer()
    const [deleteTarget, setDeleteTarget] = useState<CustomerRecord | null>(null)
    const dirtyCustomerId = useCustomerFormStore(s => s.dirtyRecordId)
    const targetId = deleteTarget?.id ?? ''
    const isTargetOpen = targetId !== '' && targetId === openId

    // Opening a customer's dialog drops that customer's refusal: the dialog shows the
    // customer's current state. Closing drops it too: the user has seen it in the dialog,
    // and it would otherwise come back in the banner. A refusal about another customer
    // stays in the banner.
    const openDeleteDialog = (customer: CustomerRecord) => {
        actions.clearActionError(customer.id)
        setDeleteTarget(customer)
    }

    const select = (customer: CustomerRecord, item: CustomerMenuItem) => {
        if (item === 'edit') navigation.open(customer.id)
        else if (item === 'add-sub') navigation.openNew(customer.id)
        else if (item === 'make-inactive') void actions.setInactive(customer.id, true)
        else if (item === 'make-active') void actions.setInactive(customer.id, false)
        else openDeleteDialog(customer)
    }

    const menuFor = (row: Row) => {
        const { customer } = row
        const items = customerMenuItems(
            { isTopLevel: customer.parent === '', inactive: customer.inactive },
            canWrite
        )
        if (items.length === 0) return null
        return (
            <CustomerRowMenu
                row={row}
                items={items}
                onSelect={item => select(customer, item)}
                isWriting={actions.isWorking}
            />
        )
    }

    // The delete's answer may arrive after the user moved on (another customer, the Lists
    // hub, another package): it leaves to the list only while they still see that
    // customer, so it never pulls them back.
    const leaveDeleted = (id: string) => {
        if (!isShowingCustomer(id)) return false
        navigation.leave()
        return true
    }

    return {
        actions,
        menuFor,
        deleteDialog: {
            customer: deleteTarget,
            actions,
            isOpenAndDirty: isTargetOpen && dirtyCustomerId === targetId,
            onClose: () => {
                actions.clearActionError(targetId)
                setDeleteTarget(null)
            },
            onDeleted: () => leaveDeleted(targetId),
        },
    }
}

// The load error, with Retry, comes before an action's refusal. A refusal about the
// customer whose Delete customer dialog is open shows in the dialog, not twice.
function bannerFor(isLoadError: boolean, menus: ReturnType<typeof useCustomerRowMenus>) {
    if (isLoadError) return { message: LOAD_ERROR, isLoadError }
    const refusal = menus.actions.actionError
    const dialogId = menus.deleteDialog.customer?.id
    const message = refusal && refusal.id !== dialogId ? refusal.message : null
    return { message, isLoadError }
}

// The Customers list. The open customer (`openId`, from the URL) is marked on the
// panel surface, where the list stays in view beside it.
export function CustomersList({ openId }: { openId: string }) {
    const orgHref = useOrgHref()
    const navigation = useCustomerNavigation()
    const surface = useDetailSurface()
    const selectedId = surface === 'panel' ? openId : ''
    const { canWrite } = useBooksAccess()
    const menus = useCustomerRowMenus(openId, canWrite, navigation)
    const isWide = useBreakpoint() !== 'mobile'
    const source = useCustomersQuery()
    const list = useCustomersList(source)
    const { viewState, rows } = list
    const isReady = viewState === 'ready'
    const showToolbar = TOOLBAR_STATES.has(viewState)
    const banner = bannerFor(viewState === 'error', menus)
    const onRetry = banner.isLoadError ? source.retry : undefined
    const onDismissBanner = banner.isLoadError ? undefined : () => menus.actions.clearActionError()
    const isLoading = viewState === 'loading'
    const emptyKind = emptyKindFor(viewState)
    const showTable = isReady && isWide
    const showCards = isReady && !isWide
    const openNew = () => navigation.openNew()
    const showInactive = () => list.setShowInactive(true)
    // Pops back to the Lists hub this list was opened from; `navigate` would stack a second hub.
    const backToLists = () => router.dismissTo(orgHref('books/lists'))

    return (
        <View testID="customers-list" className="min-w-0 flex-1 bg-background">
            <ListHeader canWrite={canWrite} onBack={backToLists} onNew={openNew} />
            <ListToolbar isVisible={showToolbar} list={list} isWide={isWide} />
            <CustomersBanner
                message={banner.message}
                onRetry={onRetry}
                onDismiss={onDismissBanner}
            />
            <LoadingBody isVisible={isLoading} />
            <CustomersEmptyState
                kind={emptyKind}
                canWrite={canWrite}
                onNew={openNew}
                onClearSearch={list.clearSearch}
                onShowInactive={showInactive}
            />
            <CustomersTable
                isVisible={showTable}
                rows={rows}
                selectedId={selectedId}
                onOpen={navigation.open}
                menuFor={menus.menuFor}
            />
            <CustomerCards
                isVisible={showCards}
                rows={rows}
                onOpen={navigation.open}
                menuFor={menus.menuFor}
            />
            <DeleteCustomerDialog {...menus.deleteDialog} />
        </View>
    )
}

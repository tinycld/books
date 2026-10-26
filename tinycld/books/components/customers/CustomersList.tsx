import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint, useWindowHeight } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { useMemo } from 'react'
import {
    Pressable,
    ScrollView,
    Text,
    useWindowDimensions,
    View,
    type ViewStyle,
} from 'react-native'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useCustomerNavigation } from '../../hooks/useCustomerNavigation'
import { useCustomersList } from '../../hooks/useCustomersList'
import { type CustomerRecord, useCustomersQuery } from '../../hooks/useCustomersQuery'
import { useDetailSurface } from '../../hooks/useDetailSurface'
import { useRowWindow } from '../../hooks/useRowWindow'
import {
    CUSTOMER_COLUMNS,
    CUSTOMER_ROW_HEIGHT,
    CUSTOMERS_TABLE_MIN_WIDTH,
    customerCardHeight,
} from '../../lib/customer-display'
import type { CustomerListRow, CustomerListViewState } from '../../lib/customer-tree'
import { useFabClearanceStyle } from '../../lib/fab-clearance'
import { CustomerCard } from './CustomerCard'
import { CUSTOMER_ROW_CLASS, CustomerRow } from './CustomerRow'
import { CustomersBanner } from './CustomersBanner'
import { CustomersEmptyState } from './CustomersEmptyState'
import { CustomerToolbar } from './CustomerToolbar'

type Rows = CustomerListRow<CustomerRecord>[]

interface BodyProps {
    isVisible: boolean
    rows: Rows
    onOpen: (id: string) => void
}

// Only the table can sit beside the panel (cards show below 768 px, the panel at 1360 px).
interface TableProps extends BodyProps {
    // The row drawn as selected: the open customer on the panel surface, else none.
    selectedId: string
}

const LOAD_ERROR = 'Could not load customers'
const TABLE_CONTENT_STYLE = { width: '100%', minWidth: CUSTOMERS_TABLE_MIN_WIDTH } as const

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

function CustomersTable({ isVisible, rows, selectedId, onOpen }: TableProps) {
    const viewHeight = useWindowHeight()
    const rowWindow = useRowWindow({
        total: rows.length,
        rowHeight: CUSTOMER_ROW_HEIGHT,
        viewHeight,
    })
    if (!isVisible) return null
    const visible = rows
        .slice(rowWindow.first, rowWindow.last)
        .map(row => (
            <CustomerRow
                key={row.customer.id}
                row={row}
                onOpen={onOpen}
                isSelected={row.customer.id === selectedId}
            />
        ))
    return (
        <ScrollView
            horizontal
            testID="customers-table"
            className="flex-1"
            contentContainerStyle={TABLE_CONTENT_STYLE}
        >
            <View className="flex-1">
                <ScrollView
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

function CustomerCards({ isVisible, rows, onOpen }: BodyProps) {
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

// The Customers list. The open customer (`openId`, from the URL) is marked on the
// panel surface, where the list stays in view beside it.
export function CustomersList({ openId }: { openId: string }) {
    const orgHref = useOrgHref()
    const navigation = useCustomerNavigation()
    const surface = useDetailSurface()
    const selectedId = surface === 'panel' ? openId : ''
    const { canWrite } = useBooksAccess()
    const isWide = useBreakpoint() !== 'mobile'
    const source = useCustomersQuery()
    const list = useCustomersList(source)
    const { viewState, rows } = list
    const isReady = viewState === 'ready'
    const showToolbar = TOOLBAR_STATES.has(viewState)
    const bannerMessage = viewState === 'error' ? LOAD_ERROR : null
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
            <CustomersBanner message={bannerMessage} onRetry={source.retry} />
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
            />
            <CustomerCards isVisible={showCards} rows={rows} onOpen={navigation.open} />
        </View>
    )
}

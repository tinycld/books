import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint, useWindowHeight } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { type ReactNode, useMemo } from 'react'
import {
    Pressable,
    ScrollView,
    Text,
    useWindowDimensions,
    View,
    type ViewStyle,
} from 'react-native'
import { useDetailSurface } from '../../hooks/useDetailSurface'
import type { useRecordList } from '../../hooks/useRecordList'
import { useRowWindow } from '../../hooks/useRowWindow'
import { useTableMinWidth } from '../../hooks/useTableMinWidth'
import { useFabClearanceStyle } from '../../lib/fab-clearance'
import {
    emptyKindFor,
    listWriteControls,
    PARTY_COLUMNS,
    PARTY_ROW_CLASS,
    PARTY_ROW_HEIGHT,
    PARTY_TABLE_MIN_WIDTH,
    type PartyListCopy,
    type PartyListRow,
    type PartyRecord,
    partyCardHeight,
    showsToolbar,
} from '../../lib/party-list'
import { ListBanner } from '../ListBanner'
import { ListEmptyState } from '../ListEmptyState'
import { ListToolbar } from '../ListToolbar'
import { PartyCard } from './PartyCard'
import { PartyRow } from './PartyRow'

export type { PartyListCopy }

export type PartyListProps<T extends PartyRecord> = {
    listPrefix: string
    recordPrefix: string
    copy: PartyListCopy
    list: ReturnType<typeof useRecordList<T, PartyListRow<T>>>
    canWrite: boolean
    // The record the URL opens, or '' when none.
    openId: string
    indentPx: number
    onOpen(id: string): void
    onNew(): void
    onRetry(): void
    // The row menu for one record, or null for a reader.
    menuFor(record: T): ReactNode
    bannerMessage: string | null
    isLoadError: boolean
    onDismissBanner(): void
    dialog: ReactNode
}

interface BodyProps<T extends PartyRecord> {
    isVisible: boolean
    recordPrefix: string
    listPrefix: string
    indentPx: number
    rows: PartyListRow<T>[]
    onOpen: (id: string) => void
    menuFor: (record: T) => ReactNode
}

// Only the table can sit beside the panel (cards show below 768 px, the panel at 1360 px).
interface TableProps<T extends PartyRecord> extends BodyProps<T> {
    // The row drawn as selected: the open record on the panel surface, else none.
    selectedId: string
}

function BackLink({ testID, onPress }: { testID: string; onPress: () => void }) {
    const color = useThemeColor('muted-foreground')
    return (
        <Pressable
            testID={testID}
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

function NewButton({
    isVisible,
    testID,
    label,
    onPress,
}: {
    isVisible: boolean
    testID: string
    label: string
    onPress: () => void
}) {
    if (!isVisible) return null
    return (
        <Button testID={testID} size="sm" style={{ minHeight: 36 }} onPress={onPress}>
            <ButtonText>{label}</ButtonText>
        </Button>
    )
}

interface HeaderProps {
    listPrefix: string
    recordPrefix: string
    copy: PartyListCopy
    canWrite: boolean
    onBack: () => void
    onNew: () => void
}

function ListHeader({ listPrefix, recordPrefix, copy, canWrite, onBack, onNew }: HeaderProps) {
    const { showNewButton } = listWriteControls(canWrite)
    const newLabel = `New ${copy.singular}`
    return (
        <View className="gap-2 px-4 pb-3 pt-4">
            <BackLink testID={`${listPrefix}-back`} onPress={onBack} />
            <View className="flex-row items-center justify-between gap-3">
                <Text
                    testID={`${listPrefix}-title`}
                    className="text-2xl font-semibold text-foreground"
                >
                    {copy.title}
                </Text>
                <NewButton
                    isVisible={showNewButton}
                    testID={`${recordPrefix}-new-header`}
                    label={newLabel}
                    onPress={onNew}
                />
            </View>
        </View>
    )
}

function LoadingBody({ isVisible, testID }: { isVisible: boolean; testID: string }) {
    if (!isVisible) return null
    return (
        <View testID={testID} className="flex-1">
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
            className={`${PARTY_ROW_CLASS} border-b border-border bg-background`}
            style={{ minHeight: 44 }}
        >
            <HeaderCell label="Name" style={PARTY_COLUMNS.name} />
            <HeaderCell label="Email" style={PARTY_COLUMNS.email} />
            <HeaderCell label="Phone" style={PARTY_COLUMNS.phone} />
            <View style={PARTY_COLUMNS.menu} />
        </View>
    )
}

function PartyTable<T extends PartyRecord>({
    isVisible,
    recordPrefix,
    listPrefix,
    indentPx,
    rows,
    selectedId,
    onOpen,
    menuFor,
}: TableProps<T>) {
    const viewHeight = useWindowHeight()
    const rowWindow = useRowWindow({
        total: rows.length,
        rowHeight: PARTY_ROW_HEIGHT,
        viewHeight,
    })
    const table = useTableMinWidth(PARTY_TABLE_MIN_WIDTH)
    if (!isVisible) return null
    const visible = rows
        .slice(rowWindow.first, rowWindow.last)
        .map(row => (
            <PartyRow
                key={row.party.id}
                row={row}
                testIdPrefix={recordPrefix}
                indentPx={indentPx}
                onOpen={onOpen}
                isSelected={row.party.id === selectedId}
                menu={menuFor(row.party)}
            />
        ))
    return (
        <ScrollView
            horizontal
            testID={`${listPrefix}-table`}
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

function PartyCards<T extends PartyRecord>({
    isVisible,
    recordPrefix,
    listPrefix,
    indentPx,
    rows,
    onOpen,
    menuFor,
}: BodyProps<T>) {
    const fabClearanceStyle = useFabClearanceStyle()
    const viewHeight = useWindowHeight()
    // Reactive, so a change of the system text size while the list is open re-sizes the cards
    // (the window keeps its first row, so the view settles on the next scroll).
    const { fontScale } = useWindowDimensions()
    // Scrolling re-renders this list; the heights change only with the rows or the font scale.
    const heights = useMemo(
        () => rows.map(row => partyCardHeight(row.party, fontScale)),
        [rows, fontScale]
    )
    const rowWindow = useRowWindow({ total: heights.length, heights, viewHeight })
    if (!isVisible) return null
    const visible = rows
        .slice(rowWindow.first, rowWindow.last)
        .map((row, offset) => (
            <PartyCard
                key={row.party.id}
                row={row}
                testIdPrefix={recordPrefix}
                indentPx={indentPx}
                onOpen={onOpen}
                height={heights[rowWindow.first + offset]}
                menu={menuFor(row.party)}
            />
        ))
    return (
        <ScrollView
            testID={`${listPrefix}-cards`}
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

// A list of people or companies. The open record (`openId`, from the URL) is marked on
// the panel surface, where the list stays in view beside it.
export function PartyList<T extends PartyRecord>(props: PartyListProps<T>) {
    const { listPrefix, recordPrefix, copy, list, canWrite, openId, indentPx } = props
    const orgHref = useOrgHref()
    const selectedId = useDetailSurface() === 'panel' ? openId : ''
    const isWide = useBreakpoint() !== 'mobile'
    const { viewState, rows } = list
    const isReady = viewState === 'ready'
    const onRetry = props.isLoadError ? props.onRetry : undefined
    const onDismissBanner = props.isLoadError ? undefined : props.onDismissBanner
    const isLoading = viewState === 'loading'
    const showToolbar = showsToolbar(viewState)
    const emptyKind = emptyKindFor(viewState)
    const showTable = isReady && isWide
    const showCards = isReady && !isWide
    const showInactive = () => list.setShowInactive(true)
    // Pops back to the Lists hub this list was opened from; `navigate` would stack a second hub.
    const backToLists = () => router.dismissTo(orgHref('books/lists'))

    return (
        <View testID={`${listPrefix}-list`} className="min-w-0 flex-1 bg-background">
            <ListHeader
                listPrefix={listPrefix}
                recordPrefix={recordPrefix}
                copy={copy}
                canWrite={canWrite}
                onBack={backToLists}
                onNew={props.onNew}
            />
            <ListToolbar
                isVisible={showToolbar}
                testIdPrefix={listPrefix}
                placeholder={copy.searchPlaceholder}
                list={list}
                isWide={isWide}
            />
            <ListBanner
                testIdPrefix={listPrefix}
                message={props.bannerMessage}
                onRetry={onRetry}
                onDismiss={onDismissBanner}
            />
            <LoadingBody isVisible={isLoading} testID={`${listPrefix}-loading`} />
            <ListEmptyState
                kind={emptyKind}
                testIdPrefix={listPrefix}
                copy={copy}
                canWrite={canWrite}
                onNew={props.onNew}
                onClearSearch={list.clearSearch}
                onShowInactive={showInactive}
            />
            <PartyTable
                isVisible={showTable}
                recordPrefix={recordPrefix}
                listPrefix={listPrefix}
                indentPx={indentPx}
                rows={rows}
                selectedId={selectedId}
                onOpen={props.onOpen}
                menuFor={props.menuFor}
            />
            <PartyCards
                isVisible={showCards}
                recordPrefix={recordPrefix}
                listPrefix={listPrefix}
                indentPx={indentPx}
                rows={rows}
                onOpen={props.onOpen}
                menuFor={props.menuFor}
            />
            {props.dialog}
        </View>
    )
}

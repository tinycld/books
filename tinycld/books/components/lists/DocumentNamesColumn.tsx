import type { RefObject } from 'react'
import { Pressable, Text, type TextInputInstance, View } from 'react-native'
import type { DocumentListScreenState } from '../../hooks/useDocumentListScreen'
import type { DocumentListRow, DocumentListTab } from '../../lib/document-list'
import { LIST_NAME_ROW_HEIGHT, nameRowLines } from '../../lib/document-list-cells'
import { areaOf, type ListArea } from '../../lib/list-areas'
import { ListBanner } from '../ListBanner'
import { ListTable } from '../ListTable'
import { SearchField } from '../ListToolbar'
import { StatusBadge } from '../StatusBadge'
import { DocumentListHeader } from './DocumentListHeader'
import { DocumentListStates } from './DocumentListStates'
import { FocusBar, ROW_ON_FOCUS, ROW_TAB_INDEX } from './DocumentListTable'

const NAME_ROW_STYLE = { height: LIST_NAME_ROW_HEIGHT }

function keyOfRow(row: DocumentListRow): string {
    return row.id
}

interface NameRowProps {
    row: DocumentListRow
    testIdPrefix: string
    currency: string
    isOpen: boolean
    isFocused: boolean
    onOpen(row: DocumentListRow): void
}

// The open document's row draws `bg-accent`; the list keys' focused row the light
// `bg-muted/10` tint and the `FocusBar`, as in the table and the cards.
function nameRowBackground(isOpen: boolean, isFocused: boolean): string {
    if (isOpen) return 'bg-accent'
    if (isFocused) return 'bg-muted/10'
    return 'bg-background'
}

// Number and party, then the amount with the status badge. The open document's row and
// the list keys' focused row are marked `aria-current`.
function NameRow({ row, testIdPrefix, currency, isOpen, isFocused, onOpen }: NameRowProps) {
    const { title, amount } = nameRowLines(row, currency)
    const bg = nameRowBackground(isOpen, isFocused)
    const current = isOpen || isFocused ? 'true' : undefined
    const press = () => onOpen(row)
    return (
        <Pressable
            testID={`${testIdPrefix}-name-row-${row.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isOpen }}
            aria-current={current}
            tabIndex={ROW_TAB_INDEX}
            onFocus={ROW_ON_FOCUS}
            onPress={press}
            className={`justify-center gap-1 border-b border-border px-4 ${bg}`}
            style={NAME_ROW_STYLE}
        >
            <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                {title}
            </Text>
            <View className="flex-row items-center justify-between gap-3">
                <Text numberOfLines={1} className="shrink text-xs text-muted-foreground">
                    {amount}
                </Text>
                <StatusBadge label={row.status.label} tone={row.status.tone} />
            </View>
            <FocusBar isVisible={isFocused} />
        </Pressable>
    )
}

interface NamesListProps {
    isVisible: boolean
    testIdPrefix: string
    rows: readonly DocumentListRow[]
    currency: string
    openId: string
    focusedId: string
    onOpen(row: DocumentListRow): void
    onNearEnd(): void
}

// The list keys' focused row stays in view; with none, the open document's row.
function scrollIndexOf(rows: readonly DocumentListRow[], focusedId: string, openId: string) {
    const target = focusedId === '' ? openId : focusedId
    const index = rows.findIndex(row => row.id === target)
    return index < 0 ? undefined : index
}

function NamesList({
    isVisible,
    testIdPrefix,
    rows,
    currency,
    openId,
    focusedId,
    onOpen,
    onNearEnd,
}: NamesListProps) {
    if (!isVisible) return null
    const scrollToIndex = scrollIndexOf(rows, focusedId, openId)
    const renderRow = (row: DocumentListRow) => (
        <NameRow
            row={row}
            testIdPrefix={testIdPrefix}
            currency={currency}
            isOpen={row.id === openId}
            isFocused={row.id === focusedId}
            onOpen={onOpen}
        />
    )
    return (
        <ListTable
            testID={`${testIdPrefix}-names-table`}
            minWidth={0}
            rowHeight={LIST_NAME_ROW_HEIGHT}
            header={null}
            rows={rows}
            keyOf={keyOfRow}
            renderRow={renderRow}
            onNearEnd={onNearEnd}
            scrollToIndex={scrollToIndex}
        />
    )
}

// The search row draws in every state, so the search that led to a refused query can
// still be changed or cleared. The `/` list key focuses the field through its ref, and
// Escape blurs it.
function SearchRow({
    screen,
    area,
    inputRef,
}: {
    screen: DocumentListScreenState
    area: ListArea
    inputRef: RefObject<TextInputInstance | null>
}) {
    const search = { query: screen.filters.search, setQuery: screen.setSearch }
    return (
        <View className="flex-row items-center gap-2 px-4 pb-3 pt-3">
            <SearchField
                testIdPrefix={area.testIdPrefix}
                placeholder={area.texts.searchPlaceholder}
                list={search}
                isWide={false}
                inputRef={inputRef}
            />
        </View>
    )
}

interface DocumentNamesColumnProps {
    tab: DocumentListTab
    openId: string
    screen: DocumentListScreenState
    searchRef: RefObject<TextInputInstance | null>
}

/**
 * The 320 px column of a kind's list beside its open document (layout `names`, spec §3
 * "Opening a document"): the title, New and the tabs, the search field, then two-line rows
 * with the open document's row marked. It lists the tab's rows with the tab's kept
 * filters and sort; the chips, menus, tick boxes and row menus do not draw here.
 */
export function DocumentNamesColumn({ tab, openId, screen, searchRef }: DocumentNamesColumnProps) {
    const { list } = screen
    const area = areaOf(tab)
    const prefix = area.testIdPrefix
    // No rows draw while the screen loads (the access read included).
    const hasRows = !list.isLoading && list.rows.length > 0
    const bannerMessage = list.isError ? area.texts.loadError : null
    return (
        <View testID={`${prefix}-names`} aria-busy={list.isBusy} className="flex-1 bg-background">
            <DocumentListHeader tab={tab} screen={screen} />
            <SearchRow screen={screen} area={area} inputRef={searchRef} />
            <ListBanner testIdPrefix={prefix} message={bannerMessage} onRetry={list.retry} />
            <DocumentListStates
                tab={tab}
                list={list}
                filters={screen.appliedFilters}
                showNew={false}
                onNew={screen.openNew}
                onClearFilters={screen.clearFilters}
            />
            <NamesList
                isVisible={hasRows}
                testIdPrefix={prefix}
                rows={list.rows}
                currency={list.currency}
                openId={openId}
                focusedId={screen.rowFocus.focusedId}
                onOpen={screen.openRow}
                onNearEnd={list.loadMore}
            />
        </View>
    )
}

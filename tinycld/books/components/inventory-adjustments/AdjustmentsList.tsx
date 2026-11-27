import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useState } from 'react'
import { View } from 'react-native'
import {
    type AdjustmentListRow,
    type AdjustmentListSort,
    useAdjustmentsQuery,
} from '../../hooks/useAdjustmentsQuery'
import { useFitsTable } from '../../hooks/useFitsTable'
import { useListFilters } from '../../hooks/useListFilters'
import { useRecordList } from '../../hooks/useRecordList'
import { useRecordNavigation } from '../../hooks/useRecordNavigation'
import {
    ADJUSTMENT_COLUMNS,
    ADJUSTMENT_ROW_MENU_WIDTH,
    ADJUSTMENT_TABLE_MIN_WIDTH,
    type AdjustmentChip,
    type AdjustmentColumn,
    type AdjustmentSort,
} from '../../lib/adjustment-list'
import { ADJUSTMENTS_PATH } from '../../lib/adjustment-route'
import type { PartyListCopy } from '../../lib/party-list'
import { ListCards } from '../ListCards'
import { ListHeaderCell, ListHeaderRow, ListSortHeaderCell, ListTable } from '../ListTable'
import { InventoryTabStrip } from '../products/InventoryTabStrip'
import { RecordListFrame } from '../RecordListFrame'
import { RecordRowMenu } from '../RecordRowMenu'
import { AdjustmentCard } from './AdjustmentCard'
import { AdjustmentRow } from './AdjustmentRow'
import { AdjustmentsToolbar } from './AdjustmentsToolbar'
import {
    ADJUSTMENT_CARD_HEIGHT,
    ADJUSTMENT_ROW_HEIGHT,
    adjustmentColumnStyle,
} from './adjustment-row-parts'

const LIST_PREFIX = 'inventory-adjustments'

// The list is a tab of Products and services, so its title is the page's.
const COPY: PartyListCopy = {
    title: 'Products and services',
    singular: 'inventory adjustment',
    plural: 'inventory adjustments',
    searchPlaceholder: 'Search inventory adjustments',
    emptyHint: 'Adjust the quantity or the value of your stock.',
}

const LOAD_ERROR = 'Could not load inventory adjustments'

const DEFAULT_SORT: AdjustmentListSort = { key: 'date', isAscending: false }

// The row menu of this checkpoint: Open. Edit, Copy, Void and Delete come with the form
// and the draft actions.
type AdjustmentMenuItem = 'open'
const MENU_ITEMS: readonly AdjustmentMenuItem[] = ['open']
const MENU_LABELS: Record<AdjustmentMenuItem, string> = { open: 'Open' }
const MENU_TEST_IDS: Record<AdjustmentMenuItem, string> = { open: 'inventory-adjustment-menu-open' }

const MENU_SLOT_STYLE = { width: ADJUSTMENT_ROW_MENU_WIDTH, flexShrink: 0 }

const adjustmentKey = (row: AdjustmentListRow) => row.id
const adjustmentCardHeight = () => ADJUSTMENT_CARD_HEIGHT

// A press of a sorted column turns its order; another column sorts newest or largest first.
function nextSort(current: AdjustmentListSort, key: AdjustmentSort): AdjustmentListSort {
    if (current.key === key) return { key, isAscending: !current.isAscending }
    return { key, isAscending: false }
}

function sortedOf(sort: AdjustmentListSort, key: AdjustmentSort) {
    if (sort.key !== key) return 'none'
    return sort.isAscending ? 'ascending' : 'descending'
}

interface HeaderProps {
    sort: AdjustmentListSort
    onSort(key: AdjustmentSort): void
}

function HeaderCell({ column, sort, onSort }: HeaderProps & { column: AdjustmentColumn }) {
    const style = adjustmentColumnStyle(column.key, column.minWidth)
    const sortKey = column.sort
    if (sortKey === undefined) {
        return <ListHeaderCell label={column.label} style={style} align={column.align} />
    }
    const press = () => onSort(sortKey)
    return (
        <ListSortHeaderCell
            label={column.label}
            style={style}
            align={column.align}
            testID={`${LIST_PREFIX}-sort-${sortKey}`}
            sorted={sortedOf(sort, sortKey)}
            onPress={press}
        />
    )
}

function AdjustmentsHeader({ sort, onSort }: HeaderProps) {
    const cells = ADJUSTMENT_COLUMNS.map(column => (
        <HeaderCell key={column.key} column={column} sort={sort} onSort={onSort} />
    ))
    return (
        <ListHeaderRow testID={`${LIST_PREFIX}-header`} rowClass="flex-row items-center pl-4 pr-1">
            {cells}
            <View style={MENU_SLOT_STYLE} />
        </ListHeaderRow>
    )
}

/**
 * The inventory adjustments list (inventory-adjust spec §3.5), the second tab of Products
 * and services: the search, the status chips and Made by Books in the query
 * (useAdjustmentsQuery), the table with its sortable Date, No. and Value change headers
 * where it fits (754 px of its own width) and cards below it. The open adjustment
 * (`openId`, from the URL) is marked on the panel surface.
 */
export function AdjustmentsList({ openId }: { openId: string }) {
    const navigation = useRecordNavigation(ADJUSTMENTS_PATH)
    const isPhone = useBreakpoint() === 'mobile'
    const filters = useListFilters()
    // Local to the list, which its layout keeps mounted while adjustments open and close.
    const [chip, setChip] = useState<AdjustmentChip>('all')
    const [madeByBooks, setMadeByBooks] = useState(false)
    const [sort, setSort] = useState<AdjustmentListSort>(DEFAULT_SORT)
    const source = useAdjustmentsQuery({
        search: filters.listFilters.search,
        chip,
        madeByBooks,
        sort,
    })
    // The chips and the sort are part of the query, so a change of one keeps the last rows
    // until the new query settles (keepLastSettled). Show inactive is not a filter of this
    // list: on, so an empty result under a chip is "no match", never "all inactive".
    const listFilters = {
        search: filters.listFilters.search,
        showInactive: true,
        view: `${chip}|${madeByBooks}|${sort.key}|${sort.isAscending}`,
    }
    const list = useRecordList({ ...filters, listFilters }, source)
    const fits = useFitsTable(ADJUSTMENT_TABLE_MIN_WIDTH)
    const loadError = list.viewState === 'error' ? LOAD_ERROR : null
    const onSort = (key: AdjustmentSort) => setSort(current => nextSort(current, key))
    const toggleMadeByBooks = () => setMadeByBooks(on => !on)
    const menuFor = (row: AdjustmentListRow) => (
        <RecordRowMenu<AdjustmentMenuItem>
            title={row.number || 'Inventory adjustment'}
            triggerTestId={`inventory-adjustment-menu-${row.id}`}
            triggerLabel="Inventory adjustment actions"
            items={MENU_ITEMS}
            labels={MENU_LABELS}
            testIds={MENU_TEST_IDS}
            onSelect={() => navigation.open(row.id)}
            isWriting={false}
        />
    )
    const cards = (
        <ListCards<AdjustmentListRow>
            testID={`${LIST_PREFIX}-cards`}
            rows={list.rows}
            heightOf={adjustmentCardHeight}
            keyOf={adjustmentKey}
            onNearEnd={list.onNearEnd}
            renderCard={(row, height) => (
                <AdjustmentCard
                    adjustment={row}
                    height={height}
                    onOpen={navigation.open}
                    menu={menuFor(row)}
                />
            )}
        />
    )
    const tableOf = (selectedId: string) => (
        <ListTable<AdjustmentListRow>
            testID={`${LIST_PREFIX}-table`}
            minWidth={ADJUSTMENT_TABLE_MIN_WIDTH}
            rowHeight={ADJUSTMENT_ROW_HEIGHT}
            header={<AdjustmentsHeader sort={sort} onSort={onSort} />}
            rows={list.rows}
            keyOf={adjustmentKey}
            onNearEnd={list.onNearEnd}
            onGutter={fits.onGutter}
            renderRow={row => (
                <AdjustmentRow
                    adjustment={row}
                    isSelected={row.id === selectedId}
                    onOpen={navigation.open}
                    menu={menuFor(row)}
                />
            )}
        />
    )
    // The frame picks by breakpoint; the list's own width picks here, so a 1024 window
    // (700 px of list) shows cards too.
    const renderTable = (selectedId: string) => (
        <View testID={LIST_PREFIX} className="flex-1" onLayout={fits.onLayout}>
            {fits.showCards ? cards : tableOf(selectedId)}
        </View>
    )
    const renderCards = () => (
        <View testID={LIST_PREFIX} className="flex-1">
            {cards}
        </View>
    )
    const toolbar = (
        <AdjustmentsToolbar
            search={filters}
            placeholder={COPY.searchPlaceholder}
            chip={chip}
            onChip={setChip}
            madeByBooks={madeByBooks}
            onToggleMadeByBooks={toggleMadeByBooks}
            isPhone={isPhone}
        />
    )
    const ignoreNew = () => {}
    return (
        <RecordListFrame
            listPrefix={LIST_PREFIX}
            recordPrefix="inventory-adjustment"
            copy={COPY}
            list={list}
            canWrite={false}
            openId={openId}
            onNew={ignoreNew}
            onRetry={source.retry}
            bannerMessage={loadError}
            isLoadError={loadError !== null}
            onDismissBanner={ignoreNew}
            renderTable={renderTable}
            renderCards={renderCards}
            dialog={null}
            tabs={<InventoryTabStrip selected="adjustments" />}
            toolbar={toolbar}
            keepsToolbarWhenEmpty={source.hasBooksMade}
        />
    )
}

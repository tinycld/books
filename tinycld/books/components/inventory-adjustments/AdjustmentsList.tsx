import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useState } from 'react'
import { View } from 'react-native'
import { useAdjustmentDelete, useAdjustmentVoid } from '../../hooks/useAdjustmentReadActions'
import {
    type AdjustmentListRow,
    type AdjustmentListSort,
    useAdjustmentsQuery,
} from '../../hooks/useAdjustmentsQuery'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useFitsTable } from '../../hooks/useFitsTable'
import { useListFilters } from '../../hooks/useListFilters'
import { useRecordList } from '../../hooks/useRecordList'
import { useRecordNavigation } from '../../hooks/useRecordNavigation'
import {
    type AdjustmentRowMenuAction,
    adjustmentRowActionWrites,
    adjustmentRowMenuItems,
} from '../../lib/adjustment-actions'
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
import { AdjustmentDeleteDialog, AdjustmentVoidDialog } from './AdjustmentDialogs'
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

// The row menu (spec §3.5) as adjustmentRowMenuItems offers it: Open; for a writer on a
// manual adjustment Edit (a draft's form, or the correction of a posted one not replaced),
// Copy, and Void (posted) or Delete (draft).
const MENU_ACTIONS: readonly AdjustmentRowMenuAction[] = ['open', 'edit', 'copy', 'void', 'delete']
const MENU_LABELS: Record<AdjustmentRowMenuAction, string> = {
    open: 'Open',
    edit: 'Edit',
    copy: 'Copy',
    void: 'Void',
    delete: 'Delete',
}
const MENU_TEST_IDS: Record<AdjustmentRowMenuAction, string> = {
    open: 'inventory-adjustment-menu-open',
    edit: 'inventory-adjustment-menu-edit',
    copy: 'inventory-adjustment-menu-copy',
    void: 'inventory-adjustment-menu-void',
    delete: 'inventory-adjustment-menu-delete',
}
// Void and Delete write from the list: they wait while a write runs or writes are
// unavailable (adjustmentRowActionWrites).
const MENU_WRITES: ReadonlySet<string> = new Set(MENU_ACTIONS.filter(adjustmentRowActionWrites))
const MENU_DESTRUCTIVE: ReadonlySet<string> = new Set(['void', 'delete'])

function menuItemsOf(row: AdjustmentListRow, canWrite: boolean): AdjustmentRowMenuAction[] {
    return adjustmentRowMenuItems({
        status: row.status,
        kind: row.kind,
        replacedBy: row.replaced_by,
        canWrite,
    })
}

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
 * where it fits (754 px of its own width) and cards below it, each row with its menu
 * (Open, Edit, Copy, Void, Delete as offered; Void and Delete confirm in a dialog and wait
 * while writes are unavailable). The open adjustment (`openId`, from the URL) is marked on
 * the panel surface.
 */
export function AdjustmentsList({ openId }: { openId: string }) {
    const navigation = useRecordNavigation(ADJUSTMENTS_PATH)
    const { canWrite } = useBooksAccess()
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
    const writesAvailable = useWritesAvailable().available
    // The list's Void keeps a refusal in its dialog; Delete removes the row from the list.
    // A Delete of the draft open beside the list holds it in the save store, so its form
    // does not read the delete as someone else's, and then closes the panel to the list.
    const voiding = useAdjustmentVoid('dialog')
    const isOpen = (id: string) => id === openId
    const closeDeleted = (id: string) => {
        if (isOpen(id)) navigation.leave()
    }
    const deleting = useAdjustmentDelete({ holds: isOpen, onDeleted: closeDeleted })
    const isWriting = voiding.isPending || deleting.isPending || !writesAvailable
    const selectFor = (row: AdjustmentListRow) => (action: AdjustmentRowMenuAction) => {
        const target = { id: row.id, number: row.number }
        if (action === 'open') navigation.open(row.id)
        // A draft's Edit is its form; a posted one's is its correction.
        else if (action === 'edit' && row.status === 'draft') navigation.open(row.id)
        else if (action === 'edit') navigation.openNew({ replaces: row.id })
        else if (action === 'copy') navigation.openNew({ copy: row.id })
        else if (action === 'void') voiding.open(target)
        else deleting.open(target)
    }
    const menuFor = (row: AdjustmentListRow) => (
        <RecordRowMenu<AdjustmentRowMenuAction>
            title={row.number || 'Inventory adjustment'}
            triggerTestId={`inventory-adjustment-menu-${row.id}`}
            triggerLabel="Inventory adjustment actions"
            items={menuItemsOf(row, canWrite)}
            labels={MENU_LABELS}
            testIds={MENU_TEST_IDS}
            onSelect={selectFor(row)}
            isWriting={isWriting}
            writes={MENU_WRITES}
            destructive={MENU_DESTRUCTIVE}
        />
    )
    const dialogs = (
        <>
            <AdjustmentVoidDialog state={voiding.dialog} />
            <AdjustmentDeleteDialog state={deleting.dialog} />
        </>
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
    // The load error's banner stays while the read fails; Retry is its way out.
    const keepBanner = () => {}
    const openNew = () => navigation.openNew()
    return (
        <RecordListFrame
            listPrefix={LIST_PREFIX}
            recordPrefix="inventory-adjustment"
            copy={COPY}
            list={list}
            canWrite={canWrite}
            openId={openId}
            onNew={openNew}
            onRetry={source.retry}
            bannerMessage={loadError}
            isLoadError={loadError !== null}
            onDismissBanner={keepBanner}
            renderTable={renderTable}
            renderCards={renderCards}
            dialog={dialogs}
            tabs={<InventoryTabStrip selected="adjustments" />}
            toolbar={toolbar}
            keepsToolbarWhenEmpty={source.hasBooksMade}
        />
    )
}

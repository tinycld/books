import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router, useIsFocused } from 'expo-router'
import { View } from 'react-native'
import { useBinActions } from '../../hooks/useBinActions'
import { type EditedBin, useEditedBin } from '../../hooks/useBinDialog'
import { type BinListRow, useBinsQuery } from '../../hooks/useBinsQuery'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useFitsTable } from '../../hooks/useFitsTable'
import { useListFilters } from '../../hooks/useListFilters'
import { useRecordList } from '../../hooks/useRecordList'
import { useRecordRowMenus } from '../../hooks/useRecordRowMenus'
import { shippedReportHref, useShippedReportId } from '../../hooks/useShippedReportHref'
import {
    BIN_COLUMNS,
    BIN_ROW_MENU_LABELS,
    BIN_TABLE_MIN_WIDTH,
    type BinDialogTarget,
    type BinRowAction,
    binRowMenuItems,
    stockInBinParams,
} from '../../lib/bin-list'
import { BINS_PATH } from '../../lib/bin-route'
import { INVENTORY_TEXTS } from '../../lib/inventory-adjust-fixture'
import type { PartyListCopy } from '../../lib/party-list'
import { recordMenuTestIds } from '../../lib/record-menu'
import { type ReportParams, STOCK_BY_BIN_SHIPPED_KEY } from '../../lib/shipped-reports'
import { useBinDialogStore, useBinFormStore } from '../../stores/bin-dialog-store'
import { ListCards } from '../ListCards'
import { ListHeaderCell, ListHeaderRow, ListTable } from '../ListTable'
import { InventoryTabStrip } from '../products/InventoryTabStrip'
import { RecordListFrame } from '../RecordListFrame'
import { ShippedReportButton } from '../reports/ShippedReportButton'
import { BinCard, binCardHeight } from './BinCard'
import { BinDeleteDialog } from './BinDeleteDialog'
import { BinDialog } from './BinDialog'
import { BIN_ROW_HEIGHT, BinRow } from './BinRow'

const LIST_PREFIX = 'bins'

// The list is a tab of Products and services, so its title is the page's.
const COPY: PartyListCopy = {
    title: 'Products and services',
    singular: 'bin location',
    plural: 'bin locations',
    searchPlaceholder: 'Search bin locations',
    emptyHint: INVENTORY_TEXTS.binsEmpty,
}

const LOAD_ERROR = 'Could not load bin locations'
const GONE_NOTICE = 'The bin location was deleted, so its dialog closed.'

const BIN_MENU = {
    triggerPrefix: 'bin-menu',
    triggerLabel: 'Bin location actions',
    labels: BIN_ROW_MENU_LABELS,
    testIds: { ...recordMenuTestIds('bin'), stock: 'bin-menu-stock' },
}

// The toolbar's report link opens the report with no bin picked (default all).
const NO_PARAMS: ReportParams = {}

const binKey = (bin: BinListRow) => bin.id
const binName = (bin: BinListRow) => bin.name

// A bin has no route: Edit and a row press open the dialog, and nothing is left on delete.
function staysOnList() {}

function BinsHeader() {
    return (
        <ListHeaderRow testID={`${LIST_PREFIX}-header`}>
            <ListHeaderCell label="Name" style={BIN_COLUMNS.name} />
            <ListHeaderCell label="Note" style={BIN_COLUMNS.note} />
            <ListHeaderCell label="Status" style={BIN_COLUMNS.status} />
            <View style={BIN_COLUMNS.menu} />
        </ListHeaderRow>
    )
}

// The open bin's dialog, re-mounted for each bin so its form starts from that bin. A
// covered bin list stays mounted under the focused one, and a dialog is a portal sheet the
// cover does not hide, so only the focused list draws the store's dialog (as the row
// menus). The delete dialog needs no gate: its target is each list's own state.
// A gone bin draws no dialog: the list shows its notice instead.
function OpenBinDialog({ target, edited }: { target: BinDialogTarget | null; edited: EditedBin }) {
    const isFocused = useIsFocused()
    if (!target || !isFocused || edited.state === 'gone') return null
    const key = target.mode === 'edit' ? target.id : 'new'
    return <BinDialog key={key} target={target} edited={edited} />
}

/**
 * The bin list (inventory-adjust spec §3.7), the third tab of Products and services: the
 * name search and Show inactive in the query (useBinsQuery), ordered by name; the table
 * (Name · Note · Status) where it fits (484 px of its own width) and cards below it; each
 * row with its menu (binRowMenuItems: Edit, Stock in this bin, Make inactive or Make
 * active, Delete for a writer; Stock in this bin alone for a reader). The toolbar's Stock
 * by bin button and Stock in this bin open the Stock by Bin Location report (spec §3.9),
 * the second with the row's bin picked; both wait for the report's id and are not offered
 * while it is not known (useShippedReportId). New bin location, a writer's row press and
 * Edit open the bin dialog (useBinDialogStore); a reader's row opens nothing. The search
 * and Show inactive stay on the empty state, where every bin may be inactive
 * (keepsToolbarWhenEmpty). Delete confirms in its dialog, which shows the server's refusal.
 * The load error has Retry; a refusal of Make inactive or Make active, and the notice of a
 * bin deleted while its dialog was open, show in the banner.
 */
export function BinsList() {
    const { canWrite } = useBooksAccess()
    const orgHref = useOrgHref()
    const reportId = useShippedReportId(STOCK_BY_BIN_SHIPPED_KEY)
    const hasReport = reportId !== null
    const reportHref = reportId === null ? null : shippedReportHref(orgHref, reportId, NO_PARAMS)
    // Undefined, not a button that renders null, so the header draws no empty button group.
    const reportButton =
        reportHref === null ? undefined : (
            <ShippedReportButton
                href={reportHref}
                label="Stock by bin"
                testID="bins-stock-report"
            />
        )
    const openStockInBin = (bin: BinListRow) => {
        if (reportId === null) return
        router.push(shippedReportHref(orgHref, reportId, stockInBinParams(bin.id)))
    }
    const onExtra = (bin: BinListRow, item: BinRowAction) => {
        if (item === 'stock') openStockInBin(bin)
    }
    const itemsFor = (bin: BinListRow, writes: boolean) => binRowMenuItems(bin, writes, hasReport)
    const openNew = useBinDialogStore(s => s.openNew)
    const openEdit = useBinDialogStore(s => s.openEdit)
    const closeDialog = useBinDialogStore(s => s.close)
    const target = useBinDialogStore(s => s.target)
    const edited = useEditedBin(target)
    // A bin deleted elsewhere while its dialog was open: derived here, during render.
    const isGone = target !== null && edited.state === 'gone'
    const actions = useBinActions()
    const menus = useRecordRowMenus<BinListRow, BinRowAction>({
        actions,
        store: useBinFormStore,
        openId: '',
        listPath: BINS_PATH,
        navigation: { open: openEdit, leave: staysOnList },
        canWrite,
        itemsFor,
        onExtra,
        titleOf: binName,
        menu: BIN_MENU,
    })
    const filters = useListFilters()
    const source = useBinsQuery(filters.listFilters)
    const list = useRecordList(filters, source)
    const fits = useFitsTable(BIN_TABLE_MIN_WIDTH)
    const loadError = list.viewState === 'error' ? LOAD_ERROR : null
    const refusal = menus.bannerMessage(loadError)
    const goneNotice = isGone ? GONE_NOTICE : null
    const bannerMessage = refusal ?? goneNotice
    const dismissBanner = () => {
        menus.dismissRefusal()
        if (isGone) closeDialog()
    }
    const dialogs = (
        <>
            <OpenBinDialog target={target} edited={edited} />
            <BinDeleteDialog
                bin={menus.deleteDialog.record}
                actions={actions}
                refusal={menus.deleteDialog.refusal}
                onClose={menus.deleteDialog.onClose}
                onDeleted={menus.deleteDialog.onDeleted}
            />
        </>
    )
    // A reader's row and card open nothing: the row already shows the name and the note,
    // and the dialog writes.
    const openRow = canWrite ? openEdit : undefined
    const renderCard = (bin: BinListRow, height: number) => (
        <BinCard bin={bin} height={height} onOpen={openRow} menu={menus.menuFor(bin)} />
    )
    const renderRow = (bin: BinListRow) => (
        <BinRow bin={bin} onOpen={openRow} menu={menus.menuFor(bin)} />
    )
    const cards = (
        <ListCards<BinListRow>
            testID={`${LIST_PREFIX}-cards`}
            rows={list.rows}
            heightOf={binCardHeight}
            keyOf={binKey}
            onNearEnd={list.onNearEnd}
            renderCard={renderCard}
        />
    )
    const table = (
        <ListTable<BinListRow>
            testID={`${LIST_PREFIX}-table`}
            minWidth={BIN_TABLE_MIN_WIDTH}
            rowHeight={BIN_ROW_HEIGHT}
            header={<BinsHeader />}
            rows={list.rows}
            keyOf={binKey}
            onNearEnd={list.onNearEnd}
            onGutter={fits.onGutter}
            renderRow={renderRow}
        />
    )
    // The frame picks by breakpoint; the list's own width picks here.
    const wideBody = fits.showCards ? cards : table
    const renderTable = () => (
        <View testID={LIST_PREFIX} className="flex-1" onLayout={fits.onLayout}>
            {wideBody}
        </View>
    )
    const renderCards = () => (
        <View testID={LIST_PREFIX} className="flex-1">
            {cards}
        </View>
    )
    return (
        <RecordListFrame
            listPrefix={LIST_PREFIX}
            recordPrefix="bin"
            copy={COPY}
            list={list}
            canWrite={canWrite}
            openId=""
            onNew={openNew}
            onRetry={source.retry}
            bannerMessage={bannerMessage}
            isLoadError={loadError !== null}
            onDismissBanner={dismissBanner}
            renderTable={renderTable}
            renderCards={renderCards}
            dialog={dialogs}
            headerAction={reportButton}
            tabs={<InventoryTabStrip selected="bins" />}
            keepsToolbarWhenEmpty
        />
    )
}

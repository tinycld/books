import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { type ScopeOwner, useScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useId } from 'react'
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, View } from 'react-native'
import { useDetailSurface } from '../../hooks/useDetailSurface'
import { type ItemPageState, useItemPage } from '../../hooks/useItemPage'
import type { DetailSurface } from '../../lib/detail-surface'
import { type ItemTab, SHOWN_ITEM_TABS } from '../../lib/item-page-tabs'
import { PRODUCT_DISCARD_MESSAGE } from '../../lib/product-messages'
import type { BooksProducts } from '../../types'
import { type DocumentChrome, DocumentChromeContext } from '../documents/document-chrome'
import { ListBanner } from '../ListBanner'
import { PartyPageSaveBar } from '../party/page/PartyPageSaveBar'
import { columnsFor } from '../party/page/party-page-layout'
import { DiscardDialog, RecordFormBody } from '../RecordChild'
import { RecordLoadingBody, RecordSurface } from '../RecordSurface'
import { RecordTabs } from '../RecordTabs'
import { CostLayers } from './CostLayers'
import { ItemBinsTab } from './ItemBinsTab'
import { ItemHeader } from './ItemHeader'
import { MoveStockDialog } from './MoveStockDialog'
import { StockFigures } from './StockFigures'
import { StockMovementsList } from './StockMovementsList'

// The product route's test ids (`product-back`, `-title`, `-save`, `-cancel`, `-form`),
// so the product helpers and specs reach the Details form on the item page too.
const PREFIX = 'product'
const BACK_LABEL = 'Products and services'

// More (DocumentMoreMenu) reads the document chrome: its rows are `item-<id>`.
const ITEM_CHROME: DocumentChrome = {
    testId: 'item',
    shortcutGroup: 'Item',
    helpTopic: 'books:inventory',
    lifecycle: 'posting',
}

// The page always renders inside RecordSurface, which publishes its scope; this stands
// in only so the type holds, and registers nothing that fires.
const NO_SURFACE: ScopeOwner = () => null

// The next page of moves loads this close to the end of the page's scroll (Stock tab).
const NEAR_END_PX = 400

function isNearEnd({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent
    return layoutMeasurement.height + contentOffset.y >= contentSize.height - NEAR_END_PX
}

/**
 * The tab strip. ⌥1 ⌥2 ⌥3 belong to the surface's `modal` scope, the top scope on the
 * page, so they select a tab from anywhere on it, a text field included. The shortcut ids
 * are per instance, so a page that replaces another keeps its keys.
 */
function ItemTabs({ page, gutterClass }: { page: ItemPageState; gutterClass: string }) {
    const owner = useScopeOwner() ?? NO_SURFACE
    const instance = useId()
    return (
        <RecordTabs<ItemTab>
            tabs={SHOWN_ITEM_TABS}
            selected={page.tab}
            onSelect={page.setTab}
            testIdPrefix="item"
            keysScopeOwner={owner}
            keysScope="modal"
            shortcutIdPrefix={`books.item.tabs.${instance}`}
            shortcutGroup="Item"
            stripClassName={gutterClass}
        />
    )
}

interface TabProps {
    page: ItemPageState
    isPhone: boolean
    gutterClass: string
}

// Cost layers and the movements, in the page's one scroll.
function StockTab({ page, isPhone, gutterClass }: TabProps) {
    return (
        <View testID="item-stock-tab" className="gap-4 pb-6 pt-3">
            <CostLayers stock={page.stock} gutterClass={gutterClass} />
            <StockMovementsList
                moves={page.moves}
                chip={page.chip}
                onSelectChip={page.setChip}
                isPhone={isPhone}
                gutterClass={gutterClass}
            />
        </View>
    )
}

// The product form (useProductForm, held by useItemPage), in the page's one scroll.
function DetailsTab({
    page,
    surface,
    rowClassName,
}: {
    page: ItemPageState
    surface: DetailSurface
    rowClassName: string
}) {
    const { details } = page
    const definition = details.isReady ? details.definition : undefined
    if (!definition) return <RecordLoadingBody testIdPrefix={PREFIX} />
    return (
        <RecordFormBody
            state={details}
            definition={definition}
            surface={surface}
            testIdPrefix={PREFIX}
            rowClassName={rowClassName}
            scrolls={false}
        />
    )
}

function ItemTabBody({
    tab,
    surface,
    rowClassName,
    ...props
}: TabProps & {
    tab: ItemTab
    record: BooksProducts
    surface: DetailSurface
    rowClassName: string
}) {
    if (tab === 'details') {
        return <DetailsTab page={props.page} surface={surface} rowClassName={rowClassName} />
    }
    if (tab === 'bins') return <ItemBinsTab record={props.record} gutterClass={props.gutterClass} />
    return <StockTab {...props} />
}

/**
 * An Inventory item's page (inventory-adjust spec §3.6), at the record width: the header
 * and its actions, the four figures, the tabs Stock, Bins and Details and the tab's body
 * (the Bins tab is ItemBinsTab), the Move stock dialog, all in
 * the page's one scroll (on the Stock tab it loads more moves near its end), and the save
 * bar fixed at the bottom while Details has unsaved edits. The form, the chip and the
 * leave guard live in useItemPage, above the surface chrome and the tabs, so neither a
 * tab switch nor a window crossing the panel width loses an edit. RecordSurface owns the
 * page's one `modal` scope; the tabs, Adjust stock and the save bar register their keys
 * in it.
 */
export function ItemPage({ record }: { record: BooksProducts }) {
    const surface = useDetailSurface()
    const isPhone = useBreakpoint() === 'mobile'
    const { gutterClass, rowClassName } = columnsFor(isPhone)
    const page = useItemPage(record)
    const dismissBanner = () => page.actions.clearActionError()
    const save = () => void page.save()
    const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (page.tab === 'stock' && isNearEnd(event)) page.moves.loadMore()
    }
    // The last bin made inactive or deleted elsewhere withdraws Move stock, and its dialog.
    const isMoveOpen = page.moveStock.isOpen && page.moveStock.isOffered
    return (
        <DocumentChromeContext.Provider value={ITEM_CHROME}>
            <RecordSurface
                surface={surface}
                testIdPrefix={PREFIX}
                testID="item-page"
                backLabel={BACK_LABEL}
                title={record.name}
                onLeave={page.navigation.leave}
                isLeaveDisabled={page.isDirty}
                surfaceRef={page.details.surfaceRef}
                header="in-body"
                footer={null}
            >
                <ScrollView
                    testID="item-page-scroll"
                    className="flex-1"
                    contentContainerClassName="grow"
                    keyboardShouldPersistTaps="handled"
                    onScroll={onScroll}
                    scrollEventThrottle={100}
                >
                    <ItemHeader record={record} page={page} surface={surface} isPhone={isPhone} />
                    <View className={gutterClass}>
                        <ListBanner
                            testIdPrefix="item-action"
                            message={page.bannerMessage}
                            onDismiss={dismissBanner}
                            isFlush
                        />
                    </View>
                    <StockFigures
                        record={record}
                        stock={page.stock}
                        isPhone={isPhone}
                        gutterClass={gutterClass}
                    />
                    <ItemTabs page={page} gutterClass={gutterClass} />
                    <View className="flex-1">
                        <ItemTabBody
                            tab={page.tab}
                            record={record}
                            page={page}
                            isPhone={isPhone}
                            gutterClass={gutterClass}
                            surface={surface}
                            rowClassName={rowClassName}
                        />
                    </View>
                </ScrollView>
                <PartyPageSaveBar
                    isVisible={page.isDirty}
                    isSaving={page.isSaving}
                    onSave={save}
                    onCancel={page.cancel}
                    rootError={page.rootError}
                    gutterClass={gutterClass}
                    testIdPrefix={PREFIX}
                />
                <MoveStockDialog isOpen={isMoveOpen} item={record} onClose={page.moveStock.close} />
                <DiscardDialog guard={page.guard} message={PRODUCT_DISCARD_MESSAGE} />
                <DiscardDialog guard={page.cancelQuestion} message={PRODUCT_DISCARD_MESSAGE} />
            </RecordSurface>
        </DocumentChromeContext.Provider>
    )
}

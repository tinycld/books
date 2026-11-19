import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { type RefObject, useRef } from 'react'
import { type TextInputInstance, View } from 'react-native'
import {
    type DocumentListScreenState,
    useDocumentListScreen,
} from '../../hooks/useDocumentListScreen'
import { useListShortcuts } from '../../hooks/useListShortcuts'
import type { ListLayout } from '../../lib/detail-surface'
import { type DocumentListRow, type DocumentListTab, kindLabel } from '../../lib/document-list'
import { SALES_TABS } from '../../lib/sales-lists'
import { ListBanner } from '../ListBanner'
import { SelectBox } from '../SelectBox'
import { DocumentBatchActions } from './DocumentBatchActions'
import { DocumentListCards } from './DocumentListCards'
import { DocumentListDialogs } from './DocumentListDialogs'
import { DocumentListHeader } from './DocumentListHeader'
import { DocumentListStates, LIST_LOAD_ERROR } from './DocumentListStates'
import { DocumentListTable } from './DocumentListTable'
import { DocumentListToolbar } from './DocumentListToolbar'
import { DocumentNamesColumn } from './DocumentNamesColumn'
import { DocumentRowMenu } from './DocumentRowMenu'

interface ListBodyProps {
    tab: DocumentListTab
    screen: DocumentListScreenState
}

// The search field's ref, which the `/` list key focuses; Escape in the field blurs it.
interface SearchRefProp {
    searchRef: RefObject<TextInputInstance | null>
}

// A row's or card's lead and trail cells: the tick box (a writer, in the full list) and
// the "More actions" menu (in the full list); undefined where none draws.
function rowSlots(screen: DocumentListScreenState) {
    const { controls, selection, rowActions, canWrite } = screen
    const renderTick = (row: DocumentListRow) => {
        const toggle = () => selection.toggle(row.id)
        const label = `Select ${kindLabel(row.kind)} ${row.number}`.trim()
        const state = selection.isTicked(row.id) ? 'checked' : 'empty'
        return (
            <SelectBox
                testID={`sales-tick-${row.id}`}
                label={label}
                state={state}
                onPress={toggle}
            />
        )
    }
    const renderMenu = (row: DocumentListRow) => (
        <DocumentRowMenu row={row} canWrite={canWrite} actions={rowActions} />
    )
    return {
        renderLead: controls.showTicks ? renderTick : undefined,
        renderTrail: controls.showRowMenus ? renderMenu : undefined,
    }
}

// The table header's tick box, over every loaded row; none for a reader.
function TickAll({ screen }: { screen: DocumentListScreenState }) {
    const { selection } = screen
    const toggleAll = () => selection.toggleAll()
    return (
        <SelectBox
            testID="sales-tick-all"
            label="Select all"
            state={selection.headerState}
            onPress={toggleAll}
        />
    )
}

// The rows, once there are some: a table, or cards below the table's own minimum width.
// None draw while the screen loads, which includes the wait for the user's access, so a
// writer never sees the reader's list.
function ListBody({ tab, screen }: ListBodyProps) {
    const { list, selection, rowFocus } = screen
    const slots = rowSlots(screen)
    // The list keys' focused row stays in view.
    const scrollToIndex = rowFocus.focusedIndex < 0 ? undefined : rowFocus.focusedIndex
    if (list.isLoading || list.rows.length === 0) return null
    if (screen.drawsCards) {
        return (
            <DocumentListCards
                tab={tab}
                rows={list.rows}
                currency={list.currency}
                onOpen={screen.openRow}
                onNearEnd={list.loadMore}
                renderLead={slots.renderLead}
                renderTrail={slots.renderTrail}
                isTicked={selection.isTicked}
                focusedId={rowFocus.focusedId}
                scrollToIndex={scrollToIndex}
            />
        )
    }
    const headerLead = screen.controls.showTicks ? <TickAll screen={screen} /> : undefined
    return (
        <DocumentListTable
            tab={tab}
            rows={list.rows}
            currency={list.currency}
            canWrite={screen.canWrite}
            sort={screen.sort}
            onSort={screen.toggleSort}
            onOpen={screen.openRow}
            onNearEnd={list.loadMore}
            renderLead={slots.renderLead}
            renderTrail={slots.renderTrail}
            headerLead={headerLead}
            isTicked={selection.isTicked}
            focusedId={rowFocus.focusedId}
            scrollToIndex={scrollToIndex}
        />
    )
}

// The load error with Retry first; else a row action's refusal or a batch's result, which
// the user dismisses.
function Banner({ screen }: { screen: DocumentListScreenState }) {
    const { list } = screen
    if (list.isError) {
        return <ListBanner testIdPrefix="sales" message={LIST_LOAD_ERROR} onRetry={list.retry} />
    }
    return (
        <ListBanner
            testIdPrefix="sales"
            message={screen.actionBanner}
            onDismiss={screen.dismissBanner}
        />
    )
}

// The toolbar draws in every state, so the search or filter that led to a refused or an
// empty list can still be changed or cleared.
function FullList({ tab, screen, searchRef }: ListBodyProps & SearchRefProp) {
    const { list } = screen
    const isPhone = useBreakpoint() === 'mobile'
    const batch = (
        <DocumentBatchActions
            isVisible={screen.controls.showBatch}
            isCards={screen.drawsCards}
            selection={screen.selection}
            batch={screen.batch}
        />
    )
    return (
        <View
            testID="sales-list"
            aria-busy={list.isBusy}
            onLayout={screen.onListLayout}
            className="min-w-0 flex-1 bg-background"
        >
            <DocumentListHeader tab={tab} screen={screen} />
            <DocumentListToolbar
                screen={screen}
                tab={tab}
                isPhone={isPhone}
                batch={batch}
                inputRef={searchRef}
            />
            <Banner screen={screen} />
            <DocumentListStates
                tab={tab}
                list={list}
                filters={screen.appliedFilters}
                showNew={screen.controls.showNew}
                onNew={screen.openNew}
                onClearFilters={screen.clearFilters}
            />
            <ListBody tab={tab} screen={screen} />
        </View>
    )
}

type ListOfLayoutProps = ListBodyProps &
    SearchRefProp & {
        openId: string
        layout: ListLayout
    }

function ListOfLayout({ tab, openId, layout, screen, searchRef }: ListOfLayoutProps) {
    if (layout === 'names') {
        return (
            <DocumentNamesColumn tab={tab} openId={openId} screen={screen} searchRef={searchRef} />
        )
    }
    return <FullList tab={tab} screen={screen} searchRef={searchRef} />
}

interface DocumentListScreenProps {
    tab: DocumentListTab
    openId: string
    layout: ListLayout
    // A document is pushed over the list, which stays mounted under it (a kind tab below
    // 1360 px): the list keys are off then.
    isCovered: boolean
}

/**
 * One Sales tab's list (spec docs/specs/sales-lists-design.md §3): the full list with its
 * header, tabs, search, states, rows, row menus and Batch actions (layout `table`), or the
 * 320 px column of names beside an open document (layout `names`). Both read the tab's one
 * `useDocumentListScreen`, so the tab's kept filters and sort apply to each, and the list
 * keeps its rows when the window crosses the panel width. The confirm dialogs draw once,
 * at the root, so a write that runs while the list narrows keeps its dialog. The list keys
 * (`useListShortcuts`) are registered here, so both layouts share them.
 */
export function DocumentListScreen({ tab, openId, layout, isCovered }: DocumentListScreenProps) {
    const screen = useDocumentListScreen(tab, layout)
    const searchRef = useRef<TextInputInstance>(null)
    // The names column, beside an open document, has no tick boxes, so no tick keys.
    const isBeside = layout === 'names'
    const selection = isBeside ? null : screen.selection
    useListShortcuts({ screen, selection, tabs: SALES_TABS, isCovered, isBeside, searchRef })
    return (
        <>
            <ListOfLayout
                tab={tab}
                openId={openId}
                layout={layout}
                screen={screen}
                searchRef={searchRef}
            />
            <DocumentListDialogs rowActions={screen.rowActions} batch={screen.batch} />
        </>
    )
}

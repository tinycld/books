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
import { areaOf, type ListArea } from '../../lib/list-areas'
import { ListBanner } from '../ListBanner'
import { SelectBox } from '../SelectBox'
import { DocumentBatchActions } from './DocumentBatchActions'
import { DocumentListCards } from './DocumentListCards'
import { DocumentListDialogs } from './DocumentListDialogs'
import { DocumentListHeader } from './DocumentListHeader'
import { DocumentListStates } from './DocumentListStates'
import { DocumentListTable } from './DocumentListTable'
import { DocumentListToolbar } from './DocumentListToolbar'
import { DocumentNamesColumn } from './DocumentNamesColumn'
import { DocumentRowMenu } from './DocumentRowMenu'

interface ListBodyProps {
    tab: DocumentListTab
    area: ListArea
    screen: DocumentListScreenState
}

// The search field's ref, which the `/` list key focuses; Escape in the field blurs it.
interface SearchRefProp {
    searchRef: RefObject<TextInputInstance | null>
}

// A row's or card's lead and trail cells: the tick box (a writer, in the full list) and
// the "More actions" menu (in the full list); undefined where none draws.
function rowSlots(screen: DocumentListScreenState, area: ListArea) {
    const { controls, selection, rowActions, canWrite } = screen
    const renderTick = (row: DocumentListRow) => {
        const toggle = () => selection.toggle(row.id)
        const label = `Select ${kindLabel(row.kind)} ${row.number}`.trim()
        const state = selection.isTicked(row.id) ? 'checked' : 'empty'
        return (
            <SelectBox
                testID={`${area.testIdPrefix}-tick-${row.id}`}
                label={label}
                state={state}
                onPress={toggle}
            />
        )
    }
    const renderMenu = (row: DocumentListRow) => (
        <DocumentRowMenu
            row={row}
            testIdPrefix={area.testIdPrefix}
            canWrite={canWrite}
            actions={rowActions}
        />
    )
    return {
        renderLead: controls.showTicks ? renderTick : undefined,
        renderTrail: controls.showRowMenus ? renderMenu : undefined,
    }
}

// The table header's tick box, over every loaded row; none for a reader.
function TickAll({ screen, area }: { screen: DocumentListScreenState; area: ListArea }) {
    const { selection } = screen
    const toggleAll = () => selection.toggleAll()
    return (
        <SelectBox
            testID={`${area.testIdPrefix}-tick-all`}
            label="Select all"
            state={selection.headerState}
            onPress={toggleAll}
        />
    )
}

// The rows, once there are some: a table, or cards below the table's own minimum width.
// None draw while the screen loads, which includes the wait for the user's access, so a
// writer never sees the reader's list.
function ListBody({ tab, area, screen }: ListBodyProps) {
    const { list, selection, rowFocus } = screen
    const slots = rowSlots(screen, area)
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
    const headerLead = screen.controls.showTicks ? (
        <TickAll screen={screen} area={area} />
    ) : undefined
    return (
        <DocumentListTable
            tab={tab}
            rows={list.rows}
            currency={list.currency}
            categoryNames={list.categoryNames}
            minWidth={screen.tableMinWidth}
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
function Banner({ screen, area }: { screen: DocumentListScreenState; area: ListArea }) {
    const { list } = screen
    if (list.isError) {
        return (
            <ListBanner
                testIdPrefix={area.testIdPrefix}
                message={area.texts.loadError}
                onRetry={list.retry}
            />
        )
    }
    return (
        <ListBanner
            testIdPrefix={area.testIdPrefix}
            message={screen.actionBanner}
            onDismiss={screen.dismissBanner}
        />
    )
}

// The toolbar draws in every state, so the search or filter that led to a refused or an
// empty list can still be changed or cleared.
function FullList({ tab, area, screen, searchRef }: ListBodyProps & SearchRefProp) {
    const { list } = screen
    const isPhone = useBreakpoint() === 'mobile'
    const batch = (
        <DocumentBatchActions
            isVisible={screen.controls.showBatch}
            isCards={screen.drawsCards}
            testIdPrefix={area.testIdPrefix}
            selection={screen.selection}
            batch={screen.batch}
        />
    )
    return (
        <View
            testID={`${area.testIdPrefix}-list`}
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
            <Banner screen={screen} area={area} />
            <DocumentListStates
                tab={tab}
                list={list}
                filters={screen.appliedFilters}
                showNew={screen.controls.showNew}
                onNew={screen.openNew}
                onClearFilters={screen.clearFilters}
            />
            <ListBody tab={tab} area={area} screen={screen} />
        </View>
    )
}

type ListOfLayoutProps = ListBodyProps &
    SearchRefProp & {
        openId: string
        layout: ListLayout
    }

function ListOfLayout({ tab, area, openId, layout, screen, searchRef }: ListOfLayoutProps) {
    if (layout === 'names') {
        return (
            <DocumentNamesColumn tab={tab} openId={openId} screen={screen} searchRef={searchRef} />
        )
    }
    return <FullList tab={tab} area={area} screen={screen} searchRef={searchRef} />
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
 * One list tab (spec docs/specs/sales-lists-design.md §3), in the parts, words and test-id
 * prefix of the tab's list area (`areaOf`): the full list with its
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
    const area = areaOf(tab)
    useListShortcuts({ screen, selection, area, isCovered, isBeside, searchRef })
    return (
        <>
            <ListOfLayout
                tab={tab}
                area={area}
                openId={openId}
                layout={layout}
                screen={screen}
                searchRef={searchRef}
            />
            <DocumentListDialogs
                testIdPrefix={area.testIdPrefix}
                rowActions={screen.rowActions}
                batch={screen.batch}
            />
        </>
    )
}

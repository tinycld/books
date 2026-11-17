import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { type RefObject, useRef } from 'react'
import { type TextInputInstance, View } from 'react-native'
import {
    type DocumentListScreenState,
    useDocumentListScreen,
} from '../../hooks/useDocumentListScreen'
import type { ListLayout } from '../../lib/detail-surface'
import type { DocumentListTab } from '../../lib/document-list'
import { ListBanner } from '../ListBanner'
import { SearchField } from '../ListToolbar'
import { DocumentListCards } from './DocumentListCards'
import { DocumentListHeader } from './DocumentListHeader'
import { DocumentListStates, LIST_LOAD_ERROR, SEARCH_PLACEHOLDER } from './DocumentListStates'
import { DocumentListTable } from './DocumentListTable'
import { DocumentNamesColumn } from './DocumentNamesColumn'

interface ListBodyProps {
    tab: DocumentListTab
    screen: DocumentListScreenState
}

// The rows, once there are some: a table, or cards below the table's own minimum width.
// None draw while the screen loads, which includes the wait for the user's access, so a
// writer never sees the reader's list.
function ListBody({ tab, screen }: ListBodyProps) {
    const { list } = screen
    if (list.isLoading || list.rows.length === 0) return null
    if (screen.drawsCards) {
        return (
            <DocumentListCards
                tab={tab}
                rows={list.rows}
                currency={list.currency}
                onOpen={screen.openRow}
                onNearEnd={list.loadMore}
            />
        )
    }
    return (
        <DocumentListTable
            tab={tab}
            rows={list.rows}
            currency={list.currency}
            canWrite={screen.canWrite}
            onOpen={screen.openRow}
            onNearEnd={list.loadMore}
        />
    )
}

interface ToolbarProps {
    screen: DocumentListScreenState
    inputRef: RefObject<TextInputInstance | null>
}

// The search row draws in every state, so the search that led to a refused query can
// still be changed or cleared.
function Toolbar({ screen, inputRef }: ToolbarProps) {
    const isWide = useBreakpoint() !== 'mobile'
    const search = { query: screen.filters.search, setQuery: screen.setSearch }
    return (
        <View className="flex-row flex-wrap items-center gap-2 px-4 pb-3 pt-3">
            <SearchField
                testIdPrefix="sales"
                placeholder={SEARCH_PLACEHOLDER}
                list={search}
                isWide={isWide}
                inputRef={inputRef}
            />
        </View>
    )
}

function FullList({ tab, screen }: ListBodyProps) {
    const { list } = screen
    const inputRef = useRef<TextInputInstance>(null)
    const bannerMessage = list.isError ? LIST_LOAD_ERROR : null
    return (
        <View
            testID="sales-list"
            aria-busy={list.isBusy}
            onLayout={screen.onListLayout}
            className="min-w-0 flex-1 bg-background"
        >
            <DocumentListHeader tab={tab} screen={screen} />
            <Toolbar screen={screen} inputRef={inputRef} />
            <ListBanner testIdPrefix="sales" message={bannerMessage} onRetry={list.retry} />
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

interface DocumentListScreenProps {
    tab: DocumentListTab
    openId: string
    layout: ListLayout
}

/**
 * One Sales tab's list (spec docs/specs/sales-lists-design.md §3): the full list with its
 * header, tabs, search, states and rows (layout `table`), or the 320 px column of names
 * beside an open document (layout `names`). Both read the tab's one `useDocumentListScreen`,
 * so the tab's kept filters and sort apply to each, and the list keeps its rows when the
 * window crosses the panel width.
 */
export function DocumentListScreen({ tab, openId, layout }: DocumentListScreenProps) {
    const screen = useDocumentListScreen(tab, layout)
    if (layout === 'names') return <DocumentNamesColumn tab={tab} openId={openId} screen={screen} />
    return <FullList tab={tab} screen={screen} />
}

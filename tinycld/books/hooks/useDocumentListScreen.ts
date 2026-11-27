import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useDebouncedValue } from '@tinycld/core/lib/use-debounced-value'
import { useUrl } from '@tinycld/core/lib/use-url'
import { router, useFocusEffect, useIsFocused } from 'expo-router'
import { useCallback, useId, useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import type { ListLayout } from '../lib/detail-surface'
import {
    type DocumentListFilters,
    type DocumentListRow,
    type DocumentListTab,
    type ListKind,
    type ListRange,
    type ListSort,
    type ListSortKey,
    listControls,
    listDocumentHref,
    tableMinWidthFor,
    tabStateKey,
} from '../lib/document-list'
import { nextSort } from '../lib/document-list-menus'
import { areaOf, areaTabOf } from '../lib/list-areas'
import { SEARCH_DELAY_MS } from '../lib/list-search'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { navigationModeFor, openRecordFromPath, targetModeFor } from '../lib/record-route'
import { selectionScope, useDocumentListStore } from '../stores/document-list-store'
import { useBatchPdfDownload } from './useBatchPdfDownload'
import { useBatchSend } from './useBatchSend'
import { useBooksAccess } from './useBooksAccess'
import { useDocumentBatch } from './useDocumentBatch'
import { useDocumentList } from './useDocumentList'
import { useDocumentRowActions } from './useDocumentRowActions'
import { useListSelection } from './useListSelection'
import { usePurchaseCategories } from './usePurchaseCategories'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }
const NO_ROWS: readonly DocumentListRow[] = []

// When the list route loses the focus (a tab press replaces it, the user leaves the list
// area, or an All tab pushes a document over itself) every menu of the screen (New, Batch
// actions, a row's) closes, the banner of a refusal or a batch result goes, since it tells
// about this list only, and so do this list's confirm dialogs unless their write runs. A
// kind tab's list lives in its kind `_layout.tsx` and keeps the focus while a document opens
// in the child stack beside it, so opening a document there clears none of them.
function useBlurCleanup(listKey: string) {
    useFocusEffect(
        useCallback(
            () => () => {
                const store = useDocumentListStore.getState()
                store.setMenu('')
                store.setBanner(null)
                const row = store.rowDialog
                if (row?.listKey === listKey && !row.isRunning) store.setRowDialog(null)
                const batch = store.batchDialog
                if (batch?.listKey === listKey && batch.running === null) {
                    store.setBatchDialog(null)
                }
            },
            [listKey]
        )
    )
}

// The All tab's New menu: open while the store's menu is 'new' and this screen has the
// focus, so it never draws on a list below a pushed screen.
function useNewMenu() {
    const isFocused = useIsFocused()
    const menu = useDocumentListStore(state => state.menu)
    const setMenu = useDocumentListStore(state => state.setMenu)
    return {
        isOpen: isFocused && menu === 'new',
        setOpen: (isOpen: boolean) => setMenu(isOpen ? 'new' : ''),
    }
}

function sameFilters(a: DocumentListFilters, b: DocumentListFilters): boolean {
    return a.search === b.search && a.chip === b.chip && a.range === b.range && a.party === b.party
}

// The filters the rows on screen answer. While a new query loads (or the typed search
// waits for its debounce) the list keeps the last ready rows, and those answer the
// filters of the last settled list, not the ones just set: the empty state ("yet" or
// "match") is decided from them, so Clear filters never shows "No invoices yet" while
// the rows come back.
function useAnsweredFilters(filters: DocumentListFilters, isSettled: boolean) {
    const [answered, setAnswered] = useState(filters)
    if (isSettled && !sameFilters(answered, filters)) setAnswered(filters)
    return isSettled ? filters : answered
}

// The list's width, measured on the root view, for the cards rule. 0 until measured.
function useListWidth() {
    const [width, setWidth] = useState(0)
    const onListLayout = (event: LayoutChangeEvent) => {
        const next = event.nativeEvent.layout.width
        if (next !== width) setWidth(next)
    }
    return { width, onListLayout }
}

// The row the list keys focused (`focus` in the store, kept under `scope`), never DOM
// focus. With none kept for the scope, the open document's row (`openId`, '' for none) is
// the focus, so the 320 px column, whose scope is new when the list narrows to it, moves
// on from the open row. '' when neither is in the list; `focusedIndex` is -1 then. The
// store drops it with the selection when the list leaves the scope.
function useRowFocus(scope: string, rows: readonly DocumentListRow[], openId: string) {
    const keptId = useDocumentListStore(state =>
        state.focus.scope === scope ? state.focus.id : ''
    )
    const setFocus = useDocumentListStore(state => state.setFocus)
    const storedId = keptId === '' ? openId : keptId
    const focusedIndex = storedId === '' ? -1 : rows.findIndex(row => row.id === storedId)
    const focusedId = focusedIndex < 0 ? '' : storedId
    return {
        focusedId,
        focusedIndex,
        setFocusedId: (id: string) => setFocus(scope, id),
    }
}

/**
 * One list tab (the Sales lists design spec §3): its kept search, chip, date
 * range, party and sort (`useDocumentListStore`), its rows (`useDocumentList`, with the
 * search debounced), what the user may do on it, and where its rows, New and tabs lead
 * (the New items and tabs of the tab's list area, `areaOf`). The screen waits for the
 * user's access as well as the rows, so a writer never sees the reader's list for a
 * moment, and a failed access read shows the list's error with Retry. Below the table's
 * own minimum width (or on a phone) the list draws cards.
 */
export function useDocumentListScreen(tab: DocumentListTab, layout: ListLayout) {
    const orgHref = useOrgHref()
    const { pathname } = useUrl()
    const isPhone = useBreakpoint() === 'mobile'
    const [accessCollection] = useStore('books_access')
    const access = useBooksAccess()
    const area = areaOf(tab)
    const stateKey = tabStateKey(tab)
    const tabState = useDocumentListStore(state => state.tabs[stateKey])
    const store = useDocumentListStore.getState()
    const { filters, sort } = tabState ?? store.tabState(stateKey)
    const search = useDebouncedValue(filters.search, SEARCH_DELAY_MS)
    const queryFilters = { ...filters, search }
    const documentList = useDocumentList({ tab, filters: queryFilters, sort })
    // The Category cell's account and product names, for the rows on screen; a tab with no
    // Category column reads none.
    const hasCategory = tab.columns.includes('category')
    const categories = usePurchaseCategories(hasCategory ? documentList.rows : NO_ROWS)
    const newMenu = useNewMenu()
    // The row and batch dialogs belong to this mounted list, not to its tab: a tab press
    // replaces the list area's screen with a new list route while a route pushed earlier
    // can still hold a list of the same tab under it, and only the list that opened a
    // dialog draws it. The list stays mounted when its layout changes, so the key holds
    // while a write runs. `owner` names this list to its one WriteOffDialog (plan decision 3).
    const owner = useId()
    const listKey = `${stateKey}:${owner}`
    useBlurCleanup(listKey)
    const { width, onListLayout } = useListWidth()

    const canWrite = access.canWrite
    const isAccessPending = !access.isReady && !access.isError
    const isLoading = documentList.isLoading || isAccessPending
    const isError = !isLoading && (documentList.isError || access.isError || categories.isError)
    // The typed search reaches the query 250 ms after the last key; until then the rows
    // answer the last search, so the list is busy.
    const isSearchPending = search !== filters.search
    const isBusy = documentList.isBusy || isSearchPending
    const appliedFilters = useAnsweredFilters(queryFilters, !isLoading && !isError && !isBusy)
    const accessRecovery: LiveRecovery = access.isError
        ? { queries: [access.collection], sources: [accessCollection] }
        : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([documentList.recovery, accessRecovery, categories.recovery]),
            onError: err => log.warn(area.logContext, 'retry failed', { err }),
        })
    }
    const categoryNames = { accounts: categories.accounts, products: categories.products }
    const list = { ...documentList, isLoading, isBusy, isError, retry, categoryNames }

    // The ticks and the row focus hold for the tab, the layout and the filters
    // (`selectionScope`), so a change of any of them, or the list narrowing to the names
    // column, clears them for good; a sort keeps them.
    const scope = selectionScope(stateKey, layout, filters)
    const open = openRecordFromPath(tab.path, pathname)
    const openId = open.kind === 'id' ? open.id : ''
    const rowFocus = useRowFocus(scope, list.rows, openId)

    // A kind list beside an open document replaces it, so Back returns to the list; the
    // open document's own row keeps the form, its scroll and its edits. The opened row
    // takes the row focus, so the list keys go on from it.
    const openRow = (row: DocumentListRow) => {
        rowFocus.setFocusedId(row.id)
        if (open.kind === 'id' && open.id === row.id) return
        const href = orgHref(listDocumentHref(row.kind, row.key))
        if (navigationModeFor(open) === 'replace') router.replace(href)
        else router.push(href)
    }
    // A kind tab's New opens its `new` route; an All tab has a menu of the area's New
    // items, so New with no kind opens that menu. Beside an open document New replaces it,
    // as a row does, so the document's leave guard asks before unsaved edits go. A New
    // outside the kind's stack (the Bill payments tab's Pay Bills) is pushed over the kind
    // route, so Back returns to the list (`targetModeFor`).
    const openNew = (kind?: ListKind) => {
        const item = area.newItems.find(entry => entry.kind === kind)
        const href = item?.href ?? tab.newHref
        if (href === null) {
            newMenu.setOpen(true)
            return
        }
        newMenu.setOpen(false)
        if (targetModeFor(open, tab.path, href) === 'replace') router.replace(orgHref(href))
        else router.push(orgHref(href))
    }
    // A tab press replaces the list route, so Back leaves the list area.
    const goToTab = (key: string) => {
        if (key === tab.key) return
        router.replace(orgHref(areaTabOf(area, key).path))
    }

    // The table's minimum counts only the edge cells it draws: a reader has no tick box.
    const controls = listControls(canWrite, layout)
    const minWidth = tableMinWidthFor(tab, controls)
    const drawsCards = isPhone || (width > 0 && width < minWidth)

    const loadedIds = list.rows.map(row => row.id)
    const selection = useListSelection(scope, loadedIds)
    const rowActions = useDocumentRowActions({
        listKey,
        owner,
        rows: list.rows,
        canWrite,
        isAdmin: access.isAdmin,
        openRow,
    })
    const batch = useDocumentBatch({ listKey, rows: list.rows, selection })
    // The Batch actions menu's Send, its dialog and its result banner (email-share spec
    // §3.3 "Batch"); only a sent-able ticked row offers it (a sales document or a purchase
    // order).
    const batchSend = useBatchSend({ listKey, rows: list.rows, selection })
    // The Batch actions menu's Download PDF: the ticked rows' PDFs in one file.
    const batchPdf = useBatchPdfDownload({ rows: list.rows, selection })
    // A row action's refusal or a batch's result; the list's load error shows before it.
    const actionBanner = useDocumentListStore(state => state.banner)

    return {
        owner,
        list,
        filters,
        appliedFilters,
        sort,
        canWrite,
        isAdmin: access.isAdmin,
        controls,
        tableMinWidth: minWidth,
        scope,
        selection,
        rowFocus,
        rowActions,
        batch,
        batchSend,
        batchPdf,
        actionBanner,
        dismissBanner: () => store.setBanner(null),
        newMenu,
        openRow,
        openNew,
        goToTab,
        setSearch: (text: string) => store.setSearch(stateKey, text),
        setChip: (chipId: string) => store.setChip(stateKey, chipId),
        setRange: (range: ListRange) => store.setRange(stateKey, range),
        // '' (All customers, All vendors) removes the filter.
        setParty: (partyId: string) => store.setParty(stateKey, partyId),
        // A header press: a new column ascending, the sorted column turned around.
        toggleSort: (key: ListSortKey) => store.setSort(stateKey, nextSort(sort, key)),
        setSort: (next: ListSort) => store.setSort(stateKey, next),
        clearFilters: () => store.clearFilters(stateKey),
        drawsCards,
        onListLayout,
    }
}

export type DocumentListScreenState = ReturnType<typeof useDocumentListScreen>

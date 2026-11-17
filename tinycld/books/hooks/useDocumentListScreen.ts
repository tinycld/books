import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useDebouncedValue } from '@tinycld/core/lib/use-debounced-value'
import { useUrl } from '@tinycld/core/lib/use-url'
import { router, useFocusEffect, useIsFocused } from 'expo-router'
import { useCallback, useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import type { ListLayout } from '../lib/detail-surface'
import {
    type DocumentListFilters,
    type DocumentListRow,
    type DocumentListTab,
    listControls,
    tableMinWidth,
} from '../lib/document-list'
import { documentHref } from '../lib/document-routes'
import { SEARCH_DELAY_MS } from '../lib/list-search'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { TRANSACTION_DOC_KINDS, type TransactionKind } from '../lib/party-transactions'
import { navigationModeFor, openRecordFromPath } from '../lib/record-route'
import { SALES_NEW_ITEMS, salesTabOf } from '../lib/sales-lists'
import { selectionScope, useDocumentListStore } from '../stores/document-list-store'
import { useBooksAccess } from './useBooksAccess'
import { useDocumentList } from './useDocumentList'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// The All sales New menu: open while the store's menu is 'new' and this screen has the
// focus. A screen below a pushed document stays mounted, so its menu must not draw there,
// and the menu closes when the screen loses the focus.
function useNewMenu() {
    const isFocused = useIsFocused()
    const menu = useDocumentListStore(state => state.menu)
    const setMenu = useDocumentListStore(state => state.setMenu)
    useFocusEffect(
        useCallback(
            () => () => {
                useDocumentListStore.getState().setMenu('')
            },
            []
        )
    )
    return {
        isOpen: isFocused && menu === 'new',
        setOpen: (isOpen: boolean) => setMenu(isOpen ? 'new' : ''),
    }
}

function sameFilters(a: DocumentListFilters, b: DocumentListFilters): boolean {
    return (
        a.search === b.search &&
        a.chip === b.chip &&
        a.range === b.range &&
        a.customer === b.customer
    )
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

/**
 * One Sales list tab (spec docs/specs/sales-lists-design.md §3): its kept search, chip,
 * date range, customer and sort (`useDocumentListStore`), its rows (`useDocumentList`,
 * with the search debounced), what the user may do on it, and where its rows, New and
 * tabs lead. The screen waits for the user's access as well as the rows, so a writer never
 * sees the reader's list for a moment, and a failed access read shows the list's error
 * with Retry. Below the table's own minimum width (or on a phone) the list draws cards.
 */
export function useDocumentListScreen(tab: DocumentListTab, layout: ListLayout) {
    const orgHref = useOrgHref()
    const { pathname } = useUrl()
    const isPhone = useBreakpoint() === 'mobile'
    const [accessCollection] = useStore('books_access')
    const access = useBooksAccess()
    const tabState = useDocumentListStore(state => state.tabs[tab.key])
    const store = useDocumentListStore.getState()
    const { filters, sort } = tabState ?? store.tabState(tab.key)
    const search = useDebouncedValue(filters.search, SEARCH_DELAY_MS)
    const queryFilters = { ...filters, search }
    const documentList = useDocumentList({ tab, filters: queryFilters, sort })
    const newMenu = useNewMenu()
    const { width, onListLayout } = useListWidth()

    const canWrite = access.canWrite
    const isAccessPending = !access.isReady && !access.isError
    const isLoading = documentList.isLoading || isAccessPending
    const isError = !isLoading && (documentList.isError || access.isError)
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
            ...mergeRecoveries([documentList.recovery, accessRecovery]),
            onError: err => log.warn('books.sales-lists', 'retry failed', { err }),
        })
    }
    const list = { ...documentList, isLoading, isBusy, isError, retry }

    // A kind list beside an open document replaces it, so Back returns to the list; the
    // open document's own row keeps the form, its scroll and its edits.
    const open = openRecordFromPath(tab.path, pathname)
    const openRow = (row: DocumentListRow) => {
        if (open.kind === 'id' && open.id === row.id) return
        const href = orgHref(documentHref(TRANSACTION_DOC_KINDS[row.kind], row.id))
        if (navigationModeFor(open) === 'replace') router.replace(href)
        else router.push(href)
    }
    // A kind tab's New opens its `new` route; All sales has a menu of the kinds, so New
    // with no kind opens that menu.
    const openNew = (kind?: TransactionKind) => {
        const item = SALES_NEW_ITEMS.find(entry => entry.kind === kind)
        const href = item?.href ?? tab.newHref
        if (href === null) {
            newMenu.setOpen(true)
            return
        }
        newMenu.setOpen(false)
        router.push(orgHref(href))
    }
    // A tab press replaces the list route, so Back leaves the Sales area.
    const goToTab = (key: string) => {
        if (key === tab.key) return
        router.replace(orgHref(salesTabOf(key).path))
    }

    const minWidth = tableMinWidth(tab.columns, canWrite)
    const drawsCards = isPhone || (width > 0 && width < minWidth)

    return {
        list,
        filters,
        appliedFilters,
        sort,
        canWrite,
        controls: listControls(canWrite, layout),
        scope: selectionScope(tab.key, layout, filters),
        newMenu,
        openRow,
        openNew,
        goToTab,
        setSearch: (text: string) => store.setSearch(tab.key, text),
        clearFilters: () => store.clearFilters(tab.key),
        drawsCards,
        onListLayout,
    }
}

export type DocumentListScreenState = ReturnType<typeof useDocumentListScreen>

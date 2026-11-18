import { useRegisterShortcuts, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { topLayer } from '@tinycld/core/ui/overlay/layer-stack'
import { type RefObject, useId, useMemo, useRef } from 'react'
import { Platform, type TextInputInstance } from 'react-native'
import {
    type ListKeyAction,
    listShortcuts,
    movedFocus,
    offeredListKeys,
} from '../lib/list-shortcuts'
import { useDocumentListStore } from '../stores/document-list-store'
import type { useDocumentListScreen } from './useDocumentListScreen'
import type { useListSelection } from './useListSelection'

type KeyHandlers = Record<ListKeyAction, () => void>

const NO_SHORTCUTS: never[] = []

// The 320 px column keeps its keys while the document beside it holds the `compose` scope;
// on a key both own, the document's wins. A dialog (`modal`) still shadows the list.
const LIST_SCOPE_OPTIONS = { activeUnder: ['compose'] } as const

// A PickMenu (date range, customer, Sort) is not the screen's store menu and pushes no
// scope either: core marks it only in the layer stack, as the top layer that is not modal.
// Read at press time.
function noMenuLayerOpen(): boolean {
    const layer = topLayer()
    return layer === null || layer.isModal
}

// Each key calls the handler of the latest render, so a key never acts on stale rows.
function relayTo(ref: RefObject<KeyHandlers>): KeyHandlers {
    return {
        search: () => ref.current.search(),
        next: () => ref.current.next(),
        previous: () => ref.current.previous(),
        open: () => ref.current.open(),
        tick: () => ref.current.tick(),
        tickAll: () => ref.current.tickAll(),
        new: () => ref.current.new(),
        tab1: () => ref.current.tab1(),
        tab2: () => ref.current.tab2(),
        tab3: () => ref.current.tab3(),
        tab4: () => ref.current.tab4(),
        tab5: () => ref.current.tab5(),
        tab6: () => ref.current.tab6(),
    }
}

/**
 * The keys of a Sales list tab (spec docs/specs/sales-lists-design.md §3 "Keyboard"),
 * registered in the screen's `list` scope, each only while its action is offered
 * (lib/list-shortcuts.ts): no tick keys without tick boxes (a reader, the 320 px column,
 * where `selection` is null), no New for a reader, none while a menu of the screen is open
 * or a document covers the list. Beside an open document (`isBeside`, the 320 px column)
 * the keys stay active under the document's scope, and next and previous are the arrow
 * keys only, because the read view owns J. Handlers are read at press time through a ref;
 * the keys re-register only when what is offered changes. Android has no list keys: every
 * action has a visible control there.
 */
export function useListShortcuts(input: {
    screen: ReturnType<typeof useDocumentListScreen>
    selection: ReturnType<typeof useListSelection> | null
    tabs: readonly { key: string }[]
    isCovered: boolean
    isBeside: boolean
    searchRef: RefObject<TextInputInstance | null>
}): void {
    const { screen, selection, tabs, isCovered, isBeside, searchRef } = input
    const instance = useId()
    const owner = useShortcutScope('list', LIST_SCOPE_OPTIONS)
    const menu = useDocumentListStore(state => state.menu)
    const { list, rowFocus, controls } = screen
    const rows = list.rows
    const hasRows = !list.isLoading && rows.length > 0
    const withFocused = (act: (id: string) => void) => {
        if (rowFocus.focusedId !== '') act(rowFocus.focusedId)
    }
    const moveFocus = (step: 1 | -1) => {
        const ids = rows.map(row => row.id)
        const id = movedFocus(ids, rowFocus.focusedId, step)
        if (id !== '') rowFocus.setFocusedId(id)
    }
    const goToTab = (index: number) => {
        const tab = tabs[index]
        if (tab) screen.goToTab(tab.key)
    }
    const run: KeyHandlers = {
        search: () => searchRef.current?.focus(),
        next: () => moveFocus(1),
        previous: () => moveFocus(-1),
        open: () => {
            const row = rows[rowFocus.focusedIndex]
            if (row) screen.openRow(row)
        },
        tick: () => withFocused(id => selection?.toggle(id)),
        tickAll: () => selection?.toggleAll(),
        // A kind tab opens its `new` route; All sales opens its New menu.
        new: () => screen.openNew(),
        tab1: () => goToTab(0),
        tab2: () => goToTab(1),
        tab3: () => goToTab(2),
        tab4: () => goToTab(3),
        tab5: () => goToTab(4),
        tab6: () => goToTab(5),
    }
    const runRef = useRef(run)
    runRef.current = run
    const showNew = controls.showNew
    const showTicks = controls.showTicks && selection !== null
    const tabCount = tabs.length
    const isMenuOpen = menu !== ''
    const isAndroid = Platform.OS === 'android'
    const shortcuts = useMemo(() => {
        if (isAndroid) return NO_SHORTCUTS
        const offered = offeredListKeys({
            showNew,
            showTicks,
            hasRows,
            tabCount,
            isMenuOpen,
            isCovered,
        })
        return listShortcuts({
            idPrefix: `books.sales.list.${instance}`,
            offered,
            run: relayTo(runRef),
            isBeside,
            when: noMenuLayerOpen,
        })
    }, [
        isAndroid,
        instance,
        showNew,
        showTicks,
        hasRows,
        tabCount,
        isMenuOpen,
        isCovered,
        isBeside,
    ])
    useRegisterShortcuts(shortcuts, owner)
}

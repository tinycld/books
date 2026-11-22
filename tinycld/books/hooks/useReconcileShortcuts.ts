import { type Shortcut, useRegisterShortcuts, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { topLayer } from '@tinycld/core/ui/overlay/layer-stack'
import { type RefObject, useId, useMemo, useRef } from 'react'
import type { TextInputInstance } from 'react-native'
import type { ListScrollHandle } from '../components/ListTable'
import { releaseDomFocus } from '../lib/dom-focus'
import { hasSearchText, type ReconcileSide } from '../lib/reconcile'
import {
    offeredReconcileKeys,
    RECONCILE_KEYS,
    type ReconcileKeyAction,
    type ReconcileKeyState,
    reconcileShortcuts,
} from '../lib/reconcile-shortcuts'
import { useReconcileStore } from '../stores/reconcile-store'
import type { ReconcileLineRow } from './useReconcileLines'

const NO_SHORTCUTS: Shortcut[] = []

function isReconcileKeyAction(name: string): name is ReconcileKeyAction {
    return Object.hasOwn(RECONCILE_KEYS, name)
}

// A menu or popover (Show) pushes no shortcut scope, so core marks it only in the layer
// stack: the top layer is open and not modal. Read at press time.
function isMenuOpenNow(): boolean {
    const layer = topLayer()
    return layer !== null && !layer.isModal
}

// The row after (or before) the focused one; the first press focuses the first row, and
// the focus stays at either end.
function steppedIndex(count: number, index: number, step: 1 | -1): number {
    if (index < 0) return 0
    return Math.min(count - 1, Math.max(0, index + step))
}

type KeyHandlers = Record<ReconcileKeyAction, () => void>

// Each key calls the handler of the latest render, so a key never acts on stale rows.
function relayTo(ref: RefObject<KeyHandlers>): KeyHandlers {
    return {
        next: () => ref.current.next(),
        previous: () => ref.current.previous(),
        toggle: () => ref.current.toggle(),
        open: () => ref.current.open(),
        toggleAll: () => ref.current.toggleAll(),
        clearMatched: () => ref.current.clearMatched(),
        search: () => ref.current.search(),
        sideAll: () => ref.current.sideAll(),
        sideOut: () => ref.current.sideOut(),
        sideIn: () => ref.current.sideIn(),
        escape: () => ref.current.escape(),
    }
}

export type ReconcileShortcutsInput = {
    // The work screen shows its list (state `work`).
    isEnabled: boolean
    canWrite: boolean
    isBatchRunning: boolean
    isWriteBlocked: boolean
    shown: readonly ReconcileLineRow[]
    focusedLineId: string | null
    matchedCount: number
    // The search as typed (the store's), not the applied one.
    search: string
    searchRef: RefObject<TextInputInstance | null>
    listScrollRef: RefObject<ListScrollHandle | null>
    onToggle: (lineId: string) => void
    onToggleAllShown: () => void
    onClearMatched: () => void
    onOpen: (row: ReconcileLineRow) => void
}

/**
 * The work screen's list keys (reconcile spec §3 "Keys", lib/reconcile-shortcuts.ts),
 * registered in the screen's own `list` scope while the list shows, each only while its
 * action is offered. State and handlers are read at press time through refs; the keys
 * re-register only when what is offered changes. A movement key drops DOM focus
 * (releaseDomFocus), moves the store's `focusedLineId` and scrolls that row into view
 * through `listScrollRef`. M is not registered here: Clear matched is a ShortcutButton
 * with the key M (ReconcileToolbar), offered under the same rule, and two registrations
 * of one key would list it twice in ⇧?. Returns the scope's owner, which every
 * ShortcutButton of the screen takes as `scopeOwner`.
 */
export function useReconcileShortcuts(input: ReconcileShortcutsInput) {
    const owner = useShortcutScope('list')
    const instance = useId()
    const setFocusedLine = useReconcileStore(s => s.setFocusedLine)
    const setSide = useReconcileStore(s => s.setSide)
    const setSearch = useReconcileStore(s => s.setSearch)
    const focusedIndex = input.shown.findIndex(row => row.id === input.focusedLineId)
    const state: Omit<ReconcileKeyState, 'isMenuOpen'> = {
        canWrite: input.canWrite,
        isBatchRunning: input.isBatchRunning,
        isWriteBlocked: input.isWriteBlocked,
        rowCount: input.shown.length,
        hasFocusedRow: focusedIndex >= 0,
        matchedCount: input.matchedCount,
        hasSearchText: hasSearchText(input.search),
    }
    const stateRef = useRef(state)
    stateRef.current = state

    const moveFocus = (step: 1 | -1) => {
        releaseDomFocus()
        if (input.shown.length === 0) return
        const index = steppedIndex(input.shown.length, focusedIndex, step)
        setFocusedLine(input.shown[index].id)
        input.listScrollRef.current?.scrollToIndex(index)
    }
    const withFocused = (act: (row: ReconcileLineRow) => void) => {
        const row = input.shown[focusedIndex]
        if (row) act(row)
    }
    const side = (value: ReconcileSide) => () => setSide(value)
    const run: KeyHandlers = {
        next: () => moveFocus(1),
        previous: () => moveFocus(-1),
        toggle: () => withFocused(row => input.onToggle(row.id)),
        open: () => withFocused(input.onOpen),
        toggleAll: input.onToggleAllShown,
        clearMatched: input.onClearMatched,
        search: () => input.searchRef.current?.focus(),
        sideAll: side('all'),
        sideOut: side('out'),
        sideIn: side('in'),
        // Clears the text and leaves the field, so the next key is the list's again.
        escape: () => {
            setSearch('')
            input.searchRef.current?.blur()
        },
    }
    const runRef = useRef(run)
    runRef.current = run

    const offeredNames = input.isEnabled
        ? offeredReconcileKeys({ ...state, isMenuOpen: false })
              .filter(action => action !== 'clearMatched')
              .join(',')
        : ''
    const shortcuts = useMemo(() => {
        if (offeredNames === '') return NO_SHORTCUTS
        return reconcileShortcuts({
            id: `books.reconcile.work.${instance}`,
            offered: offeredNames.split(',').filter(isReconcileKeyAction),
            read: () => ({ ...stateRef.current, isMenuOpen: isMenuOpenNow() }),
            run: relayTo(runRef),
        })
    }, [instance, offeredNames])
    useRegisterShortcuts(shortcuts, owner)
    return owner
}

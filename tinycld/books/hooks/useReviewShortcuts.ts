import { useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { topLayer } from '@tinycld/core/ui/overlay/layer-stack'
import { type RefObject, useId, useMemo, useRef } from 'react'
import type { TextInputInstance } from 'react-native'
import type { ReviewTab, TxnTab } from '../lib/bank-review'
import {
    offeredReviewKeys,
    REVIEW_KEYS,
    type ReviewKeyAction,
    type ReviewKeyState,
    reviewShortcuts,
} from '../lib/review-shortcuts'
import { useBankingUIStore } from '../stores/banking-ui-store'
import type { ReviewDrawerModel } from './useReviewDrawer'
import type { ReviewTabModel } from './useReviewTab'

function isReviewKeyAction(name: string): name is ReviewKeyAction {
    return Object.hasOwn(REVIEW_KEYS, name)
}

// A menu or popover pushes no shortcut scope, so core marks it only in the layer stack:
// the top layer is open and not modal. Read at press time.
function isMenuOpenNow(): boolean {
    const layer = topLayer()
    return layer !== null && !layer.isModal
}

// On the web, a mouse press leaves DOM focus on the pressed row, check box, tab, button or
// menu trigger, and react-native-web presses that element on plain Enter (and Space on a
// button) before the list sees the key. A movement key makes the stripe the place the
// keys act on, so it drops that focus: ↵ and Space then reach the list and act on the
// striped row. A text field keeps its focus (no list key fires inside one anyway). Native
// has no `document` and no such focus.
function releaseDomFocus() {
    if (typeof document === 'undefined') return
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || active === document.body) return
    if (active.isContentEditable || active.matches('input, textarea, select')) return
    active.blur()
}

// The next or previous row after the focused one; the first press focuses the first row,
// and the focus stays at either end.
function steppedRow(rows: ReviewTabModel['rows'], index: number, step: 1 | -1): string | null {
    if (rows.length === 0) return null
    if (index < 0) return rows[0].id
    const next = Math.min(rows.length - 1, Math.max(0, index + step))
    return rows[next].id
}

type KeyHandlers = Record<ReviewKeyAction, () => void>

// Each key calls the handler of the latest render, so a key never acts on stale rows.
function relayTo(ref: RefObject<KeyHandlers>): KeyHandlers {
    return {
        next: () => ref.current.next(),
        previous: () => ref.current.previous(),
        toggle: () => ref.current.toggle(),
        open: () => ref.current.open(),
        toggleAll: () => ref.current.toggleAll(),
        exclude: () => ref.current.exclude(),
        restore: () => ref.current.restore(),
        search: () => ref.current.search(),
        tabReview: () => ref.current.tabReview(),
        tabReviewed: () => ref.current.tabReviewed(),
        tabExcluded: () => ref.current.tabExcluded(),
        tabFiles: () => ref.current.tabFiles(),
        escape: () => ref.current.escape(),
    }
}

export type ReviewShortcutsInput = ReviewTabModel & {
    tab: TxnTab
    searchRef: RefObject<TextInputInstance | null>
    onTab: (tab: ReviewTab) => void
    drawer: Pick<ReviewDrawerModel, 'action' | 'onAction' | 'onClose'>
}

// The keys of a transaction tab, registered in the Banking page's `list` scope (the page's
// ScopeProvider, BankingScreenView) while the tab body shows, each only while its action is
// offered (lib/review-shortcuts.ts). State
// and handlers are read at press time through refs; the keys re-register only when what
// is offered changes, never on an ordinary render.
export function useReviewShortcuts(input: ReviewShortcutsInput): void {
    const instance = useId()
    const writes = useServerActionState()
    const setFocusedTxn = useBankingUIStore(s => s.setFocusedTxn)
    const state: Omit<ReviewKeyState, 'isMenuOpen'> = {
        tab: input.tab,
        canWrite: input.canWrite,
        canChoose: input.canChoose,
        isBatchPending: input.batch.isPending,
        isWriteBlocked: writes.isDisabled,
        rowCount: input.rows.length,
        // The selection bar's count: it also holds the bar's own run in flight, when the
        // rows already left the list but the bar (not the toolbar) still shows.
        chosenCount: input.selection.count,
        hasFocusedRow: input.focusedTxnId !== null,
        isDrawerOpen: input.openTxnId !== null,
        drawerAction: input.drawer.action?.kind ?? null,
    }
    const stateRef = useRef(state)
    stateRef.current = state
    const moveFocus = (step: 1 | -1) => {
        releaseDomFocus()
        const id = steppedRow(input.rows, input.focusedIndex, step)
        if (id) setFocusedTxn(id)
    }
    const withFocused = (act: (id: string) => void) => {
        if (input.focusedTxnId) act(input.focusedTxnId)
    }
    // A batch key moves the chosen rows, or the drawer's transaction when none is chosen.
    const move = () => {
        if (input.chosenIds.length > 0) input.onBatch()
        else input.drawer.onAction()
    }
    const run: KeyHandlers = {
        next: () => moveFocus(1),
        previous: () => moveFocus(-1),
        toggle: () => withFocused(input.onToggle),
        open: () => withFocused(input.onOpenRow),
        toggleAll: input.onToggleAll,
        exclude: move,
        restore: move,
        search: () => input.searchRef.current?.focus(),
        tabReview: () => input.onTab('review'),
        tabReviewed: () => input.onTab('reviewed'),
        tabExcluded: () => input.onTab('excluded'),
        tabFiles: () => input.onTab('files'),
        escape: () => {
            if (input.openTxnId !== null) input.drawer.onClose()
            else input.onClearChoice()
        },
    }
    const runRef = useRef(run)
    runRef.current = run
    const offeredNames = offeredReviewKeys({ ...state, isMenuOpen: false }).join(',')
    const shortcuts = useMemo(
        () =>
            reviewShortcuts({
                id: `books.banking.review.${instance}`,
                offered: offeredNames.split(',').filter(isReviewKeyAction),
                read: () => ({ ...stateRef.current, isMenuOpen: isMenuOpenNow() }),
                run: relayTo(runRef),
            }),
        [instance, offeredNames]
    )
    // No owner of its own: core reads the page's scope from its ScopeProvider.
    useRegisterShortcuts(shortcuts)
}

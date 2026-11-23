import type { Shortcut } from '@tinycld/core/lib/shortcuts'
import { activeElementMatches } from './dom-focus'

// The keys of the reconcile work screen's list (reconcile spec §3 "Keys"). Pure, so the
// key map and when each key may fire are unit-tested (tests/reconcile-shortcuts.test.ts).
// E, ⌘S and ⌘↵ are the header's ShortcutButtons on wide (components/reconcile/
// ReconcileHeader.tsx), not entries of this map: their keys are the constants below, in the
// screen's `list` scope. On a phone, where Edit info and Finish later are More menu items,
// E and ⌘S are registered by headerKeyShortcuts and ⌘↵ is the bar's Finish button.

export const EDIT_KEY = { keys: 'e', scope: 'list' } as const
export const LATER_KEY = { keys: '$mod+s', scope: 'list' } as const
export const FINISH_KEY = { keys: '$mod+Enter', scope: 'list' } as const
// The finished summary's View report (components/reconcile/ReconcileFinished.tsx).
export const VIEW_REPORT_KEY = { keys: 'r', scope: 'list' } as const

export type ReconcileHeaderKey = 'edit' | 'later'

const HEADER_KEYS: Record<ReconcileHeaderKey, { keys: string; description: string }> = {
    edit: { keys: EDIT_KEY.keys, description: 'Edit info' },
    later: { keys: LATER_KEY.keys, description: 'Finish later' },
}

const HEADER_ACTIONS: ReconcileHeaderKey[] = ['edit', 'later']

// The phone's E and ⌘S, each only while its menu item is offered (`offered`); `when`
// re-checks the offer at press time (core's ⇧? list does not read `when`), so a key does
// nothing while a menu or popover is open.
export function headerKeyShortcuts(input: {
    id: string
    offered: readonly ReconcileHeaderKey[]
    read: () => { offered: readonly ReconcileHeaderKey[]; isMenuOpen: boolean }
    run: Record<ReconcileHeaderKey, () => void>
}): Shortcut[] {
    const { id, offered, read, run } = input
    return HEADER_ACTIONS.filter(action => offered.includes(action)).map(action => ({
        id: `${id}.${action}`,
        keys: HEADER_KEYS[action].keys,
        scope: 'list' as const,
        description: HEADER_KEYS[action].description,
        group: GROUP,
        when: () => {
            const now = read()
            return !now.isMenuOpen && now.offered.includes(action)
        },
        run: () => run[action](),
    }))
}

export type ReconcileKeyAction =
    | 'next'
    | 'previous'
    | 'toggle'
    | 'open'
    | 'toggleAll'
    | 'clearMatched'
    | 'search'
    | 'sideAll'
    | 'sideOut'
    | 'sideIn'
    | 'escape'

// Key names as tinykeys reads them (core lib/shortcuts/matcher.ts): `event.key` or
// `event.code`, case ignored.
export const RECONCILE_KEYS: Record<ReconcileKeyAction, readonly string[]> = {
    next: ['ArrowDown', 'j'],
    previous: ['ArrowUp', 'k'],
    toggle: ['Space', 'x'],
    open: ['Enter', 'o'],
    toggleAll: ['a'],
    clearMatched: ['m'],
    search: ['/'],
    sideAll: ['1'],
    sideOut: ['2'],
    sideIn: ['3'],
    escape: ['Escape'],
}

const RECONCILE_DESCRIPTIONS: Record<ReconcileKeyAction, string> = {
    next: 'Next transaction',
    previous: 'Previous transaction',
    toggle: 'Clear or unclear transaction',
    open: 'Open transaction',
    toggleAll: 'Clear all shown',
    clearMatched: 'Clear matched',
    search: 'Search',
    sideAll: 'All tab',
    sideOut: 'Payments or Charges tab',
    sideIn: 'Deposits or Payments tab',
    escape: 'Clear the search',
}

const RECONCILE_ACTIONS = Object.keys(RECONCILE_KEYS) as ReconcileKeyAction[]

const SIDE_ACTIONS: ReconcileKeyAction[] = ['sideAll', 'sideOut', 'sideIn']

const GROUP = 'Reconcile'

export type ReconcileKeyState = {
    canWrite: boolean
    // Clear all shown or Clear matched runs.
    isBatchRunning: boolean
    // The server takes no writes now (core useServerActionState).
    isWriteBlocked: boolean
    // The rows the list shows.
    rowCount: number
    hasFocusedRow: boolean
    // Rows matched to a bank transaction and not cleared (Clear matched's count).
    matchedCount: number
    hasSearchText: boolean
    // A menu or popover (Show) is the top layer: it pushes no scope, so its focused row
    // would otherwise pass the letter on to the list.
    isMenuOpen: boolean
}

// The side keys and `/` always; movement with rows; open with a focused row; the clear
// keys (Space / X with a focused row, A with rows, M with matched rows not cleared) for a
// writer while no batch runs and the server takes writes; Esc while the search has text.
// Nothing while a menu is open.
export function offeredReconcileKeys(state: ReconcileKeyState): ReconcileKeyAction[] {
    if (state.isMenuOpen) return []
    const offered: ReconcileKeyAction[] = ['search', ...SIDE_ACTIONS]
    const hasRows = state.rowCount > 0
    if (hasRows) offered.push('next', 'previous')
    if (state.hasFocusedRow) offered.push('open')
    const canClear = state.canWrite && !state.isBatchRunning && !state.isWriteBlocked
    if (canClear && state.hasFocusedRow) offered.push('toggle')
    if (canClear && hasRows) offered.push('toggleAll')
    if (canClear && state.matchedCount > 0) offered.push('clearMatched')
    if (state.hasSearchText) offered.push('escape')
    return offered
}

// Plain Enter and Space press a focused row or clear box itself (react-native-web's
// PressResponder) before the list sees them; for a key the element lets through, `when` is
// false, so the list does not handle the same key a second time.
const PRESS_KEYS = new Set(['Enter', 'Space'])
const PRESSABLE_SELECTOR = '[data-testid^="reconcile-row-"], [data-testid^="reconcile-check-"]'

function focusPressesKey(key: string): boolean {
    return PRESS_KEYS.has(key) && activeElementMatches(PRESSABLE_SELECTOR)
}

// Traced from every element that can hold focus when a key is pressed (lesson 15):
// - The page (nothing focused): the keys move the row stripe (`focusedLineId` in the
//   store), not DOM focus.
// - A row or clear box focused by a mouse press: until a movement key, plain Enter / Space
//   press that element (focusPressesKey). The movement keys drop DOM focus from any
//   element that is not a text field (releaseDomFocus, lib/dom-focus.ts), so after one ↵
//   and Space reach the list.
// - The search field: only Esc sets `allowInInputs`, so a letter or `/` typed there stays
//   text; Esc clears the text and leaves the field, so the next key is the list's.
// - The Show menu: a menu pushes no scope, so `isMenuOpen` (read at press time) turns every
//   key off; the menu keeps its arrows, letters and Escape.
// - An open Dialog or ConfirmDialog, and the ⇧? list: a modal scope, so no list key fires.
// - Core's global `/`: an active scoped key beats a global one with the same keys (core
//   matcher `pickFiring`), so `/` focuses this search while the work screen shows.
// One shortcut per key of each offered action, because core's ⇧? list shows every
// registered key of the scope and does not read `when`; `when` re-checks the offer at
// press time.
export function reconcileShortcuts(input: {
    id: string
    offered: readonly ReconcileKeyAction[]
    read: () => ReconcileKeyState
    run: Record<ReconcileKeyAction, () => void>
}): Shortcut[] {
    const { id, offered, read, run } = input
    return RECONCILE_ACTIONS.filter(action => offered.includes(action)).flatMap(action =>
        RECONCILE_KEYS[action].map(key => ({
            id: `${id}.${action}.${key}`,
            keys: key,
            scope: 'list' as const,
            description: RECONCILE_DESCRIPTIONS[action],
            group: GROUP,
            allowInInputs: action === 'escape',
            when: () => offeredReconcileKeys(read()).includes(action) && !focusPressesKey(key),
            run: () => run[action](),
        }))
    )
}

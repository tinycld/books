import type { Shortcut } from '@tinycld/core/lib/shortcuts'
import type { BatchKind, ReviewTab } from './bank-review'

// The keys of the three transaction tabs (For review, Reviewed, Excluded). Pure, so the key
// map and when each key may fire are unit-tested. The Banking page's own keys (N, U, I)
// are in banking-shortcuts.ts.

export type ReviewKeyAction =
    | 'next'
    | 'previous'
    | 'toggle'
    | 'open'
    | 'toggleAll'
    | 'exclude'
    | 'restore'
    | 'search'
    | 'tabReview'
    | 'tabReviewed'
    | 'tabExcluded'
    | 'tabFiles'
    | 'escape'

// Key names as tinykeys reads them (core lib/shortcuts/matcher.ts): `event.key` or
// `event.code`, case ignored.
export const REVIEW_KEYS: Record<ReviewKeyAction, readonly string[]> = {
    next: ['ArrowDown', 'j'],
    previous: ['ArrowUp', 'k'],
    toggle: ['Space', 'x'],
    open: ['Enter', 'o'],
    toggleAll: ['a'],
    exclude: ['e'],
    restore: ['r'],
    search: ['/'],
    tabReview: ['1'],
    tabReviewed: ['2'],
    tabExcluded: ['3'],
    tabFiles: ['4'],
    escape: ['Escape'],
}

const REVIEW_DESCRIPTIONS: Record<ReviewKeyAction, string> = {
    next: 'Next transaction',
    previous: 'Previous transaction',
    toggle: 'Choose transaction',
    open: 'Open transaction',
    toggleAll: 'Choose all',
    exclude: 'Exclude',
    restore: 'Move to For review',
    search: 'Search',
    tabReview: 'For review tab',
    tabReviewed: 'Reviewed tab',
    tabExcluded: 'Excluded tab',
    tabFiles: 'Files tab',
    escape: 'Close or clear',
}

const REVIEW_ACTIONS = Object.keys(REVIEW_KEYS) as ReviewKeyAction[]

const TAB_ACTIONS: ReviewKeyAction[] = ['tabReview', 'tabReviewed', 'tabExcluded', 'tabFiles']

const GROUP = 'Banking'

export type ReviewKeyState = {
    tab: ReviewTab
    canWrite: boolean
    // Rows can be chosen: a writer on For review or Excluded.
    canChoose: boolean
    // A status change of transactions runs (the page's one batch).
    isBatchPending: boolean
    // The server takes no writes now (core useServerActionState).
    isWriteBlocked: boolean
    rowCount: number
    chosenCount: number
    hasFocusedRow: boolean
    isDrawerOpen: boolean
    // The move the open drawer's transaction allows; null without one.
    drawerAction: BatchKind | null
    // A menu or popover is the top layer: it pushes no scope, so its focused row would
    // otherwise pass the letter on to the list.
    isMenuOpen: boolean
}

// A batch key moves the chosen rows, or the drawer's transaction when none is chosen.
function canMove(state: ReviewKeyState, kind: BatchKind): boolean {
    if (!state.canWrite || state.isWriteBlocked || state.isBatchPending) return false
    return state.chosenCount > 0 || state.drawerAction === kind
}

// The tab keys always on a transaction tab; search while nothing is chosen (the selection
// bar takes the toolbar's place, search field included, while rows are chosen); movement
// with rows; open with a focused row; choosing for a writer on For review or Excluded
// while no batch runs; Exclude on For review and Move to For review on Excluded, for
// writers while the server takes writes; Esc while the drawer is open or rows are chosen.
// Nothing on the Files tab (the keys are not registered there) or while a menu is open.
export function offeredReviewKeys(state: ReviewKeyState): ReviewKeyAction[] {
    if (state.isMenuOpen || state.tab === 'files') return []
    const offered: ReviewKeyAction[] = [...TAB_ACTIONS]
    if (state.chosenCount === 0) offered.push('search')
    const hasRows = state.rowCount > 0
    if (hasRows) offered.push('next', 'previous')
    if (state.hasFocusedRow) offered.push('open')
    if (state.canChoose && hasRows && !state.isBatchPending) offered.push('toggle', 'toggleAll')
    if (state.tab === 'review' && canMove(state, 'exclude')) offered.push('exclude')
    if (state.tab === 'excluded' && canMove(state, 'restore')) offered.push('restore')
    if (state.isDrawerOpen || state.chosenCount > 0) offered.push('escape')
    return offered
}

// Plain Enter and Space press a focused row or check box itself (react-native-web's
// PressResponder). It stops Enter, and Space on a button, before the list sees them; for a
// Space it lets through, this keeps the list from handling the same key a second time.
const PRESS_KEYS = new Set(['Enter', 'Space'])
const PRESSABLE_SELECTOR = '[data-testid^="bank-review-row-"], [data-testid^="bank-review-check-"]'

function focusPressesKey(key: string): boolean {
    if (!PRESS_KEYS.has(key) || typeof document === 'undefined') return false
    const active = document.activeElement
    return (
        active !== null &&
        typeof active.matches === 'function' &&
        active.matches(PRESSABLE_SELECTOR)
    )
}

// Traced from every element that can hold focus when a key is pressed (lesson 25):
// - The page (nothing focused): the keys move the row stripe (`focusedTxnId` in the store),
//   not DOM focus, so no row Pressable receives a key.
// - A row or a check box focused by a mouse press: react-native-web presses a focused
//   Pressable on plain Enter / Space and stops Enter (and Space on a button) before core's
//   bubble-phase listener (lib/shortcuts/dispatch.ts), so until a movement key, Enter opens
//   that row and Space toggles that box, not the striped row. The movement keys (↓ ↑ J K)
//   drop DOM focus from any element that is not a text field (useReviewShortcuts
//   `releaseDomFocus`), so after one ↵ and Space reach the list and act on the striped
//   row. For a Space the element lets through, `when` is false there, so the key is not
//   handled twice. The letters (x, o) act on the striped row as from the page.
// - The search field: no shortcut sets `allowInInputs`, so a letter or `/` typed there
//   stays text; Escape in the field blurs it (SearchField), and the next key is the list's.
// - A focused button, tab or menu trigger (Exclude, Clear, a tab, Dates, Type): until a
//   movement key, plain Enter / Space press that element, not the striped row; after one,
//   focus is dropped and they reach the list. The other keys reach the list as from the
//   page.
// - An open PickMenu (Dates, Type) or the More menu: a menu pushes no scope, so `isMenuOpen`
//   (the top layer is not modal, read at press time) turns every review key off; the menu
//   keeps its arrows, letters and Escape.
// - The inline drawer (wide): it is not a layer, so its buttons behave as a focused button
//   and Esc closes it through this list's Escape.
// - `/` while rows are chosen: the selection bar replaces the toolbar and its search field,
//   so `search` is not offered then (and not listed in ⇧?).
// - The overlay drawer (tablet) and the sheet (phone): core pushes a `modal` scope, so no
//   list key fires; Esc is the layer's.
// - The ⇧? list: a modal scope, so no list key fires.
// - Core's global `/` (search across packages): an active scoped key beats a global one
//   with the same keys (core matcher `pickFiring`), so `/` focuses this search while a
//   transaction tab shows and opens core's search everywhere else.
// One shortcut per key of each offered action, because core's ⇧? list shows every
// registered key of the scope and does not read `when`; `when` re-checks the offer at
// press time.
export function reviewShortcuts(input: {
    id: string
    offered: readonly ReviewKeyAction[]
    read: () => ReviewKeyState
    run: Record<ReviewKeyAction, () => void>
}): Shortcut[] {
    const { id, offered, read, run } = input
    return REVIEW_ACTIONS.filter(action => offered.includes(action)).flatMap(action =>
        REVIEW_KEYS[action].map(key => ({
            id: `${id}.${action}.${key}`,
            keys: key,
            scope: 'list' as const,
            description: REVIEW_DESCRIPTIONS[action],
            group: GROUP,
            when: () => offeredReviewKeys(read()).includes(action) && !focusPressesKey(key),
            run: () => run[action](),
        }))
    )
}

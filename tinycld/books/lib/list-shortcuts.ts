import type { Shortcut } from '@tinycld/core/lib/shortcuts'
import type { ListArea } from './list-areas'

// The keys of a document list tab (spec docs/specs/sales-lists-design.md §3 "Keyboard";
// docs/specs/purchase-lists-design.md for the Expenses area). Pure, so the key map, which
// keys are offered and the shortcuts core registers are unit-tested. The pattern is
// lib/review-shortcuts.ts.

export type ListKeyAction =
    | 'search'
    | 'next'
    | 'previous'
    | 'open'
    | 'tick'
    | 'tickAll'
    | 'new'
    | 'tab1'
    | 'tab2'
    | 'tab3'
    | 'tab4'
    | 'tab5'
    | 'tab6'

// Key names as tinykeys reads them (core lib/shortcuts/matcher.ts): `event.key` or
// `event.code`, case ignored.
export const LIST_KEYS: Record<ListKeyAction, readonly string[]> = {
    search: ['/'],
    next: ['j', 'ArrowDown'],
    previous: ['k', 'ArrowUp'],
    open: ['Enter', 'o'],
    tick: ['x', 'Space'],
    tickAll: ['a'],
    new: ['n'],
    tab1: ['1'],
    tab2: ['2'],
    tab3: ['3'],
    tab4: ['4'],
    tab5: ['5'],
    tab6: ['6'],
}

const TAB_ACTIONS = ['tab1', 'tab2', 'tab3', 'tab4', 'tab5', 'tab6'] as const

type TabKeyAction = (typeof TAB_ACTIONS)[number]

// The ⇧? text of each action but the tab keys: a tab key reads its tab's label from the
// list area (`listShortcuts`' `tabLabels`).
export const LIST_KEY_LABELS: Record<Exclude<ListKeyAction, TabKeyAction>, string> = {
    search: 'Search',
    next: 'Next row',
    previous: 'Previous row',
    open: 'Open',
    tick: 'Select',
    tickAll: 'Select all',
    new: 'New',
}

const LIST_ACTIONS = Object.keys(LIST_KEYS) as ListKeyAction[]

function isTabAction(action: ListKeyAction): action is TabKeyAction {
    return (TAB_ACTIONS as readonly ListKeyAction[]).includes(action)
}

// The ⇧? text of an action. Offered tab keys are capped at the tab count
// (`offeredListKeys`), so each has its label.
function labelOf(action: ListKeyAction, tabLabels: readonly string[]): string {
    if (!isTabAction(action)) return LIST_KEY_LABELS[action]
    return tabLabels[TAB_ACTIONS.indexOf(action)]
}

// The `listShortcuts` input of a list area: its id prefix, ⇧? group and tab labels, in
// order. `useListShortcuts` appends its instance to the prefix.
export function listShortcutInput(area: ListArea): {
    idPrefix: string
    group: string
    tabLabels: string[]
} {
    return {
        idPrefix: `books.${area.key}.list`,
        group: area.shortcutGroup,
        tabLabels: area.tabs.map(tab => tab.label),
    }
}

// Beside a document, the row moves keep only their arrow keys.
const BESIDE_KEYS: Partial<Record<ListKeyAction, readonly string[]>> = {
    next: ['ArrowDown'],
    previous: ['ArrowUp'],
}

function keysOf(action: ListKeyAction, isBeside: boolean): readonly string[] {
    if (!isBeside) return LIST_KEYS[action]
    return BESIDE_KEYS[action] ?? LIST_KEYS[action]
}

export type ListKeyState = {
    // The tab's New action shows (a writer).
    showNew: boolean
    // The tick boxes show (a writer, in the full list; not in the 320 px column).
    showTicks: boolean
    hasRows: boolean
    tabCount: number
    // A menu of the screen is open (New, Batch actions, a row's): a menu pushes no scope,
    // so its focused item would otherwise pass a letter on to the list.
    isMenuOpen: boolean
    // A document is pushed over the list (below 1360 px), which stays mounted under it.
    isCovered: boolean
}

// Search and the tab keys always; the row keys with rows; the tick keys where the tick
// boxes show; New where the New action shows. Nothing while a menu is open or a document
// covers the list. Core's ⇧? list ignores `when`, so a key is offered (and registered)
// only while its action is.
export function offeredListKeys(state: ListKeyState): ListKeyAction[] {
    if (state.isMenuOpen || state.isCovered) return []
    const offered: ListKeyAction[] = ['search']
    if (state.hasRows) offered.push('next', 'previous', 'open')
    if (state.hasRows && state.showTicks) offered.push('tick', 'tickAll')
    if (state.showNew) offered.push('new')
    offered.push(...TAB_ACTIONS.slice(0, Math.max(0, state.tabCount)))
    return offered
}

// Traced from every element that can hold focus when a key is pressed:
// - The page or a row: the row focus is the store's (`focus` in `useDocumentListStore`),
//   never DOM focus, and each row's open button has `tabIndex={-1}` on the web, so plain
//   Enter and Space reach the list's `list` scope in the bubble phase and act on the
//   focused row. The tick box, the row menu and the header controls stay Tab stops and
//   press themselves on Enter and Space (react-native-web).
// - The search field: no shortcut sets `allowInInputs`, so `/` and the letters typed there
//   are text; Escape in the field blurs it (SearchField's `onKeyPress`).
// - An open menu (New, Batch actions, a row's, a PickMenu): it pushes no scope, so the
//   screen's menu (`isMenuOpen`) offers no key, and `when` turns the keys off at press time
//   while a non-modal layer is on top.
// - A dialog or the ⇧? list: a modal scope, so no list key fires.
// - A document pushed over the list: `isCovered` offers no key.
// - A document beside the 320 px column (`isBeside`): the list's scope stays active under
//   the document's `compose` scope, and on a key both own the document wins. The read
//   view owns J (View journal entry), so there next and previous are the arrow keys only,
//   which keeps the pair together.
//
// One shortcut per key of each offered action, because core's ⇧? list shows every
// registered key of the scope. `group` is the ⇧? group of the list area (its
// `shortcutGroup`) and `tabLabels` the labels of its tabs, in order.
export function listShortcuts(input: {
    idPrefix: string
    group: string
    tabLabels: readonly string[]
    offered: readonly ListKeyAction[]
    run: Record<ListKeyAction, () => void>
    isBeside: boolean
    // Read at press time; a key runs only while it is true.
    when?: () => boolean
}): Shortcut[] {
    const { idPrefix, group, tabLabels, offered, run, isBeside, when } = input
    return LIST_ACTIONS.filter(action => offered.includes(action)).flatMap(action =>
        keysOf(action, isBeside).map(key => ({
            id: `${idPrefix}.${action}.${key}`,
            keys: key,
            scope: 'list' as const,
            description: labelOf(action, tabLabels),
            group,
            when,
            run: () => run[action](),
        }))
    )
}

// The row one step from `current`: the first row from no focus or from a row that left
// the list, and the focus stays at either end. '' for an empty list.
export function movedFocus(ids: readonly string[], current: string, step: 1 | -1): string {
    if (ids.length === 0) return ''
    const index = ids.indexOf(current)
    if (index < 0) return ids[0]
    const next = Math.min(ids.length - 1, Math.max(0, index + step))
    return ids[next]
}

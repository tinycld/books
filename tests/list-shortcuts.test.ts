import type { Shortcut } from '@tinycld/core/lib/shortcuts/types'
import { describe, expect, it, type Mock, vi } from 'vitest'
import { listControls } from '../tinycld/books/lib/document-list'
import { LIST_AREAS } from '../tinycld/books/lib/list-areas'
import {
    LIST_KEY_LABELS,
    LIST_KEYS,
    type ListKeyAction,
    listShortcutInput,
    listShortcuts,
    movedFocus,
    offeredListKeys,
} from '../tinycld/books/lib/list-shortcuts'

// The Sales list keys (sales-lists checkpoint 5, spec §3 "Keyboard"): the key map, which
// keys are offered for a reader, the 320 px column, an empty list, an open menu and a
// document over the list, the shortcuts core registers (and lists in ⇧?), and the row focus
// move. Beside an open document (the 320 px column, `isBeside`) next and previous have
// only their arrow keys (sales-lists checkpoint 5 decision, 2026-11-17).

const TABS: ListKeyAction[] = ['tab1', 'tab2', 'tab3', 'tab4', 'tab5', 'tab6']
const ROW_KEYS: ListKeyAction[] = ['next', 'previous', 'open', 'tick', 'tickAll']

const ALL_ACTIONS: ListKeyAction[] = [
    'search',
    'next',
    'previous',
    'open',
    'tick',
    'tickAll',
    'new',
    ...TABS,
]

// A writer on a wide list with rows and six tabs, no menu open, no document over the list.
const WRITER = {
    showNew: true,
    showTicks: true,
    hasRows: true,
    tabCount: 6,
    isMenuOpen: false,
    isCovered: false,
}

const READER = { ...WRITER, showNew: false, showTicks: false }
// The 320 px column beside a document, for a writer.
const COLUMN = { ...WRITER, showNew: true, showTicks: false }

function sorted(actions: readonly string[]): string[] {
    return [...actions].sort()
}

function handlers(): Record<ListKeyAction, Mock<() => void>> {
    return Object.fromEntries(ALL_ACTIONS.map(action => [action, vi.fn<() => void>()])) as Record<
        ListKeyAction,
        Mock<() => void>
    >
}

function byKeys(shortcuts: Shortcut[], keys: string): Shortcut {
    const found = shortcuts.find(s => s.keys === keys)
    if (!found) throw new Error(`no shortcut for ${keys}`)
    return found
}

describe('LIST_KEYS', () => {
    it('maps each list action to its keys', () => {
        const expected: Record<ListKeyAction, string[]> = {
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
        expect(sorted(Object.keys(LIST_KEYS))).toEqual(sorted(ALL_ACTIONS))
        for (const action of ALL_ACTIONS) {
            expect(sorted(LIST_KEYS[action]), action).toEqual(sorted(expected[action]))
        }
    })

    // A tab key's text is its area's tab label only (fix round 1): the shared labels name
    // no tab, so no Sales tab name can stand in for a purchase tab.
    it('labels each action but the tab keys with its ⇧? text', () => {
        expect(LIST_KEY_LABELS).toEqual({
            search: 'Search',
            next: 'Next row',
            previous: 'Previous row',
            open: 'Open',
            tick: 'Select',
            tickAll: 'Select all',
            new: 'New',
        })
    })
})

describe('offeredListKeys', () => {
    it('offers a writer on a wide list every key', () => {
        expect(sorted(offeredListKeys(WRITER))).toEqual(sorted(ALL_ACTIONS))
    })

    it('offers a reader no tick, tickAll or new', () => {
        const offered = offeredListKeys(READER)
        expect(offered).not.toContain('tick')
        expect(offered).not.toContain('tickAll')
        expect(offered).not.toContain('new')
        expect(sorted(offered)).toEqual(sorted(['search', 'next', 'previous', 'open', ...TABS]))
    })

    it('offers a writer in the 320 px column new and no tick or tickAll', () => {
        const offered = offeredListKeys(COLUMN)
        expect(offered).toContain('new')
        expect(offered).not.toContain('tick')
        expect(offered).not.toContain('tickAll')
    })

    it('offers no next, previous, open, tick or tickAll with no rows', () => {
        const offered = offeredListKeys({ ...WRITER, hasRows: false })
        for (const action of ROW_KEYS) expect(offered, action).not.toContain(action)
        expect(sorted(offered)).toEqual(sorted(['search', 'new', ...TABS]))
    })

    it('gives tab1 to tab6 for six tabs', () => {
        const offered = offeredListKeys(WRITER)
        for (const tab of TABS) expect(offered, tab).toContain(tab)
    })

    it('offers nothing while a menu is open', () => {
        expect(offeredListKeys({ ...WRITER, isMenuOpen: true })).toEqual([])
    })

    it('offers nothing while a document covers the list', () => {
        expect(offeredListKeys({ ...WRITER, isCovered: true })).toEqual([])
    })
})

// What `useListShortcuts` passes for an area (the hook appends its instance segment to the
// id prefix): its group, the labels of its tabs and the id prefix `books.<area key>.list`.
describe('listShortcutInput', () => {
    it('gives Expenses the group Expenses, the purchase tab labels and books.purchases.list', () => {
        expect(listShortcutInput(LIST_AREAS.purchases)).toEqual({
            idPrefix: 'books.purchases.list',
            group: 'Expenses',
            tabLabels: [
                'All purchases',
                'Bills',
                'Expenses',
                'Bill payments',
                'Vendor credits',
                'Vendor refunds',
            ],
        })
    })

    it('gives Sales the group Sales, the sales tab labels and books.sales.list', () => {
        expect(listShortcutInput(LIST_AREAS.sales)).toEqual({
            idPrefix: 'books.sales.list',
            group: 'Sales',
            tabLabels: [
                'All sales',
                'Invoices',
                'Estimates',
                'Sales receipts',
                'Payments',
                'Credit memos',
            ],
        })
    })
})

// The Sales group and tab labels, for the tests of `listShortcuts` itself.
const SALES_INPUT = {
    group: LIST_AREAS.sales.shortcutGroup,
    tabLabels: LIST_AREAS.sales.tabs.map(tab => tab.label),
}

describe('listShortcuts per list area', () => {
    const TAB_KEYS = ['1', '2', '3', '4', '5', '6']

    it('builds the purchases keys in the group Expenses with the purchase tab labels', () => {
        const shortcuts = listShortcuts({
            ...listShortcutInput(LIST_AREAS.purchases),
            offered: offeredListKeys(WRITER),
            run: handlers(),
            isBeside: false,
        })
        expect(TAB_KEYS.map(key => byKeys(shortcuts, key).description)).toEqual([
            'All purchases',
            'Bills',
            'Expenses',
            'Bill payments',
            'Vendor credits',
            'Vendor refunds',
        ])
        for (const s of shortcuts) {
            expect(s.group, s.keys).toBe('Expenses')
            expect(s.id.startsWith('books.purchases.list.'), s.id).toBe(true)
        }
    })

    it('builds the sales keys in the group Sales with the sales tab labels, as before', () => {
        const shortcuts = listShortcuts({
            ...listShortcutInput(LIST_AREAS.sales),
            offered: offeredListKeys(WRITER),
            run: handlers(),
            isBeside: false,
        })
        expect(TAB_KEYS.map(key => byKeys(shortcuts, key).description)).toEqual([
            'All sales',
            'Invoices',
            'Estimates',
            'Sales receipts',
            'Payments',
            'Credit memos',
        ])
        for (const s of shortcuts) {
            expect(s.group, s.keys).toBe('Sales')
            expect(s.id.startsWith('books.sales.list.'), s.id).toBe(true)
        }
    })

    // The tick keys follow the tick boxes and New follows the New button, which
    // `listControls` gives per area.
    it.each([
        ['sales', LIST_AREAS.sales],
        ['purchases', LIST_AREAS.purchases],
    ] as const)('offers a %s reader no tick keys and no New, and a writer New', (_key, area) => {
        const writer = listControls(true, 'table', area)
        const reader = listControls(false, 'table', area)
        const writerKeys = offeredListKeys({ ...WRITER, ...writer })
        const readerKeys = offeredListKeys({ ...WRITER, ...reader })
        expect(readerKeys).not.toContain('tick')
        expect(readerKeys).not.toContain('tickAll')
        expect(readerKeys).not.toContain('new')
        expect(writerKeys).toContain('new')
    })

    // The tab keys are capped at the tab count, so each offered tab key has its own label.
    it('labels the tab keys with the given tab labels only, one key per tab', () => {
        const shortcuts = listShortcuts({
            idPrefix: 'books.test.list',
            group: 'Test',
            tabLabels: ['First tab', 'Second tab'],
            offered: offeredListKeys({ ...WRITER, tabCount: 2 }),
            run: handlers(),
            isBeside: false,
        })
        expect(byKeys(shortcuts, '1').description).toBe('First tab')
        expect(byKeys(shortcuts, '2').description).toBe('Second tab')
        for (const key of ['3', '4', '5', '6']) {
            expect(
                shortcuts.map(s => s.keys),
                key
            ).not.toContain(key)
        }
    })

    it('offers a purchases writer on the table no tick keys and a sales writer both', () => {
        const purchases = offeredListKeys({
            ...WRITER,
            ...listControls(true, 'table', LIST_AREAS.purchases),
        })
        expect(purchases).not.toContain('tick')
        expect(purchases).not.toContain('tickAll')
        const sales = offeredListKeys({
            ...WRITER,
            ...listControls(true, 'table', LIST_AREAS.sales),
        })
        expect(sales).toContain('tick')
        expect(sales).toContain('tickAll')
    })
})

describe('listShortcuts', () => {
    const PREFIX = 'books.sales.list.invoices'

    it('builds one shortcut per key of each offered action, in the list scope', () => {
        const offered = offeredListKeys(WRITER)
        const shortcuts = listShortcuts({
            idPrefix: PREFIX,
            group: SALES_INPUT.group,
            tabLabels: SALES_INPUT.tabLabels,
            offered,
            run: handlers(),
            isBeside: false,
        })
        const expectedKeys = offered.flatMap(action => [...LIST_KEYS[action]])
        expect(sorted(shortcuts.map(s => s.keys))).toEqual(sorted(expectedKeys))
        expect(Object.fromEntries(shortcuts.map(s => [s.keys, s.description]))).toEqual({
            '/': 'Search',
            j: 'Next row',
            ArrowDown: 'Next row',
            k: 'Previous row',
            ArrowUp: 'Previous row',
            Enter: 'Open',
            o: 'Open',
            x: 'Select',
            Space: 'Select',
            a: 'Select all',
            n: 'New',
            '1': 'All sales',
            '2': 'Invoices',
            '3': 'Estimates',
            '4': 'Sales receipts',
            '5': 'Payments',
            '6': 'Credit memos',
        })
        for (const s of shortcuts) {
            expect(s.scope, s.keys).toBe('list')
            expect(s.group, s.keys).toBe('Sales')
            expect(s.allowInInputs, s.keys).toBeFalsy()
            expect(s.id.startsWith(PREFIX), s.id).toBe(true)
        }
        expect(new Set(shortcuts.map(s => s.id)).size).toBe(shortcuts.length)
    })

    it('builds no shortcut for an action that is not offered', () => {
        const shortcuts = listShortcuts({
            idPrefix: PREFIX,
            group: SALES_INPUT.group,
            tabLabels: SALES_INPUT.tabLabels,
            offered: offeredListKeys(READER),
            run: handlers(),
            isBeside: false,
        })
        const keys = shortcuts.map(s => s.keys)
        for (const key of [...LIST_KEYS.tick, ...LIST_KEYS.tickAll, ...LIST_KEYS.new]) {
            expect(keys, key).not.toContain(key)
        }
        expect(
            listShortcuts({
                idPrefix: PREFIX,
                group: SALES_INPUT.group,
                tabLabels: SALES_INPUT.tabLabels,
                offered: [],
                run: handlers(),
                isBeside: false,
            })
        ).toEqual([])
    })

    it('registers j and ArrowDown for next and k and ArrowUp for previous on the list', () => {
        const shortcuts = listShortcuts({
            idPrefix: PREFIX,
            group: SALES_INPUT.group,
            tabLabels: SALES_INPUT.tabLabels,
            offered: offeredListKeys(WRITER),
            run: handlers(),
            isBeside: false,
        })
        const keysOf = (description: string) =>
            sorted(shortcuts.filter(s => s.description === description).map(s => s.keys))
        expect(keysOf('Next row')).toEqual(sorted(['j', 'ArrowDown']))
        expect(keysOf('Previous row')).toEqual(sorted(['k', 'ArrowUp']))
    })

    // Beside an open document the document owns J (View journal entry), so the column
    // moves with the arrows only, and K goes with J.
    it('registers only ArrowDown for next and ArrowUp for previous beside a document', () => {
        const run = handlers()
        const shortcuts = listShortcuts({
            idPrefix: PREFIX,
            group: SALES_INPUT.group,
            tabLabels: SALES_INPUT.tabLabels,
            offered: offeredListKeys(COLUMN),
            run,
            isBeside: true,
        })
        const keys = shortcuts.map(s => s.keys)
        expect(keys).not.toContain('j')
        expect(keys).not.toContain('k')
        expect(keys.filter(k => k === 'ArrowDown')).toHaveLength(1)
        expect(keys.filter(k => k === 'ArrowUp')).toHaveLength(1)
        byKeys(shortcuts, 'ArrowDown').run({ keys: 'ArrowDown' })
        expect(run.next).toHaveBeenCalledTimes(1)
        byKeys(shortcuts, 'ArrowUp').run({ keys: 'ArrowUp' })
        expect(run.previous).toHaveBeenCalledTimes(1)
        // Every other offered key of the column keeps its keys.
        const others = offeredListKeys(COLUMN).filter(a => a !== 'next' && a !== 'previous')
        const expectedKeys = [
            'ArrowDown',
            'ArrowUp',
            ...others.flatMap(action => [...LIST_KEYS[action]]),
        ]
        expect(sorted(keys)).toEqual(sorted(expectedKeys))
        for (const key of ['/', 'Enter', 'o', 'n', '1', '2', '3', '4', '5', '6']) {
            expect(keys, key).toContain(key)
        }
    })

    it('runs the handler of its own action', () => {
        const run = handlers()
        const shortcuts = listShortcuts({
            idPrefix: PREFIX,
            group: SALES_INPUT.group,
            tabLabels: SALES_INPUT.tabLabels,
            offered: ALL_ACTIONS,
            run,
            isBeside: false,
        })
        byKeys(shortcuts, 'Space').run({ keys: 'Space' })
        expect(run.tick).toHaveBeenCalledTimes(1)
        byKeys(shortcuts, 'ArrowUp').run({ keys: 'ArrowUp' })
        expect(run.previous).toHaveBeenCalledTimes(1)
        byKeys(shortcuts, '4').run({ keys: '4' })
        expect(run.tab4).toHaveBeenCalledTimes(1)
        for (const action of ALL_ACTIONS) {
            if (action === 'tick' || action === 'previous' || action === 'tab4') continue
            expect(run[action], action).not.toHaveBeenCalled()
        }
    })
})

describe('movedFocus', () => {
    const IDS = ['a1', 'b2', 'c3']

    it('goes to the first id from no focus', () => {
        expect(movedFocus(IDS, '', 1)).toBe('a1')
    })

    it('moves one row each way', () => {
        expect(movedFocus(IDS, 'a1', 1)).toBe('b2')
        expect(movedFocus(IDS, 'c3', -1)).toBe('b2')
    })

    it('stops at both ends', () => {
        expect(movedFocus(IDS, 'c3', 1)).toBe('c3')
        expect(movedFocus(IDS, 'a1', -1)).toBe('a1')
    })

    it('returns the first id when the focused id left the list', () => {
        expect(movedFocus(IDS, 'gone', 1)).toBe('a1')
        expect(movedFocus(IDS, 'gone', -1)).toBe('a1')
    })
})

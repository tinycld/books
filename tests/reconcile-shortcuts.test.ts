import { describe, expect, it, type Mock, vi } from 'vitest'
import {
    offeredReconcileKeys,
    RECONCILE_KEYS,
    type ReconcileKeyAction,
    type ReconcileKeyState,
    reconcileShortcuts,
} from '../tinycld/books/lib/reconcile-shortcuts'

// The work screen's pure key map (reconcile spec §3 "Keys"; plan checkpoint 3). The tests
// read keys, not action names: an action is the group of keys that do one thing.

// A writer with rows shown and one focused, matched rows not cleared, text in the search,
// no batch running, the server taking writes and no menu open: every key is offered.
const WRITER: ReconcileKeyState = {
    canWrite: true,
    isBatchRunning: false,
    isWriteBlocked: false,
    rowCount: 5,
    hasFocusedRow: true,
    matchedCount: 2,
    hasSearchText: true,
    isMenuOpen: false,
}

const READER: ReconcileKeyState = { ...WRITER, canWrite: false }

const ALL_ACTIONS = Object.keys(RECONCILE_KEYS) as ReconcileKeyAction[]

const CLEAR_KEYS = ['x', 'Space', 'a', 'm']
const MOVE_KEYS = ['ArrowDown', 'j', 'ArrowUp', 'k']
const FILTER_KEYS = ['/', '1', '2', '3']

function keysOf(state: ReconcileKeyState): string[] {
    return offeredReconcileKeys(state).flatMap(action => [...RECONCILE_KEYS[action]])
}

function groups(): string[][] {
    return Object.values(RECONCILE_KEYS)
        .map(keys => [...keys].sort())
        .sort((a, b) => a.join(' ').localeCompare(b.join(' ')))
}

function expectedGroups(list: string[][]): string[][] {
    return list.map(keys => [...keys].sort()).sort((a, b) => a.join(' ').localeCompare(b.join(' ')))
}

describe('RECONCILE_KEYS', () => {
    it('gives each action the keys of the spec', () => {
        expect(groups()).toEqual(
            expectedGroups([
                ['ArrowDown', 'j'],
                ['ArrowUp', 'k'],
                ['Space', 'x'],
                ['Enter', 'o'],
                ['a'],
                ['m'],
                ['/'],
                ['1'],
                ['2'],
                ['3'],
                ['Escape'],
            ])
        )
    })

    it('registers no key twice', () => {
        const keys = Object.values(RECONCILE_KEYS).flatMap(list => list.map(k => k.toLowerCase()))
        expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([])
    })
})

describe('offeredReconcileKeys', () => {
    it('offers a writer every key when every condition holds', () => {
        expect(keysOf(WRITER).sort()).toEqual(
            Object.values(RECONCILE_KEYS)
                .flatMap(keys => [...keys])
                .sort()
        )
    })

    it('gives a reader no clear key, but the movement and filter keys', () => {
        const keys = keysOf(READER)
        for (const key of CLEAR_KEYS) expect(keys, key).not.toContain(key)
        for (const key of [...MOVE_KEYS, ...FILTER_KEYS]) expect(keys, key).toContain(key)
    })

    it('gives no clear key while a batch runs', () => {
        const keys = keysOf({ ...WRITER, isBatchRunning: true })
        for (const key of CLEAR_KEYS) expect(keys, key).not.toContain(key)
        for (const key of [...MOVE_KEYS, ...FILTER_KEYS]) expect(keys, key).toContain(key)
    })

    it('gives no clear key while the server cannot take writes', () => {
        const keys = keysOf({ ...WRITER, isWriteBlocked: true })
        for (const key of CLEAR_KEYS) expect(keys, key).not.toContain(key)
        for (const key of [...MOVE_KEYS, ...FILTER_KEYS]) expect(keys, key).toContain(key)
    })

    it('offers M only while a matched row is not cleared', () => {
        expect(keysOf({ ...WRITER, matchedCount: 0 })).not.toContain('m')
        expect(keysOf({ ...WRITER, matchedCount: 1 })).toContain('m')
    })

    it('offers Esc only while the search has text', () => {
        expect(keysOf({ ...WRITER, hasSearchText: false })).not.toContain('Escape')
        expect(keysOf({ ...WRITER, hasSearchText: true })).toContain('Escape')
    })

    it('offers no key while a menu is open', () => {
        expect(offeredReconcileKeys({ ...WRITER, isMenuOpen: true })).toEqual([])
        expect(offeredReconcileKeys({ ...READER, isMenuOpen: true })).toEqual([])
    })

    it('offers no movement key with no row', () => {
        const keys = keysOf({ ...WRITER, rowCount: 0, hasFocusedRow: false })
        for (const key of MOVE_KEYS) expect(keys, key).not.toContain(key)
        for (const key of FILTER_KEYS) expect(keys, key).toContain(key)
    })
})

describe('reconcileShortcuts', () => {
    function build(state: ReconcileKeyState) {
        const run = Object.fromEntries(
            ALL_ACTIONS.map(action => [action, vi.fn<() => void>()])
        ) as Record<ReconcileKeyAction, Mock<() => void>>
        return reconcileShortcuts({
            id: 'books.reconcile.work.r1',
            offered: offeredReconcileKeys(state),
            read: () => state,
            run,
        })
    }

    it('puts every key, / too, in the list scope and none in the global scope', () => {
        const shortcuts = build(WRITER)
        expect(shortcuts.map(s => s.keys).sort()).toEqual(
            Object.values(RECONCILE_KEYS)
                .flatMap(keys => [...keys])
                .sort()
        )
        const slash = shortcuts.find(s => s.keys === '/')
        expect(slash?.scope).toBe('list')
        for (const shortcut of shortcuts) {
            expect(shortcut.scope, shortcut.keys).toBe('list')
            expect(shortcut.scope, shortcut.keys).not.toBe('global')
        }
    })

    it('builds a key only for an offered action', () => {
        const keys = build(READER).map(s => s.keys)
        for (const key of CLEAR_KEYS) expect(keys, key).not.toContain(key)
    })
})

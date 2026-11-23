import { describe, expect, it } from 'vitest'
import {
    addShortcut,
    canAddShortcut,
    DEFAULT_SHORTCUTS,
    hasShortcut,
    MAX_SHORTCUTS,
    moveShortcut,
    parseShortcuts,
    placeShortcut,
    removeShortcut,
    type Shortcut,
    shortcutKey,
} from '../tinycld/books/lib/sidebar-shortcuts'

const A: Shortcut = { kind: 'screen', ref: 'customers' }
const B: Shortcut = { kind: 'new', ref: 'invoice' }
const C: Shortcut = { kind: 'report', ref: 'books.balance_sheet' }
const D: Shortcut = { kind: 'register', ref: 'acct00000000001' }

function many(count: number): Shortcut[] {
    return Array.from({ length: count }, (_, i) => ({ kind: 'register', ref: `account-${i}` }))
}

describe('parseShortcuts', () => {
    it('reads a stored list in its order', () => {
        expect(parseShortcuts([B, A, D, C])).toEqual([B, A, D, C])
    })

    it('reads a value that is not a list as no shortcuts', () => {
        for (const value of [null, undefined, '', 'x', 7, {}, { 0: A }]) {
            expect(parseShortcuts(value)).toEqual([])
        }
    })

    it('drops an item that is not a shortcut and keeps the rest', () => {
        const stored = [
            A,
            null,
            'screen:customers',
            { kind: 'bookmark', ref: 'x' },
            { kind: 'screen' },
            { kind: 'screen', ref: '' },
            { kind: 'screen', ref: 7 },
            { kind: 'screen', ref: 'x'.repeat(101) },
            B,
        ]
        expect(parseShortcuts(stored)).toEqual([A, B])
    })

    it('keeps only the kind and the ref of an item', () => {
        expect(parseShortcuts([{ ...A, label: 'Mine', extra: { deep: true } }])).toEqual([A])
    })

    it('keeps the first of two equal items', () => {
        expect(parseShortcuts([A, B, { ...A }, B])).toEqual([A, B])
    })

    it('keeps two kinds with the same ref', () => {
        const screen: Shortcut = { kind: 'screen', ref: 'x' }
        const report: Shortcut = { kind: 'report', ref: 'x' }
        expect(parseShortcuts([screen, report])).toEqual([screen, report])
    })

    it('stops at the limit', () => {
        const parsed = parseShortcuts(many(MAX_SHORTCUTS + 5))
        expect(parsed).toHaveLength(MAX_SHORTCUTS)
        expect(parsed).toEqual(many(MAX_SHORTCUTS))
    })
})

describe('DEFAULT_SHORTCUTS', () => {
    it('is a valid list with no repeat', () => {
        expect(parseShortcuts([...DEFAULT_SHORTCUTS])).toEqual([...DEFAULT_SHORTCUTS])
        expect(DEFAULT_SHORTCUTS.length).toBeGreaterThan(0)
    })
})

describe('addShortcut', () => {
    it('adds at the end and leaves the given list as it was', () => {
        const list = [A, B]
        expect(addShortcut(list, C)).toEqual([A, B, C])
        expect(list).toEqual([A, B])
    })

    it('does not add a shortcut that is in the list', () => {
        expect(addShortcut([A, B], { ...A })).toEqual([A, B])
        expect(hasShortcut([A, B], { ...A })).toBe(true)
        expect(hasShortcut([A, B], C)).toBe(false)
    })

    it('does not add to a full list', () => {
        const full = many(MAX_SHORTCUTS)
        expect(canAddShortcut(full)).toBe(false)
        expect(canAddShortcut(many(MAX_SHORTCUTS - 1))).toBe(true)
        expect(addShortcut(full, A)).toEqual(full)
    })
})

describe('removeShortcut', () => {
    it('removes by key', () => {
        expect(removeShortcut([A, B, C], shortcutKey(B))).toEqual([A, C])
    })

    it('removes the last one, leaving an empty list', () => {
        expect(removeShortcut([A], shortcutKey(A))).toEqual([])
    })

    it('returns the same items for a key that is not in the list', () => {
        expect(removeShortcut([A, B], shortcutKey(C))).toEqual([A, B])
    })
})

describe('moveShortcut and placeShortcut', () => {
    it('moves one place up and one place down', () => {
        expect(moveShortcut([A, B, C], shortcutKey(B), -1)).toEqual([B, A, C])
        expect(moveShortcut([A, B, C], shortcutKey(B), 1)).toEqual([A, C, B])
    })

    it('keeps the first at the top and the last at the bottom', () => {
        expect(moveShortcut([A, B, C], shortcutKey(A), -1)).toEqual([A, B, C])
        expect(moveShortcut([A, B, C], shortcutKey(C), 1)).toEqual([A, B, C])
    })

    it('places at an index and clamps an index outside the list', () => {
        expect(placeShortcut([A, B, C, D], shortcutKey(A), 2)).toEqual([B, C, A, D])
        expect(placeShortcut([A, B, C, D], shortcutKey(D), 0)).toEqual([D, A, B, C])
        expect(placeShortcut([A, B, C], shortcutKey(A), 99)).toEqual([B, C, A])
        expect(placeShortcut([A, B, C], shortcutKey(C), -4)).toEqual([C, A, B])
    })

    it('returns the same items for a key that is not in the list', () => {
        expect(moveShortcut([A, B], shortcutKey(C), 1)).toEqual([A, B])
        expect(placeShortcut([A, B], shortcutKey(C), 0)).toEqual([A, B])
    })

    it('leaves the given list as it was', () => {
        const list = [A, B, C]
        moveShortcut(list, shortcutKey(A), 1)
        placeShortcut(list, shortcutKey(A), 2)
        expect(list).toEqual([A, B, C])
    })
})

import type { Shortcut } from '@tinycld/core/lib/shortcuts/types'
import { describe, expect, it, vi } from 'vitest'
import {
    offeredReviewKeys,
    REVIEW_KEYS,
    type ReviewKeyAction,
    type ReviewKeyState,
    reviewShortcuts,
} from '../tinycld/books/lib/review-shortcuts'

const TABS: ReviewKeyAction[] = ['tabReview', 'tabReviewed', 'tabExcluded', 'tabFiles']
const MOVE: ReviewKeyAction[] = ['next', 'previous']
const CHOOSE: ReviewKeyAction[] = ['toggle', 'toggleAll']

// A writer on For review with three rows, nothing chosen, the drawer closed and no row focused.
const WRITER: ReviewKeyState = {
    tab: 'review',
    canWrite: true,
    canChoose: true,
    isBatchPending: false,
    isWriteBlocked: false,
    rowCount: 3,
    chosenCount: 0,
    hasFocusedRow: false,
    isDrawerOpen: false,
    drawerAction: null,
    isMenuOpen: false,
}

const READER: ReviewKeyState = { ...WRITER, canWrite: false, canChoose: false }

const DESCRIPTIONS: Record<ReviewKeyAction, string> = {
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

const ALL_ACTIONS = Object.keys(DESCRIPTIONS) as ReviewKeyAction[]

function sorted(actions: readonly ReviewKeyAction[]): ReviewKeyAction[] {
    return [...actions].sort()
}

function offered(state: ReviewKeyState): ReviewKeyAction[] {
    return sorted(offeredReviewKeys(state))
}

function handlers(): Record<ReviewKeyAction, ReturnType<typeof vi.fn>> {
    return Object.fromEntries(ALL_ACTIONS.map(action => [action, vi.fn()])) as Record<
        ReviewKeyAction,
        ReturnType<typeof vi.fn>
    >
}

function byKeys(shortcuts: Shortcut[], keys: string): Shortcut {
    const found = shortcuts.find(s => s.keys === keys)
    if (!found) throw new Error(`no shortcut for ${keys}`)
    return found
}

describe('REVIEW_KEYS', () => {
    it('maps each review action to its keys', () => {
        expect(REVIEW_KEYS).toEqual({
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
        })
    })
})

describe('offeredReviewKeys', () => {
    it('(a) offers a writer on For review the tabs, search, movement and choosing', () => {
        expect(offered(WRITER)).toEqual(sorted([...TABS, 'search', ...MOVE, ...CHOOSE]))
    })

    it('(b) adds Exclude and Esc once rows are chosen, and drops search', () => {
        // The selection bar replaces the toolbar, so there is no search field to focus.
        expect(offered({ ...WRITER, chosenCount: 2 })).toEqual(
            sorted([...TABS, ...MOVE, ...CHOOSE, 'exclude', 'escape'])
        )
    })

    it('(c) offers Exclude and Esc for the open drawer’s transaction with none chosen', () => {
        expect(offered({ ...WRITER, isDrawerOpen: true, drawerAction: 'exclude' })).toEqual(
            sorted([...TABS, 'search', ...MOVE, ...CHOOSE, 'exclude', 'escape'])
        )
        expect(
            offered({ ...WRITER, isDrawerOpen: true, drawerAction: 'exclude', chosenCount: 1 })
        ).toEqual(sorted([...TABS, ...MOVE, ...CHOOSE, 'exclude', 'escape']))
    })

    it('(d) withholds choosing and Exclude while a batch runs', () => {
        const busy = offered({ ...WRITER, chosenCount: 2, isBatchPending: true })
        expect(busy).not.toContain('toggle')
        expect(busy).not.toContain('toggleAll')
        expect(busy).not.toContain('exclude')
        expect(busy).toEqual(sorted([...TABS, ...MOVE, 'escape']))
    })

    it('(e) withholds Exclude while the server takes no writes', () => {
        const blocked = offered({ ...WRITER, chosenCount: 2, isWriteBlocked: true })
        expect(blocked).not.toContain('exclude')
        expect(blocked).toEqual(sorted([...TABS, ...MOVE, ...CHOOSE, 'escape']))
        expect(
            offered({
                ...WRITER,
                isDrawerOpen: true,
                drawerAction: 'exclude',
                isWriteBlocked: true,
            })
        ).not.toContain('exclude')
    })

    it('(f) offers a reader only the tabs, search, movement and open', () => {
        expect(offered({ ...READER, hasFocusedRow: true })).toEqual(
            sorted([...TABS, 'search', ...MOVE, 'open'])
        )
        expect(offered(READER)).toEqual(sorted([...TABS, 'search', ...MOVE]))
    })

    it('offers open only when a row is focused', () => {
        expect(offered(WRITER)).not.toContain('open')
        expect(offered({ ...WRITER, hasFocusedRow: true })).toContain('open')
    })

    it('(g) offers Move to For review, not Exclude, on Excluded with a row chosen', () => {
        const state: ReviewKeyState = { ...WRITER, tab: 'excluded', chosenCount: 1 }
        expect(offered(state)).toEqual(sorted([...TABS, ...MOVE, ...CHOOSE, 'restore', 'escape']))
        expect(
            offered({ ...WRITER, tab: 'excluded', isDrawerOpen: true, drawerAction: 'restore' })
        ).toContain('restore')
        expect(
            offered({ ...WRITER, tab: 'excluded', isDrawerOpen: true, drawerAction: 'restore' })
        ).not.toContain('exclude')
    })

    it('(h) offers no choosing, Exclude or Move to For review on Reviewed', () => {
        const reviewed: ReviewKeyState = {
            ...WRITER,
            tab: 'reviewed',
            canChoose: false,
            hasFocusedRow: true,
            isDrawerOpen: true,
        }
        expect(offered(reviewed)).toEqual(sorted([...TABS, 'search', ...MOVE, 'open', 'escape']))
        // Even a stale choice gives Reviewed no batch key: Exclude belongs to For review and
        // Move to For review to Excluded.
        const stale = offered({ ...reviewed, chosenCount: 1 })
        expect(stale).not.toContain('exclude')
        expect(stale).not.toContain('restore')
        expect(stale).not.toContain('toggle')
        expect(stale).not.toContain('toggleAll')
    })

    it('offers search only while nothing is chosen, so the toolbar shows', () => {
        expect(offered(WRITER)).toContain('search')
        expect(offered({ ...WRITER, chosenCount: 1 })).not.toContain('search')
        expect(offered({ ...WRITER, tab: 'excluded', chosenCount: 3 })).not.toContain('search')
        expect(offered({ ...WRITER, rowCount: 0 })).toContain('search')
    })

    it('(i) offers no movement or choosing with no rows', () => {
        expect(offered({ ...WRITER, rowCount: 0 })).toEqual(sorted([...TABS, 'search']))
    })

    it('(j) offers nothing while a menu is open', () => {
        expect(offeredReviewKeys({ ...WRITER, chosenCount: 2, isMenuOpen: true })).toEqual([])
    })

    it('(k) offers nothing on the Files tab', () => {
        expect(offeredReviewKeys({ ...WRITER, tab: 'files' })).toEqual([])
    })
})

describe('reviewShortcuts', () => {
    function build(offeredActions: readonly ReviewKeyAction[], initial: ReviewKeyState) {
        const state = { current: initial }
        const run = handlers()
        const shortcuts = reviewShortcuts({
            id: 'books.banking.review.r1',
            offered: offeredActions,
            read: () => state.current,
            run,
        })
        return { state, run, shortcuts }
    }

    const CHOSEN: ReviewKeyState = { ...WRITER, chosenCount: 2, hasFocusedRow: true }

    it('builds one shortcut per key of each offered action, in the list scope', () => {
        const actions = offeredReviewKeys(CHOSEN)
        const { shortcuts } = build(actions, CHOSEN)
        const expectedKeys = actions.flatMap(action => [...REVIEW_KEYS[action]]).sort()
        expect(shortcuts.map(s => s.keys).sort()).toEqual(expectedKeys)
        expect(shortcuts.filter(s => s.keys === 'ArrowDown' || s.keys === 'j')).toHaveLength(2)
        expect(byKeys(shortcuts, 'ArrowDown').description).toBe('Next transaction')
        expect(byKeys(shortcuts, 'j').description).toBe('Next transaction')
        for (const s of shortcuts) {
            expect(s.scope, s.keys).toBe('list')
            expect(s.group, s.keys).toBe('Banking')
            expect(s.allowInInputs, s.keys).toBeFalsy()
            expect(s.id.startsWith('books.banking.review.r1'), s.id).toBe(true)
        }
        expect(new Set(shortcuts.map(s => s.id)).size).toBe(shortcuts.length)
    })

    it('describes every key of every action', () => {
        const { shortcuts } = build(ALL_ACTIONS, CHOSEN)
        for (const action of ALL_ACTIONS) {
            for (const key of REVIEW_KEYS[action]) {
                expect(byKeys(shortcuts, key).description, key).toBe(DESCRIPTIONS[action])
            }
        }
    })

    it('builds a key only for an offered action', () => {
        const { shortcuts } = build(['search'], WRITER)
        expect(shortcuts.map(s => s.keys)).toEqual(['/'])
        expect(build([], WRITER).shortcuts).toEqual([])
    })

    it('runs the handler of its own action', () => {
        const { run, shortcuts } = build(ALL_ACTIONS, CHOSEN)
        byKeys(shortcuts, 'k').run({ keys: 'k' })
        expect(run.previous).toHaveBeenCalledTimes(1)
        byKeys(shortcuts, 'Space').run({ keys: 'Space' })
        expect(run.toggle).toHaveBeenCalledTimes(1)
        byKeys(shortcuts, '3').run({ keys: '3' })
        expect(run.tabExcluded).toHaveBeenCalledTimes(1)
        for (const action of ALL_ACTIONS) {
            if (action === 'previous' || action === 'toggle' || action === 'tabExcluded') continue
            expect(run[action], action).not.toHaveBeenCalled()
        }
    })

    it('turns `when` false once read() no longer offers the action', () => {
        const { state, shortcuts } = build(offeredReviewKeys(CHOSEN), CHOSEN)
        const exclude = byKeys(shortcuts, 'e')
        const escapeKey = byKeys(shortcuts, 'Escape')
        const toggle = byKeys(shortcuts, 'x')
        const next = byKeys(shortcuts, 'j')
        expect(exclude.when).toBeTypeOf('function')
        expect(exclude.when?.()).toBe(true)
        expect(escapeKey.when?.()).toBe(true)
        expect(toggle.when?.()).toBe(true)
        expect(next.when?.()).toBe(true)

        // The choice cleared: Exclude and Esc are no longer offered.
        state.current = { ...CHOSEN, chosenCount: 0 }
        expect(exclude.when?.()).toBe(false)
        expect(escapeKey.when?.()).toBe(false)
        expect(toggle.when?.()).toBe(true)

        // A batch runs: choosing stops too.
        state.current = { ...CHOSEN, isBatchPending: true }
        expect(toggle.when?.()).toBe(false)
        expect(exclude.when?.()).toBe(false)
        expect(next.when?.()).toBe(true)

        // A menu opened: nothing fires.
        state.current = { ...CHOSEN, isMenuOpen: true }
        for (const s of shortcuts) expect(s.when?.(), s.keys).toBe(false)

        state.current = CHOSEN
        expect(exclude.when?.()).toBe(true)
    })

    it('turns the search key off once a row is chosen', () => {
        const { state, shortcuts } = build(offeredReviewKeys(WRITER), WRITER)
        const search = byKeys(shortcuts, '/')
        expect(search.when?.()).toBe(true)
        state.current = { ...WRITER, chosenCount: 1 }
        expect(search.when?.()).toBe(false)
        expect(offeredReviewKeys(state.current)).not.toContain('search')
    })
})

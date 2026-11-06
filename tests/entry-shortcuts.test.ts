import { createMatcher } from '@tinycld/core/lib/shortcuts/matcher'
import { useShortcutRegistry } from '@tinycld/core/lib/shortcuts/registry'
import { popScope, pushScope, resetScopes } from '@tinycld/core/lib/shortcuts/scopes'
import type { Shortcut } from '@tinycld/core/lib/shortcuts/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EntryActionId } from '../tinycld/books/lib/entry-actions'
import {
    FORM_KEYS,
    type FormKeyAction,
    type FormKeyState,
    formKeyAvailable,
    formShortcuts,
    READ_KEYS,
    type ReadKeyAction,
    type ReadKeyState,
    readKeyAvailable,
    readShortcuts,
} from '../tinycld/books/lib/entry-shortcuts'

const FORM_ACTIONS: FormKeyAction[] = ['post', 'postAndNew', 'saveDraft', 'cancel', 'deleteDraft']
const READ_ACTIONS: ReadKeyAction[] = ['edit', 'void', 'reverse']

const FORM_DESCRIPTIONS: Record<FormKeyAction, string> = {
    post: 'Post',
    postAndNew: 'Post & new',
    saveDraft: 'Save draft',
    cancel: 'Cancel',
    deleteDraft: 'Delete draft',
}

const READ_DESCRIPTIONS: Record<ReadKeyAction, string> = {
    edit: 'Edit',
    void: 'Void',
    reverse: 'Reverse',
}

const IDLE: FormKeyState = { isPending: false, isWriteBlocked: false, hasDraft: false }
const IDLE_DRAFT: FormKeyState = { ...IDLE, hasDraft: true }
// A writer on a posted journal entry, and on a posted transfer (never Reverse).
const ENTRY_ACTIONS = ['open', 'edit', 'reverse', 'void'] as const
const TRANSFER_ACTIONS = ['open', 'edit', 'void'] as const

function formHandlers() {
    return {
        post: vi.fn(),
        postAndNew: vi.fn(),
        saveDraft: vi.fn(),
        cancel: vi.fn(),
        deleteDraft: vi.fn(),
    }
}

function readHandlers() {
    return { edit: vi.fn(), void: vi.fn(), reverse: vi.fn() }
}

function byKeys(shortcuts: Shortcut[], keys: string): Shortcut {
    const found = shortcuts.find(s => s.keys === keys)
    if (!found) throw new Error(`no shortcut for ${keys}`)
    return found
}

function availability(state: FormKeyState) {
    return Object.fromEntries(FORM_ACTIONS.map(a => [a, formKeyAvailable(a, state)]))
}

function registerStamped(shortcuts: Shortcut[], scopeId: number) {
    for (const s of shortcuts) useShortcutRegistry.getState().register({ ...s, scopeId })
}

function clearRegistry() {
    const state = useShortcutRegistry.getState()
    for (const id of Array.from(state.shortcuts.keys())) state.unregister(id)
}

afterEach(() => {
    clearRegistry()
    resetScopes()
})

describe('FORM_KEYS and READ_KEYS', () => {
    it('map each action to its key', () => {
        expect(FORM_KEYS).toEqual({
            post: '$mod+Enter',
            postAndNew: '$mod+Shift+Enter',
            saveDraft: '$mod+s',
            cancel: 'Escape',
            deleteDraft: '$mod+Backspace',
        })
        expect(READ_KEYS).toEqual({ edit: 'e', void: 'v', reverse: 'r' })
    })
})

describe('formKeyAvailable', () => {
    it('offers every key but Delete draft on an idle form with no draft', () => {
        expect(availability(IDLE)).toEqual({
            post: true,
            postAndNew: true,
            saveDraft: true,
            cancel: true,
            deleteDraft: false,
        })
    })

    it('offers all five keys on an idle saved draft', () => {
        expect(availability(IDLE_DRAFT)).toEqual({
            post: true,
            postAndNew: true,
            saveDraft: true,
            cancel: true,
            deleteDraft: true,
        })
    })

    it('offers no key while a save, post or delete runs', () => {
        expect(availability({ ...IDLE_DRAFT, isPending: true })).toEqual({
            post: false,
            postAndNew: false,
            saveDraft: false,
            cancel: false,
            deleteDraft: false,
        })
    })

    it('keeps Cancel and Delete draft but no write key while writes are unavailable', () => {
        expect(availability({ ...IDLE_DRAFT, isWriteBlocked: true })).toEqual({
            post: false,
            postAndNew: false,
            saveDraft: false,
            cancel: true,
            deleteDraft: true,
        })
    })
})

describe('formShortcuts', () => {
    function build(initial: FormKeyState) {
        const state = { current: initial }
        const run = formHandlers()
        const shortcuts = formShortcuts({
            id: 'books.transfer.form.r1',
            group: 'Transfer',
            read: () => state.current,
            run,
        })
        return { state, run, shortcuts }
    }

    it('gives one compose shortcut per form key, usable in a text field', () => {
        const { shortcuts } = build(IDLE_DRAFT)
        expect(shortcuts).toHaveLength(5)
        expect(shortcuts.map(s => s.keys).sort()).toEqual(Object.values(FORM_KEYS).sort())
        for (const action of FORM_ACTIONS) {
            const s = byKeys(shortcuts, FORM_KEYS[action])
            expect(s.scope, action).toBe('compose')
            expect(s.allowInInputs, action).toBe(true)
            expect(s.group, action).toBe('Transfer')
            expect(s.description, action).toBe(FORM_DESCRIPTIONS[action])
            expect(s.id.startsWith('books.transfer.form.r1'), s.id).toBe(true)
        }
        expect(new Set(shortcuts.map(s => s.id)).size).toBe(5)
    })

    it('runs only its own handler for each key', () => {
        const { run, shortcuts } = build(IDLE_DRAFT)
        for (const action of FORM_ACTIONS) {
            for (const fn of Object.values(run)) fn.mockClear()
            byKeys(shortcuts, FORM_KEYS[action]).run({ keys: FORM_KEYS[action] })
            for (const other of FORM_ACTIONS) {
                expect(run[other], `${action} pressed, ${other} called`).toHaveBeenCalledTimes(
                    other === action ? 1 : 0
                )
            }
        }
    })

    it('reads availability at call time for every key but Save draft', () => {
        const { state, shortcuts } = build(IDLE)
        const gated: FormKeyAction[] = ['post', 'postAndNew', 'cancel', 'deleteDraft']
        const states: FormKeyState[] = [
            IDLE,
            IDLE_DRAFT,
            { ...IDLE_DRAFT, isPending: true },
            { ...IDLE_DRAFT, isWriteBlocked: true },
        ]
        for (const next of states) {
            state.current = next
            for (const action of gated) {
                const when = byKeys(shortcuts, FORM_KEYS[action]).when
                expect(when, `${action} has a when`).toBeTypeOf('function')
                expect(when?.(), `${action} in ${JSON.stringify(next)}`).toBe(
                    formKeyAvailable(action, next)
                )
            }
        }
    })

    it('always takes ⌘S but saves only while Save draft is available', () => {
        const { state, run, shortcuts } = build(IDLE)
        const save = byKeys(shortcuts, FORM_KEYS.saveDraft)
        expect(save.when).toBeUndefined()

        state.current = { ...IDLE, isPending: true }
        save.run({ keys: FORM_KEYS.saveDraft })
        state.current = { ...IDLE, isWriteBlocked: true }
        save.run({ keys: FORM_KEYS.saveDraft })
        expect(run.saveDraft).not.toHaveBeenCalled()

        state.current = IDLE
        save.run({ keys: FORM_KEYS.saveDraft })
        expect(run.saveDraft).toHaveBeenCalledTimes(1)
    })
})

describe('readKeyAvailable', () => {
    function availableKeys(state: ReadKeyState) {
        return Object.fromEntries(READ_ACTIONS.map(a => [a, readKeyAvailable(a, state)]))
    }

    it('offers Edit, Void and Reverse to a writer on a posted journal entry', () => {
        expect(availableKeys(idle(ENTRY_ACTIONS))).toEqual({
            edit: true,
            void: true,
            reverse: true,
        })
    })

    it('withholds Reverse on a posted transfer', () => {
        expect(availableKeys(idle(TRANSFER_ACTIONS))).toEqual({
            edit: true,
            void: true,
            reverse: false,
        })
    })

    it('withholds Edit and Reverse when only Void is offered', () => {
        expect(availableKeys(idle(['open', 'void']))).toEqual({
            edit: false,
            void: true,
            reverse: false,
        })
    })

    it('offers nothing to a reader or on a void entry', () => {
        expect(availableKeys(idle(['open']))).toEqual({ edit: false, void: false, reverse: false })
    })

    it('offers nothing while a void or reversal runs', () => {
        expect(availableKeys({ actions: ENTRY_ACTIONS, isBusy: true })).toEqual({
            edit: false,
            void: false,
            reverse: false,
        })
    })
})

describe('readShortcuts', () => {
    function build(offered: readonly EntryActionId[], initial: ReadKeyState) {
        const state = { current: initial }
        const run = readHandlers()
        const shortcuts = readShortcuts({
            id: 'books.journal-entry.read.r1',
            group: 'Journal entry',
            offered,
            read: () => state.current,
            run,
        })
        return { state, run, shortcuts }
    }

    it('gives E, V and R in the thread scope, not inside a text field, when all are offered', () => {
        const { shortcuts } = build(ENTRY_ACTIONS, idle(ENTRY_ACTIONS))
        expect(shortcuts.map(s => s.keys)).toEqual(['e', 'v', 'r'])
        for (const action of READ_ACTIONS) {
            const s = byKeys(shortcuts, READ_KEYS[action])
            expect(s.scope, action).toBe('thread')
            expect(s.allowInInputs, action).toBeFalsy()
            expect(s.group, action).toBe('Journal entry')
            expect(s.description, action).toBe(READ_DESCRIPTIONS[action])
            expect(s.id.startsWith('books.journal-entry.read.r1'), s.id).toBe(true)
        }
        expect(new Set(shortcuts.map(s => s.id)).size).toBe(3)
    })

    it('builds a key only for an offered action', () => {
        const keysFor = (offered: readonly EntryActionId[]) =>
            build(offered, idle(offered)).shortcuts.map(s => s.keys)
        expect(keysFor(TRANSFER_ACTIONS)).toEqual(['e', 'v'])
        expect(keysFor(['open', 'void'])).toEqual(['v'])
        expect(keysFor(['open'])).toEqual([])
    })

    it('reads availability at call time', () => {
        const { state, shortcuts } = build(ENTRY_ACTIONS, idle(ENTRY_ACTIONS))
        const states: ReadKeyState[] = [
            idle(ENTRY_ACTIONS),
            idle(TRANSFER_ACTIONS),
            idle(['open', 'void']),
            idle(['open']),
            { actions: ENTRY_ACTIONS, isBusy: true },
        ]
        for (const next of states) {
            state.current = next
            for (const action of READ_ACTIONS) {
                const when = byKeys(shortcuts, READ_KEYS[action]).when
                expect(when, `${action} has a when`).toBeTypeOf('function')
                expect(when?.(), `${action} in ${JSON.stringify(next)}`).toBe(
                    readKeyAvailable(action, next)
                )
            }
        }
    })

    it('runs only its own handler for each key', () => {
        const { run, shortcuts } = build(ENTRY_ACTIONS, idle(ENTRY_ACTIONS))
        for (const action of READ_ACTIONS) {
            for (const fn of Object.values(run)) fn.mockClear()
            byKeys(shortcuts, READ_KEYS[action]).run({ keys: READ_KEYS[action] })
            for (const other of READ_ACTIONS) {
                expect(run[other], `${action} pressed, ${other} called`).toHaveBeenCalledTimes(
                    other === action ? 1 : 0
                )
            }
        }
    })
})

function idle(actions: ReadKeyState['actions']): ReadKeyState {
    return { actions, isBusy: false }
}

describe('the form and read keys in core’s registry', () => {
    it('yields Escape and ⌘↵ to an open layer', () => {
        const run = formHandlers()
        const shortcuts = formShortcuts({
            id: 'books.transfer.form.r2',
            group: 'Transfer',
            read: () => IDLE_DRAFT,
            run,
        })
        registerStamped(shortcuts, pushScope('compose'))
        // Core's LayerEscape pushes a modal scope while a dialog or sheet is open.
        const modal = pushScope('modal')
        const matcher = createMatcher()

        matcher.feedAtom('Escape', { inInput: true })
        matcher.feedAtom('$mod+Enter', { inInput: true })
        expect(run.cancel).not.toHaveBeenCalled()
        expect(run.post).not.toHaveBeenCalled()

        popScope(modal)
        matcher.feedAtom('Escape', { inInput: true })
        expect(run.cancel).toHaveBeenCalledTimes(1)
        matcher.feedAtom('$mod+Enter', { inInput: true })
        expect(run.post).toHaveBeenCalledTimes(1)
    })

    it('gives the keys to a read view shown over a hidden form', () => {
        const form = formHandlers()
        const read = readHandlers()
        registerStamped(
            formShortcuts({
                id: 'books.transfer.form.r3',
                group: 'Transfer',
                read: () => IDLE_DRAFT,
                run: form,
            }),
            pushScope('compose')
        )
        const thread = pushScope('thread')
        registerStamped(
            readShortcuts({
                id: 'books.transfer.read.r3',
                group: 'Transfer',
                offered: TRANSFER_ACTIONS,
                read: () => idle(TRANSFER_ACTIONS),
                run: read,
            }),
            thread
        )
        const matcher = createMatcher()

        matcher.feedAtom('e', { inInput: false })
        expect(read.edit).toHaveBeenCalledTimes(1)
        matcher.feedAtom('$mod+Enter', { inInput: false })
        for (const action of FORM_ACTIONS) expect(form[action], action).not.toHaveBeenCalled()

        popScope(thread)
        matcher.feedAtom('$mod+Enter', { inInput: false })
        expect(form.post).toHaveBeenCalledTimes(1)
    })
})

import { createMatcher } from '@tinycld/core/lib/shortcuts/matcher'
import { useShortcutRegistry } from '@tinycld/core/lib/shortcuts/registry'
import { popScope, pushScope, resetScopes } from '@tinycld/core/lib/shortcuts/scopes'
import type { Shortcut } from '@tinycld/core/lib/shortcuts/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    BANKING_KEYS,
    type BankingKeyAction,
    type BankingKeyState,
    bankingShortcuts,
    dialogSubmitShortcut,
    offeredBankingKeys,
} from '../tinycld/books/lib/banking-shortcuts'

const BOTH: BankingKeyAction[] = ['connect', 'chooseFile']
const IDLE: BankingKeyState = { isMenuOpen: false, isBusy: false }
const WRITER = {
    canWrite: true,
    isWriteBlocked: false,
    state: 'ready',
    hasSelection: true,
    isPanelLoading: false,
} as const

function handlers() {
    return { connect: vi.fn(), chooseFile: vi.fn() }
}

function byKeys(shortcuts: Shortcut[], keys: string): Shortcut {
    const found = shortcuts.find(s => s.keys === keys)
    if (!found) throw new Error(`no shortcut for ${keys}`)
    return found
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

describe('BANKING_KEYS', () => {
    it('maps Connect account to n and Choose file to u', () => {
        expect(BANKING_KEYS).toEqual({ connect: 'n', chooseFile: 'u' })
    })
})

describe('offeredBankingKeys', () => {
    it('offers both keys to a writer on a ready page with a selected connection', () => {
        expect(offeredBankingKeys(WRITER)).toEqual(['connect', 'chooseFile'])
    })

    it('offers only Connect account on the introduction', () => {
        expect(offeredBankingKeys({ ...WRITER, state: 'intro', hasSelection: false })).toEqual([
            'connect',
        ])
    })

    it('offers nothing while the server takes no writes', () => {
        expect(offeredBankingKeys({ ...WRITER, isWriteBlocked: true })).toEqual([])
        expect(offeredBankingKeys({ ...WRITER, state: 'intro', isWriteBlocked: true })).toEqual([])
    })

    it('offers nothing to a reader', () => {
        expect(offeredBankingKeys({ ...WRITER, canWrite: false })).toEqual([])
        expect(offeredBankingKeys({ ...WRITER, canWrite: false, state: 'intro' })).toEqual([])
    })

    it('offers nothing while the page loads or has failed', () => {
        expect(offeredBankingKeys({ ...WRITER, state: 'loading' })).toEqual([])
        expect(offeredBankingKeys({ ...WRITER, state: 'error' })).toEqual([])
    })

    it('offers only Connect account on a ready page with no selected connection', () => {
        expect(offeredBankingKeys({ ...WRITER, hasSelection: false })).toEqual(['connect'])
    })

    it('offers only Connect account while the selected connection’s panel loads', () => {
        expect(offeredBankingKeys({ ...WRITER, isPanelLoading: true })).toEqual(['connect'])
    })
})

describe('bankingShortcuts', () => {
    function build(offered: readonly BankingKeyAction[], initial: BankingKeyState = IDLE) {
        const state = { current: initial }
        const run = handlers()
        const shortcuts = bankingShortcuts({
            id: 'books.banking.page.r1',
            offered,
            read: () => state.current,
            run,
        })
        return { state, run, shortcuts }
    }

    it('gives n and u in the list scope, not inside a text field, when both are offered', () => {
        const { shortcuts } = build(BOTH)
        expect(shortcuts.map(s => s.keys).sort()).toEqual(['n', 'u'])
        const connect = byKeys(shortcuts, 'n')
        const choose = byKeys(shortcuts, 'u')
        expect(connect.description).toBe('Connect account')
        expect(choose.description).toBe('Choose file')
        for (const s of shortcuts) {
            expect(s.scope, s.keys).toBe('list')
            expect(s.group, s.keys).toBe('Banking')
            expect(s.allowInInputs, s.keys).toBeFalsy()
            expect(s.id.startsWith('books.banking.page.r1'), s.id).toBe(true)
        }
        expect(connect.id).not.toBe(choose.id)
    })

    it('builds a key only for an offered action', () => {
        expect(build(['connect']).shortcuts.map(s => s.keys)).toEqual(['n'])
        expect(build([]).shortcuts).toEqual([])
    })

    it('withholds both keys while the More menu is open, read at call time', () => {
        const { state, shortcuts } = build(BOTH)
        const connect = byKeys(shortcuts, 'n')
        const choose = byKeys(shortcuts, 'u')
        expect(connect.when?.() ?? true).toBe(true)
        expect(choose.when?.() ?? true).toBe(true)

        state.current = { isMenuOpen: true, isBusy: false }
        expect(connect.when).toBeTypeOf('function')
        expect(choose.when).toBeTypeOf('function')
        expect(connect.when?.()).toBe(false)
        expect(choose.when?.()).toBe(false)

        state.current = IDLE
        expect(connect.when?.()).toBe(true)
        expect(choose.when?.()).toBe(true)
    })

    it('withholds only Choose file while an upload runs', () => {
        const { state, shortcuts } = build(BOTH)
        state.current = { isMenuOpen: false, isBusy: true }
        expect(byKeys(shortcuts, 'n').when?.() ?? true).toBe(true)
        expect(byKeys(shortcuts, 'u').when?.()).toBe(false)
    })

    it('runs only its own handler for each key', () => {
        const { run, shortcuts } = build(BOTH)
        byKeys(shortcuts, 'n').run({ keys: 'n' })
        expect(run.connect).toHaveBeenCalledTimes(1)
        expect(run.chooseFile).not.toHaveBeenCalled()

        run.connect.mockClear()
        byKeys(shortcuts, 'u').run({ keys: 'u' })
        expect(run.chooseFile).toHaveBeenCalledTimes(1)
        expect(run.connect).not.toHaveBeenCalled()
    })
})

describe('dialogSubmitShortcut', () => {
    it('is ⌘↵ in the modal scope, usable in a text field, in the Banking group', () => {
        const run = vi.fn()
        const s = dialogSubmitShortcut({
            id: 'books.banking.dialog.r1',
            description: 'Connect',
            isEnabled: () => true,
            run,
        })
        expect(s.keys).toBe('$mod+Enter')
        expect(s.scope).toBe('modal')
        expect(s.allowInInputs).toBe(true)
        expect(s.group).toBe('Banking')
        expect(s.description).toBe('Connect')
        expect(s.id.startsWith('books.banking.dialog.r1'), s.id).toBe(true)
        s.run({ keys: '$mod+Enter' })
        expect(run).toHaveBeenCalledTimes(1)
    })

    it('follows isEnabled() at call time', () => {
        const enabled = { current: false }
        const s = dialogSubmitShortcut({
            id: 'books.banking.dialog.r2',
            description: 'Save',
            isEnabled: () => enabled.current,
            run: vi.fn(),
        })
        expect(s.when).toBeTypeOf('function')
        expect(s.when?.()).toBe(false)
        enabled.current = true
        expect(s.when?.()).toBe(true)
        enabled.current = false
        expect(s.when?.()).toBe(false)
    })
})

describe('the page and dialog keys in core’s registry', () => {
    it('gives the keys to an open dialog and back to the page when it closes', () => {
        const page = handlers()
        registerStamped(
            bankingShortcuts({
                id: 'books.banking.page.r2',
                offered: BOTH,
                read: () => IDLE,
                run: page,
            }),
            pushScope('list')
        )
        // Core's LayerEscape pushes ONE modal scope while the dialog is open and registers
        // its Escape "Close" there; the dialog's ⌘↵ joins that same scope, because a
        // second modal scope above it would shadow the layer's Escape.
        const layer = pushScope('modal')
        const close = vi.fn()
        useShortcutRegistry.getState().register({
            id: 'overlay.escape.test',
            keys: 'Escape',
            scope: 'modal',
            description: 'Close',
            allowInInputs: true,
            run: close,
            scopeId: layer,
        })
        const submit = vi.fn()
        registerStamped(
            [
                dialogSubmitShortcut({
                    id: 'books.banking.dialog.r3',
                    description: 'Connect',
                    isEnabled: () => true,
                    run: submit,
                }),
            ],
            layer
        )
        const matcher = createMatcher()

        matcher.feedAtom('n', { inInput: false })
        matcher.feedAtom('u', { inInput: false })
        expect(page.connect).not.toHaveBeenCalled()
        expect(page.chooseFile).not.toHaveBeenCalled()
        matcher.feedAtom('$mod+Enter', { inInput: true })
        expect(submit).toHaveBeenCalledTimes(1)
        matcher.feedAtom('Escape', { inInput: true })
        expect(close).toHaveBeenCalledTimes(1)

        popScope(layer)
        matcher.feedAtom('n', { inInput: false })
        expect(page.connect).toHaveBeenCalledTimes(1)
        matcher.feedAtom('$mod+Enter', { inInput: false })
        expect(submit).toHaveBeenCalledTimes(1)
        matcher.feedAtom('Escape', { inInput: false })
        expect(close).toHaveBeenCalledTimes(1)
    })
})

import type { Shortcut } from '@tinycld/core/lib/shortcuts/types'
import { describe, expect, it, vi } from 'vitest'
import {
    BANK_IMPORT_KEYS,
    type BankImportKeyAction,
    bankImportShortcuts,
    offeredBankImportKeys,
} from '../tinycld/books/lib/bank-import-shortcuts'

const ALL: BankImportKeyAction[] = ['submit', 'back', 'toggleAll']

type Step = 'map' | 'choose' | 'result' | 'message'

function handlers() {
    return { submit: vi.fn(), back: vi.fn(), toggleAll: vi.fn() }
}

function byKeys(shortcuts: Shortcut[], keys: string): Shortcut {
    const found = shortcuts.find(s => s.keys === keys)
    if (!found) throw new Error(`no shortcut for ${keys}`)
    return found
}

function build(input: { offered?: readonly BankImportKeyAction[]; step: Step; isCsv: boolean }) {
    const run = handlers()
    const shortcuts = bankImportShortcuts({
        id: 'books.bankImport.page.r1',
        offered: input.offered ?? ALL,
        step: input.step,
        isCsv: input.isCsv,
        run,
    })
    return { run, shortcuts }
}

describe('BANK_IMPORT_KEYS', () => {
    it('maps Continue/Import to ⌘↵, Back/Cancel to Esc and select all to a', () => {
        expect(BANK_IMPORT_KEYS).toEqual({ submit: '$mod+Enter', back: 'Escape', toggleAll: 'a' })
    })
})

describe('offeredBankImportKeys', () => {
    const idle = { isCsv: true, isBusy: false, hasRows: true, isWriteBlocked: false }

    it('offers ⌘↵ and Esc on Map columns', () => {
        expect(offeredBankImportKeys({ ...idle, step: 'map' })).toEqual(['submit', 'back'])
    })

    it('offers ⌘↵, Esc and a on Choose transactions with rows to choose', () => {
        expect(offeredBankImportKeys({ ...idle, step: 'choose' })).toEqual([
            'submit',
            'back',
            'toggleAll',
        ])
        expect(offeredBankImportKeys({ ...idle, step: 'choose', isCsv: false })).toEqual([
            'submit',
            'back',
            'toggleAll',
        ])
    })

    it('offers only Esc on Choose transactions with nothing to choose', () => {
        expect(offeredBankImportKeys({ ...idle, step: 'choose', hasRows: false })).toEqual(['back'])
    })

    it('offers only Esc on the result and on the message states', () => {
        expect(offeredBankImportKeys({ ...idle, step: 'result' })).toEqual(['back'])
        expect(offeredBankImportKeys({ ...idle, step: 'message', hasRows: false })).toEqual([
            'back',
        ])
    })

    it('withholds Import while the server cannot take writes, but keeps Continue', () => {
        expect(offeredBankImportKeys({ ...idle, step: 'choose', isWriteBlocked: true })).toEqual([
            'back',
            'toggleAll',
        ])
        expect(
            offeredBankImportKeys({ ...idle, step: 'choose', isCsv: false, isWriteBlocked: true })
        ).toEqual(['back', 'toggleAll'])
        expect(offeredBankImportKeys({ ...idle, step: 'map', isWriteBlocked: true })).toEqual([
            'submit',
            'back',
        ])
    })

    it('offers nothing while an import runs', () => {
        for (const step of ['map', 'choose', 'result', 'message'] as const) {
            expect(offeredBankImportKeys({ ...idle, step, isBusy: true }), step).toEqual([])
        }
    })
})

describe('bankImportShortcuts', () => {
    it('builds a key only for an offered action', () => {
        expect(
            build({ step: 'map', isCsv: true, offered: ['submit', 'back'] })
                .shortcuts.map(s => s.keys)
                .sort()
        ).toEqual(['$mod+Enter', 'Escape'].sort())
        expect(
            build({ step: 'result', isCsv: true, offered: ['back'] }).shortcuts.map(s => s.keys)
        ).toEqual(['Escape'])
        expect(build({ step: 'message', isCsv: false, offered: [] }).shortcuts).toEqual([])
    })

    it('puts every key in the list scope under Bank import with its own id', () => {
        const { shortcuts } = build({ step: 'choose', isCsv: true })
        expect(shortcuts).toHaveLength(3)
        for (const s of shortcuts) {
            expect(s.scope, s.keys).toBe('list')
            expect(s.group, s.keys).toBe('Bank import')
            expect(s.id.startsWith('books.bankImport.page.r1'), s.id).toBe(true)
        }
        expect(new Set(shortcuts.map(s => s.id)).size).toBe(3)
    })

    it('lets ⌘↵ fire from a focused select or field', () => {
        const submit = byKeys(build({ step: 'map', isCsv: true }).shortcuts, '$mod+Enter')
        expect(submit.allowInInputs).toBe(true)
    })

    it('names ⌘↵ Continue on Map columns and Import on Choose transactions', () => {
        expect(
            byKeys(build({ step: 'map', isCsv: true }).shortcuts, '$mod+Enter').description
        ).toBe('Continue')
        expect(
            byKeys(build({ step: 'choose', isCsv: true }).shortcuts, '$mod+Enter').description
        ).toBe('Import')
        expect(
            byKeys(build({ step: 'choose', isCsv: false }).shortcuts, '$mod+Enter').description
        ).toBe('Import')
    })

    it('names Esc Back on a CSV Choose transactions step and Cancel elsewhere', () => {
        const esc = (step: Step, isCsv: boolean) =>
            byKeys(build({ step, isCsv }).shortcuts, 'Escape').description
        expect(esc('choose', true)).toBe('Back')
        expect(esc('choose', false)).toBe('Cancel')
        expect(esc('map', true)).toBe('Cancel')
        expect(esc('result', true)).toBe('Cancel')
        expect(esc('result', false)).toBe('Cancel')
        expect(esc('message', true)).toBe('Cancel')
    })

    it('gives select all or none the key a', () => {
        const toggle = byKeys(build({ step: 'choose', isCsv: true }).shortcuts, 'a')
        expect(toggle.description).toBe('Select all or none')
        expect(toggle.allowInInputs).toBeFalsy()
    })

    it('runs only its own handler for each key', () => {
        const { run, shortcuts } = build({ step: 'choose', isCsv: true })
        const pressed: [string, keyof ReturnType<typeof handlers>][] = [
            ['$mod+Enter', 'submit'],
            ['Escape', 'back'],
            ['a', 'toggleAll'],
        ]
        for (const [keys, action] of pressed) {
            for (const fn of Object.values(run)) fn.mockClear()
            byKeys(shortcuts, keys).run({ keys })
            expect(run[action], keys).toHaveBeenCalledTimes(1)
            for (const [other, fn] of Object.entries(run)) {
                if (other !== action) expect(fn, `${keys} → ${other}`).not.toHaveBeenCalled()
            }
        }
    })
})

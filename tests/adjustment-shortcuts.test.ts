import { describe, expect, it } from 'vitest'
import {
    ADJUSTMENT_FORM_KEYS,
    adjustmentFormKeysOffered,
} from '../tinycld/books/lib/adjustment-shortcuts'
import { DEPOSIT_FORM_KEYS } from '../tinycld/books/lib/deposit-shortcuts'
import { FORM_KEYS } from '../tinycld/books/lib/entry-shortcuts'

// The adjustment form's keys (inventory-adjust spec §3.4): group "Inventory adjustment"
// Post ⌘↵, Post & new ⌘⇧↵, Save draft ⌘S, Cancel Esc, Delete draft ⌘⌫; group "Lines" Add
// line ⌥↵ and the deposit's row key Remove line ⌘⌥⌫. Core's ⇧? list ignores `when`, so a
// key is registered only while its action is offered.

describe('ADJUSTMENT_FORM_KEYS', () => {
    it('is the shared form keys plus ⌥↵ Add line and ⌘⌥⌫ Remove line, the deposit’s line keys', () => {
        expect(ADJUSTMENT_FORM_KEYS).toEqual({
            post: '$mod+Enter',
            postAndNew: '$mod+Shift+Enter',
            saveDraft: '$mod+s',
            cancel: 'Escape',
            deleteDraft: '$mod+Backspace',
            addLine: 'Alt+Enter',
            removeLine: '$mod+Alt+Backspace',
        })
        expect(ADJUSTMENT_FORM_KEYS).toMatchObject(FORM_KEYS)
        expect(ADJUSTMENT_FORM_KEYS.addLine).toBe(DEPOSIT_FORM_KEYS.addLine)
        expect(ADJUSTMENT_FORM_KEYS.removeLine).toBe(DEPOSIT_FORM_KEYS.removeLine)
    })

    it('holds no key twice', () => {
        const keys = Object.values(ADJUSTMENT_FORM_KEYS)
        expect(new Set(keys).size).toBe(keys.length)
    })
})

type KeyState = Parameters<typeof adjustmentFormKeysOffered>[0]

// A writer's new form that holds the keys: idle, no dialog, writes available, its two
// starting lines, and the focus inside line 1.
const NEW_FORM = {
    holdsKeys: true,
    canWrite: true,
    writesAvailable: true,
    isWriteHeld: false,
    isDialogOpen: false,
    isSavedDraft: false,
    lineCount: 2,
    isLineFocused: true,
} satisfies KeyState

function offered(state: Partial<KeyState> = {}) {
    return [...adjustmentFormKeysOffered({ ...NEW_FORM, ...state })].sort()
}

const WRITE_KEYS = ['post', 'postAndNew', 'saveDraft', 'deleteDraft']

describe('adjustmentFormKeysOffered', () => {
    it('offers Post, Post & new, Save draft, Cancel, Add line and Remove line on a new form', () => {
        expect(offered()).toEqual(
            ['post', 'postAndNew', 'saveDraft', 'cancel', 'addLine', 'removeLine'].sort()
        )
    })

    it('offers Delete draft on a saved draft only', () => {
        expect(offered()).not.toContain('deleteDraft')
        expect(offered({ isSavedDraft: true })).toContain('deleteDraft')
    })

    it('offers Remove line only while the focus is inside a line', () => {
        expect(offered({ isLineFocused: false })).not.toContain('removeLine')
        expect(offered({ isLineFocused: false })).toContain('addLine')
    })

    it('offers none of the write keys without write access', () => {
        const keys = offered({ canWrite: false, isSavedDraft: true })
        for (const key of WRITE_KEYS) expect(keys).not.toContain(key)
        expect(keys).toContain('cancel')
    })

    it('offers none of the write keys while writes are unavailable', () => {
        const keys = offered({ writesAvailable: false, isSavedDraft: true })
        for (const key of WRITE_KEYS) expect(keys).not.toContain(key)
        expect(keys).toContain('cancel')
    })

    it('offers no key while a save holds the form', () => {
        expect(offered({ isWriteHeld: true, isSavedDraft: true })).toEqual([])
    })

    it('offers no key while a dialog is open or another layer holds the keys', () => {
        expect(offered({ isDialogOpen: true })).toEqual([])
        expect(offered({ holdsKeys: false })).toEqual([])
    })
})

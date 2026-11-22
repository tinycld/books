import { describe, expect, it } from 'vitest'
import {
    DEPOSIT_FORM_KEYS,
    DEPOSIT_READ_KEYS,
    depositFormKeysOffered,
} from '../tinycld/books/lib/deposit-shortcuts'
import { FORM_KEYS } from '../tinycld/books/lib/entry-shortcuts'

// The deposit read view's keys (bank deposit spec §3.2): Edit E, Void V, View journal
// entry J.
describe('DEPOSIT_READ_KEYS', () => {
    it('maps edit to e, void to v and entry to j', () => {
        expect(DEPOSIT_READ_KEYS).toEqual({ edit: 'e', void: 'v', entry: 'j' })
    })
})

// The form's keys of spec §3.2: Post ⌘↵, Post & new ⌘⇧↵, Save draft ⌘S, Cancel Esc,
// Delete draft ⌘⌫, select all / clear all ⌥A, Clear selection ⌥⌫, Add an other funds line
// ⌥↵, and Remove line ⌘⌥⌫ (focus inside the line).
describe('DEPOSIT_FORM_KEYS', () => {
    it('is ⌘↵, ⌘⇧↵, ⌘S, Esc, ⌘⌫, ⌥A, ⌥⌫, ⌥↵ and ⌘⌥⌫', () => {
        expect(DEPOSIT_FORM_KEYS).toEqual({
            post: '$mod+Enter',
            postAndNew: '$mod+Shift+Enter',
            saveDraft: '$mod+s',
            cancel: 'Escape',
            deleteDraft: '$mod+Backspace',
            selectAll: 'Alt+a',
            clearSelection: 'Alt+Backspace',
            addLine: 'Alt+Enter',
            removeLine: '$mod+Alt+Backspace',
        })
        expect(DEPOSIT_FORM_KEYS).toMatchObject(FORM_KEYS)
    })
})

type KeyState = Parameters<typeof depositFormKeysOffered>[0]

// A writer's new form on a wide bar that holds the keys, idle, no dialog, writes available,
// no other funds line, and the focus outside every line.
const IDLE = {
    holdsKeys: true,
    canWrite: true,
    isWriteHeld: false,
    isDialogOpen: false,
    isSavedDraft: false,
    writesAvailable: true,
    isPhoneBar: false,
    mode: 'new',
    lineCount: 0,
    isLineFocused: false,
} satisfies KeyState

function offered(state: Partial<KeyState>) {
    return [...depositFormKeysOffered({ ...IDLE, ...state })].sort()
}

const WRITE_KEYS = ['post', 'postAndNew', 'saveDraft', 'deleteDraft']

describe('depositFormKeysOffered', () => {
    it('offers every form key but Delete draft and Remove line on an unsaved form', () => {
        expect(offered({})).toEqual(
            [
                'post',
                'postAndNew',
                'saveDraft',
                'cancel',
                'selectAll',
                'clearSelection',
                'addLine',
            ].sort()
        )
    })

    it('offers Add line (⌥↵) while the form holds fewer than 100 lines', () => {
        expect(offered({ lineCount: 0 })).toContain('addLine')
        expect(offered({ lineCount: 99 })).toContain('addLine')
        expect(offered({ lineCount: 100 })).not.toContain('addLine')
    })

    it('offers Add line only to a user who can write', () => {
        expect(offered({ canWrite: false })).not.toContain('addLine')
    })

    // Add line writes nothing: it stays usable while the server cannot be reached, as the
    // tick boxes do (Decisions, Core mechanisms: useWritesAvailable).
    it('keeps Add line while writes are unavailable', () => {
        expect(offered({ writesAvailable: false })).toContain('addLine')
    })

    it('offers Remove line (⌘⌥⌫) only while the focus is inside a line', () => {
        expect(offered({ lineCount: 2, isLineFocused: false })).not.toContain('removeLine')
        expect(offered({ lineCount: 2, isLineFocused: true })).toContain('removeLine')
    })

    it('offers no line key while a dialog is open or a save is held', () => {
        for (const state of [{ isDialogOpen: true }, { isWriteHeld: true }]) {
            const keys = offered({ ...state, lineCount: 2, isLineFocused: true })
            expect(keys).not.toContain('addLine')
            expect(keys).not.toContain('removeLine')
        }
    })

    // `?replaces`: the shared DocumentBar with Cancel and Save (⌘↵); no draft is saved and
    // nothing posts and starts a new one.
    it('offers ⌘↵, Esc, ⌥A, ⌥⌫, ⌥↵ and ⌘⌥⌫ on a correction, and not ⌘S, ⌘⇧↵ or ⌘⌫', () => {
        expect(offered({ mode: 'replaces', lineCount: 1, isLineFocused: true })).toEqual(
            ['post', 'cancel', 'selectAll', 'clearSelection', 'addLine', 'removeLine'].sort()
        )
        const keys = offered({ mode: 'replaces', isPhoneBar: true })
        expect(keys).not.toContain('saveDraft')
        expect(keys).not.toContain('postAndNew')
        expect(keys).not.toContain('deleteDraft')
    })

    // A stored correction draft (a `?replaces` save whose post was refused after the header
    // was written) opens as a correction; it can still be deleted (spec §3.2 ⌘⌫, §3.6 More).
    it('offers Delete draft (⌘⌫) on a saved correction draft, and not on an unsaved correction', () => {
        expect(offered({ mode: 'replaces', isSavedDraft: true })).toContain('deleteDraft')
        expect(offered({ mode: 'replaces', isSavedDraft: true, isPhoneBar: true })).toContain(
            'deleteDraft'
        )
        expect(offered({ mode: 'replaces', isSavedDraft: false })).not.toContain('deleteDraft')
        const saved = offered({ mode: 'replaces', isSavedDraft: true })
        expect(saved).not.toContain('saveDraft')
        expect(saved).not.toContain('postAndNew')
    })

    it('offers Delete draft only on a saved draft', () => {
        expect(offered({})).not.toContain('deleteDraft')
        expect(offered({ isSavedDraft: true })).toContain('deleteDraft')
    })

    it('leaves out every write key while a save is held', () => {
        const keys = offered({ isWriteHeld: true, isSavedDraft: true })
        for (const key of WRITE_KEYS) expect(keys).not.toContain(key)
    })

    it('leaves out every write key for a user who cannot write', () => {
        const keys = offered({ canWrite: false, isSavedDraft: true })
        for (const key of WRITE_KEYS) expect(keys).not.toContain(key)
    })

    it('offers no form key while a dialog is open', () => {
        expect(offered({ isDialogOpen: true, isSavedDraft: true })).toEqual([])
    })

    it('keeps Post & new registered when it sits in a phone bar’s More', () => {
        expect(offered({ isPhoneBar: true })).toContain('postAndNew')
        expect(offered({ isPhoneBar: true, isSavedDraft: true })).toContain('deleteDraft')
    })
})

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

// The form's keys of spec §3.2 for checkpoint 3: Post ⌘↵, Post & new ⌘⇧↵, Save draft ⌘S,
// Cancel Esc, Delete draft ⌘⌫, select all / clear all ⌥A, Clear selection ⌥⌫. The line
// keys (⌥↵, ⌘⌥⌫) arrive with the Other funds section in checkpoint 4.
describe('DEPOSIT_FORM_KEYS', () => {
    it('is ⌘↵, ⌘⇧↵, ⌘S, Esc, ⌘⌫, ⌥A and ⌥⌫', () => {
        expect(DEPOSIT_FORM_KEYS).toEqual({
            post: '$mod+Enter',
            postAndNew: '$mod+Shift+Enter',
            saveDraft: '$mod+s',
            cancel: 'Escape',
            deleteDraft: '$mod+Backspace',
            selectAll: 'Alt+a',
            clearSelection: 'Alt+Backspace',
        })
        expect(DEPOSIT_FORM_KEYS).toMatchObject(FORM_KEYS)
    })
})

type KeyState = Parameters<typeof depositFormKeysOffered>[0]

// A writer's new form on a wide bar that holds the keys, idle, no dialog, writes available.
const IDLE = {
    holdsKeys: true,
    canWrite: true,
    isWriteHeld: false,
    isDialogOpen: false,
    isSavedDraft: false,
    writesAvailable: true,
    isPhoneBar: false,
} satisfies KeyState

function offered(state: Partial<KeyState>) {
    return [...depositFormKeysOffered({ ...IDLE, ...state })].sort()
}

const WRITE_KEYS = ['post', 'postAndNew', 'saveDraft', 'deleteDraft']

describe('depositFormKeysOffered', () => {
    it('offers every form key but Delete draft on an unsaved form', () => {
        expect(offered({})).toEqual(
            ['post', 'postAndNew', 'saveDraft', 'cancel', 'selectAll', 'clearSelection'].sort()
        )
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

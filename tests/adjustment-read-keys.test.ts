import { describe, expect, it } from 'vitest'
import {
    ADJUSTMENT_READ_KEYS,
    adjustmentFormKeysOffered,
    adjustmentReadKeysOffered,
} from '../tinycld/books/lib/adjustment-shortcuts'

// Spec §3.4: "Read view: Edit E, Void V, Copy C. A key is registered only while its action
// is offered." And the correction's bar posts only, as the deposit's.

describe('ADJUSTMENT_READ_KEYS', () => {
    it('is E, V and C', () => {
        expect(ADJUSTMENT_READ_KEYS).toEqual({ edit: 'e', void: 'v', copy: 'c' })
    })
})

describe('adjustmentReadKeysOffered', () => {
    it('offers the key of each offered action only', () => {
        expect(
            adjustmentReadKeysOffered({ edit: 'offered', void: 'offered', copy: 'offered' }, true)
        ).toEqual(['edit', 'void', 'copy'])
        expect(
            adjustmentReadKeysOffered({ edit: 'hidden', void: 'hidden', copy: 'offered' }, true)
        ).toEqual(['copy'])
        expect(
            adjustmentReadKeysOffered(
                { edit: 'disabled', void: 'disabled', copy: 'disabled' },
                true
            )
        ).toEqual([])
    })

    it('reads each action on its own state', () => {
        expect(
            adjustmentReadKeysOffered({ edit: 'offered', void: 'disabled', copy: 'hidden' }, true)
        ).toEqual(['edit'])
        expect(
            adjustmentReadKeysOffered({ edit: 'disabled', void: 'offered', copy: 'disabled' }, true)
        ).toEqual(['void'])
        expect(
            adjustmentReadKeysOffered({ edit: 'hidden', void: 'offered', copy: 'offered' }, true)
        ).toEqual(['void', 'copy'])
    })

    it('offers none while another layer holds the keys', () => {
        expect(
            adjustmentReadKeysOffered({ edit: 'offered', void: 'offered', copy: 'offered' }, false)
        ).toEqual([])
    })
})

type FormKeyState = Parameters<typeof adjustmentFormKeysOffered>[0]

const CORRECTION: FormKeyState = {
    holdsKeys: true,
    canWrite: true,
    writesAvailable: true,
    isWriteHeld: false,
    isDialogOpen: false,
    isSavedDraft: false,
    lineCount: 1,
    isLineFocused: false,
    mode: 'replaces',
}

function correctionKeys(state: Partial<FormKeyState> = {}) {
    return [...adjustmentFormKeysOffered({ ...CORRECTION, ...state })].sort()
}

describe('adjustmentFormKeysOffered of a correction', () => {
    it('offers Post and no Save draft or Post & new', () => {
        expect(correctionKeys()).toEqual(['addLine', 'cancel', 'post'])
    })

    it('offers no Post while writes are unavailable', () => {
        expect(correctionKeys({ writesAvailable: false })).toEqual(['addLine', 'cancel'])
    })

    it('offers no Post to a reader', () => {
        expect(correctionKeys({ canWrite: false })).toEqual(['cancel'])
    })

    it('keeps Save draft and Post & new on a new form', () => {
        expect(correctionKeys({ mode: 'new' })).toEqual([
            'addLine',
            'cancel',
            'post',
            'postAndNew',
            'saveDraft',
        ])
    })
})

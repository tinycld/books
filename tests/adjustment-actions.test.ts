import { describe, expect, it } from 'vitest'
import {
    adjustmentReadActions,
    adjustmentRowMenuItems,
    adjustmentStale,
} from '../tinycld/books/lib/adjustment-actions'
import type { BooksInventoryAdjustments } from '../tinycld/books/types'

// The inventory adjustment's actions (inventory-adjust spec §3.4, §3.5, §3.13): the read
// view's Edit, Void and Copy, the list's row menu, and the stale state of a draft that
// another person posted or deleted while its form is open.

type Status = BooksInventoryAdjustments['status']
type Kind = BooksInventoryAdjustments['kind']

type ActionInput = {
    status: Status
    kind: Kind
    replacedBy: string
    canWrite: boolean
    writesAvailable: boolean
}

// A writer on a posted manual adjustment that no correction replaced, with writes on.
const POSTED: ActionInput = {
    status: 'posted',
    kind: 'manual',
    replacedBy: '',
    canWrite: true,
    writesAvailable: true,
}

const NONE = { edit: 'hidden', void: 'hidden', copy: 'hidden' }

function readActions(input: ActionInput) {
    return adjustmentReadActions(input)
}

function rowMenu(input: ActionInput) {
    return adjustmentRowMenuItems(input)
}

describe('adjustmentReadActions', () => {
    it('offers Edit, Void and Copy to a writer on a posted manual adjustment', () => {
        expect(readActions(POSTED)).toEqual({ edit: 'offered', void: 'offered', copy: 'offered' })
    })

    it('offers Copy only on a void manual adjustment', () => {
        expect(readActions({ ...POSTED, status: 'void' })).toEqual({
            edit: 'hidden',
            void: 'hidden',
            copy: 'offered',
        })
    })

    it('offers no read action on a draft for a writer: a draft opens in the form', () => {
        expect(readActions({ ...POSTED, status: 'draft' })).toEqual(NONE)
    })

    it('hides all three on an adjustment Books made (opening, recost)', () => {
        for (const kind of ['opening', 'recost'] as const) {
            for (const status of ['posted', 'void'] as const) {
                expect(readActions({ ...POSTED, kind, status })).toEqual(NONE)
            }
        }
    })

    it('gives a reader none', () => {
        for (const status of ['draft', 'posted', 'void'] as const) {
            expect(readActions({ ...POSTED, status, canWrite: false })).toEqual(NONE)
        }
    })

    it('disables each offered action while writes are unavailable, and keeps the rest hidden', () => {
        expect(readActions({ ...POSTED, writesAvailable: false })).toEqual({
            edit: 'disabled',
            void: 'disabled',
            copy: 'disabled',
        })
        expect(readActions({ ...POSTED, status: 'void', writesAvailable: false })).toEqual({
            edit: 'hidden',
            void: 'hidden',
            copy: 'disabled',
        })
    })

    it('offers Copy only on an adjustment a correction replaced', () => {
        expect(readActions({ ...POSTED, replacedBy: 'iareplacement01' })).toEqual({
            edit: 'hidden',
            void: 'hidden',
            copy: 'offered',
        })
        expect(readActions({ ...POSTED, status: 'void', replacedBy: 'iareplacement01' })).toEqual({
            edit: 'hidden',
            void: 'hidden',
            copy: 'offered',
        })
    })
})

// Spec §3.5: "Row menu: Open, Edit (draft or posted manual, writers), Copy (writers), Void
// (posted manual, writers), Delete (draft, writers)." With §3.5 "An adjustment Books made:
// … No Edit, no Void, no Copy." A replaced adjustment is void.
describe('adjustmentRowMenuItems', () => {
    const DRAFT: ActionInput = { ...POSTED, status: 'draft' }
    const VOID: ActionInput = { ...POSTED, status: 'void' }

    it('gives a writer on a draft Open, Edit, Copy and Delete', () => {
        expect(rowMenu(DRAFT)).toEqual(['open', 'edit', 'copy', 'delete'])
    })

    it('gives a writer on a posted manual adjustment Open, Edit, Copy and Void', () => {
        expect(rowMenu(POSTED)).toEqual(['open', 'edit', 'copy', 'void'])
    })

    it('gives a writer on a void manual adjustment Open and Copy', () => {
        expect(rowMenu(VOID)).toEqual(['open', 'copy'])
        expect(rowMenu({ ...VOID, replacedBy: 'iareplacement01' })).toEqual(['open', 'copy'])
    })

    it('gives a writer on an opening or a recost adjustment Open only', () => {
        for (const kind of ['opening', 'recost'] as const) {
            expect(rowMenu({ ...POSTED, kind })).toEqual(['open'])
            expect(rowMenu({ ...VOID, kind })).toEqual(['open'])
        }
    })

    it('gives a reader Open only, on every status and kind', () => {
        for (const status of ['draft', 'posted', 'void'] as const) {
            for (const kind of ['manual', 'opening', 'recost'] as const) {
                expect(rowMenu({ ...POSTED, status, kind, canWrite: false })).toEqual(['open'])
            }
        }
    })
})

describe('adjustmentStale', () => {
    const OPEN = { formStatus: 'draft' as const, isLoaded: true, isHeld: false }

    it('is none while the live record is still the draft', () => {
        expect(adjustmentStale({ ...OPEN, live: { status: 'draft' } })).toBe('none')
    })

    it('is posted when the live record is posted or void and no own save holds it', () => {
        expect(adjustmentStale({ ...OPEN, live: { status: 'posted' } })).toBe('posted')
        expect(adjustmentStale({ ...OPEN, live: { status: 'void' } })).toBe('posted')
    })

    it('is deleted when the record is missing after the load', () => {
        expect(adjustmentStale({ ...OPEN, live: undefined })).toBe('deleted')
    })

    it('is none for a missing record before the load', () => {
        expect(adjustmentStale({ ...OPEN, live: undefined, isLoaded: false })).toBe('none')
    })

    it('is none while an own save holds the draft: the own post or delete is not stale', () => {
        expect(adjustmentStale({ ...OPEN, isHeld: true, live: { status: 'posted' } })).toBe('none')
        expect(adjustmentStale({ ...OPEN, isHeld: true, live: { status: 'void' } })).toBe('none')
        expect(adjustmentStale({ ...OPEN, isHeld: true, live: undefined })).toBe('none')
    })
})

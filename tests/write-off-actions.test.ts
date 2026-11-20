import { describe, expect, it } from 'vitest'
import {
    WRITE_OFF_ACTION_KEYS,
    writeOffReadActions,
    writeOffScreenState,
    writeOffVoidDisabled,
} from '../tinycld/books/lib/write-off-actions'

// The write-off page's bar and states (write-off spec §3.5). A writer on a posted write-off
// gets Void, Open invoice and View journal entry; a void write-off and a reader get only the
// two open actions. A write-off is never edited, copied or deleted.
describe('writeOffReadActions', () => {
    it('gives a writer on a posted write-off Void, Open invoice and View journal entry', () => {
        expect(writeOffReadActions('posted', true)).toEqual(['void', 'invoice', 'entry'])
    })

    it('gives a writer on a void write-off only the two open actions', () => {
        expect(writeOffReadActions('void', true)).toEqual(['invoice', 'entry'])
    })

    it('gives a reader only the two open actions, posted or void', () => {
        expect(writeOffReadActions('posted', false)).toEqual(['invoice', 'entry'])
        expect(writeOffReadActions('void', false)).toEqual(['invoice', 'entry'])
    })
})

describe('WRITE_OFF_ACTION_KEYS', () => {
    it('is V for Void, I for Open invoice and J for View journal entry', () => {
        expect(WRITE_OFF_ACTION_KEYS).toEqual({ void: 'v', invoice: 'i', entry: 'j' })
    })
})

describe('writeOffScreenState', () => {
    it('is loading while the read runs with no record', () => {
        expect(writeOffScreenState({ isLoading: true, isError: false, hasRecord: false })).toBe(
            'loading'
        )
    })

    it('is error when the read failed with no record', () => {
        expect(writeOffScreenState({ isLoading: false, isError: true, hasRecord: false })).toBe(
            'error'
        )
    })

    it('keeps the record it shows when a later read fails', () => {
        expect(writeOffScreenState({ isLoading: false, isError: true, hasRecord: true })).toBe(
            'read'
        )
    })

    it('is not-found when the read is ready with no record', () => {
        expect(writeOffScreenState({ isLoading: false, isError: false, hasRecord: false })).toBe(
            'not-found'
        )
    })

    it('is read when there is a record', () => {
        expect(writeOffScreenState({ isLoading: false, isError: false, hasRecord: true })).toBe(
            'read'
        )
        expect(writeOffScreenState({ isLoading: true, isError: false, hasRecord: true })).toBe(
            'read'
        )
    })
})

describe('writeOffVoidDisabled', () => {
    it('is disabled offline', () => {
        expect(writeOffVoidDisabled({ writesAvailable: false, isPending: false })).toBe(true)
    })

    it('is disabled while the void runs', () => {
        expect(writeOffVoidDisabled({ writesAvailable: true, isPending: true })).toBe(true)
    })

    it('is enabled online with no void running', () => {
        expect(writeOffVoidDisabled({ writesAvailable: true, isPending: false })).toBe(false)
    })
})

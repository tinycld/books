import { describe, expect, it } from 'vitest'
import { depositReadActions } from '../tinycld/books/lib/deposit-read-actions'

// The deposit read view's actions (bank deposit spec §3.8): a writer on a posted deposit
// may Edit (once the correction form exists: `canEdit`), Void and View journal entry; a
// writer on a void deposit and every reader only View journal entry. View journal entry
// needs the entry the post wrote.

describe('depositReadActions', () => {
    it('gives a writer on a posted deposit void and entry while Edit is not offered', () => {
        expect(depositReadActions('posted', true, true, false)).toEqual(['void', 'entry'])
    })

    it('puts edit first for a writer on a posted deposit when Edit is offered', () => {
        expect(depositReadActions('posted', true, true, true)).toEqual(['edit', 'void', 'entry'])
    })

    it('gives a writer on a void deposit only entry', () => {
        expect(depositReadActions('void', true, true, false)).toEqual(['entry'])
        expect(depositReadActions('void', true, true, true)).toEqual(['entry'])
    })

    it('gives a reader only entry, posted or void', () => {
        for (const status of ['posted', 'void'] as const) {
            expect(depositReadActions(status, false, true, false)).toEqual(['entry'])
            expect(depositReadActions(status, false, true, true)).toEqual(['entry'])
        }
    })

    it('offers no View journal entry when the deposit has no entry', () => {
        expect(depositReadActions('posted', true, false, false)).toEqual(['void'])
        expect(depositReadActions('posted', true, false, true)).toEqual(['edit', 'void'])
        expect(depositReadActions('void', true, false, false)).toEqual([])
        expect(depositReadActions('posted', false, false, false)).toEqual([])
    })
})

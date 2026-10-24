import { describe, expect, it } from 'vitest'
import { entryActions, newEntryVisible } from '../tinycld/books/lib/entry-actions'

const writer = { canWrite: true }
const reader = { canWrite: false }
const posted = { status: 'posted', origin: 'manual', isReversed: false } as const

describe('entryActions', () => {
    it('gives a writer on a posted manual entry open, edit, reverse and void', () => {
        expect(entryActions(posted, writer)).toEqual(['open', 'edit', 'reverse', 'void'])
    })

    it('removes reverse once reversed', () => {
        expect(entryActions({ ...posted, isReversed: true }, writer)).toEqual([
            'open',
            'edit',
            'void',
        ])
    })

    it('gives a draft open and delete', () => {
        expect(
            entryActions({ status: 'draft', origin: 'manual', isReversed: false }, writer)
        ).toEqual(['open', 'delete'])
    })

    it('gives a void entry open only', () => {
        expect(
            entryActions({ status: 'void', origin: 'manual', isReversed: false }, writer)
        ).toEqual(['open'])
    })

    it('gives a void_reversal entry open only', () => {
        expect(
            entryActions({ status: 'posted', origin: 'void_reversal', isReversed: false }, writer)
        ).toEqual(['open'])
    })

    it('gives a reader open only for any entry', () => {
        for (const status of ['draft', 'posted', 'void'] as const) {
            expect(entryActions({ status, origin: 'manual', isReversed: false }, reader)).toEqual([
                'open',
            ])
        }
    })
})

describe('newEntryVisible', () => {
    it('follows canWrite', () => {
        expect(newEntryVisible({ canWrite: false })).toBe(false)
        expect(newEntryVisible({ canWrite: true })).toBe(true)
    })
})

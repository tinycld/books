import { describe, expect, it } from 'vitest'
import { recordFooter, recordTitle } from '../tinycld/books/lib/record-display'

describe('recordTitle', () => {
    it('is "New <noun>" for a writer on a new record', () => {
        expect(recordTitle('widget', { mode: 'new', canWrite: true })).toBe('New widget')
    })

    it('is "Edit <noun>" for a writer on an existing record', () => {
        expect(recordTitle('widget', { mode: 'edit', canWrite: true })).toBe('Edit widget')
    })

    it('is the noun with a capital first letter for a reader, in both modes', () => {
        expect(recordTitle('widget', { mode: 'new', canWrite: false })).toBe('Widget')
        expect(recordTitle('widget', { mode: 'edit', canWrite: false })).toBe('Widget')
    })
})

describe('recordFooter', () => {
    it('gives a writer on a new record Cancel, Save and Save and new', () => {
        expect(recordFooter({ mode: 'new', canWrite: true })).toEqual({
            cancel: true,
            save: true,
            saveAndNew: true,
            close: false,
        })
    })

    it('gives a writer on an existing record Cancel and Save, no Save and new', () => {
        expect(recordFooter({ mode: 'edit', canWrite: true })).toEqual({
            cancel: true,
            save: true,
            saveAndNew: false,
            close: false,
        })
    })

    it('gives a reader only Close, in both modes', () => {
        const closeOnly = { cancel: false, save: false, saveAndNew: false, close: true }
        expect(recordFooter({ mode: 'new', canWrite: false })).toEqual(closeOnly)
        expect(recordFooter({ mode: 'edit', canWrite: false })).toEqual(closeOnly)
    })
})

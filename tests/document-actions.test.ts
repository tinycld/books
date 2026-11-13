import { describe, expect, it } from 'vitest'
import {
    DOCUMENT_READ_ACTION_KEYS,
    DOCUMENT_READ_KEYS,
    DOCUMENT_TAB_KEYS,
    documentReadActions,
} from '../tinycld/books/lib/document-actions'

// The read view's actions by the invoice's status and the user's access (spec §3.6), and
// the keys the read view registers for them (spec §3.1 key map).
describe('documentReadActions', () => {
    it('offers a writer every action on a posted invoice, in bar order', () => {
        expect(documentReadActions('posted', true)).toEqual([
            'edit',
            'void',
            'copy',
            'entry',
            'pdf',
        ])
    })

    it('offers a writer Copy, View journal entry and Download PDF on a void invoice', () => {
        expect(documentReadActions('void', true)).toEqual(['copy', 'entry', 'pdf'])
    })

    it('offers a reader only View journal entry and Download PDF', () => {
        expect(documentReadActions('posted', false)).toEqual(['entry', 'pdf'])
        expect(documentReadActions('void', false)).toEqual(['entry', 'pdf'])
    })
})

describe('DOCUMENT_READ_KEYS', () => {
    it('matches the key map: Edit E, Void V, Copy C, View journal entry J, Open invoice I', () => {
        expect(DOCUMENT_READ_KEYS).toEqual({
            edit: 'e',
            void: 'v',
            copy: 'c',
            entry: 'j',
            invoice: 'i',
        })
    })
})

// A closed estimate's Open invoice (spec §3.2 read view keys): key I. It belongs to the
// quote lifecycle only (quoteReadActions); a posted or void document never offers it.
describe('Open invoice', () => {
    it('has the key I and is never a read action of a posting document', () => {
        expect(DOCUMENT_READ_KEYS.invoice).toBe('i')
        const posting = [
            ['posted', true],
            ['posted', false],
            ['void', true],
            ['void', false],
            ['draft', true],
        ] as const
        for (const [status, canWrite] of posting) {
            expect(documentReadActions(status, canWrite)).not.toContain('invoice')
        }
    })
})

// The sales receipt's read view (spec §3.7, §3.2): the same actions and keys as the
// invoice's, as the read actions are shared and take no kind.
describe('the sales receipt read view', () => {
    it('offers a writer Edit, Void, Copy, View journal entry and Download PDF on a posted receipt', () => {
        expect(documentReadActions('posted', true)).toEqual([
            'edit',
            'void',
            'copy',
            'entry',
            'pdf',
        ])
    })

    it('offers a writer Copy, View journal entry and Download PDF on a void receipt', () => {
        expect(documentReadActions('void', true)).toEqual(['copy', 'entry', 'pdf'])
    })

    it('offers a reader View journal entry and Download PDF', () => {
        expect(documentReadActions('posted', false)).toEqual(['entry', 'pdf'])
    })

    it('keys E, V, C, J, ⌘P and the tabs ⌥1 / ⌥2', () => {
        expect(DOCUMENT_READ_ACTION_KEYS).toEqual({
            edit: 'e',
            void: 'v',
            copy: 'c',
            entry: 'j',
            invoice: 'i',
            pdf: '$mod+p',
        })
        expect(DOCUMENT_TAB_KEYS).toEqual({ edit: 'Alt+1', pdf: 'Alt+2' })
    })
})

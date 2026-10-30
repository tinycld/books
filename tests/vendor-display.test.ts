import { describe, expect, it } from 'vitest'
import {
    vendorDeleteLines,
    vendorListCopy,
    vendorsEmptyHint,
} from '../tinycld/books/lib/vendor-display'

const WRITER_HINT = 'Add the people and companies you buy from.'
const READER_HINT = 'Vendors appear here once a bookkeeper adds them.'
const REFUSAL = 'This vendor is used on a bill.'
const NAME_LINE = { key: 'name', text: 'Acme', tone: 'plain' }
const EXPLANATION_LINE = { key: 'explanation', text: 'This cannot be undone.', tone: 'muted' }
const UNSAVED_LINE = {
    key: 'unsaved',
    text: 'Unsaved changes to this vendor will be lost.',
    tone: 'plain',
}

describe('vendorDeleteLines', () => {
    it('names the vendor and says the delete cannot be undone', () => {
        expect(vendorDeleteLines({ name: 'Acme', isOpenAndDirty: false, refusal: null })).toEqual([
            NAME_LINE,
            EXPLANATION_LINE,
        ])
    })

    it('adds the unsaved-changes line third when the open vendor is dirty', () => {
        expect(vendorDeleteLines({ name: 'Acme', isOpenAndDirty: true, refusal: null })).toEqual([
            NAME_LINE,
            EXPLANATION_LINE,
            UNSAVED_LINE,
        ])
    })

    it('ends with the refusal as an error line', () => {
        const lines = vendorDeleteLines({ name: 'Acme', isOpenAndDirty: true, refusal: REFUSAL })
        expect(lines).toEqual([
            NAME_LINE,
            EXPLANATION_LINE,
            UNSAVED_LINE,
            { key: 'refusal', text: REFUSAL, tone: 'error' },
        ])
        expect(lines.at(-1)).toEqual({ key: 'refusal', text: REFUSAL, tone: 'error' })
    })

    it('shows no refusal line for an empty refusal', () => {
        expect(vendorDeleteLines({ name: 'Acme', isOpenAndDirty: false, refusal: '' })).toEqual([
            NAME_LINE,
            EXPLANATION_LINE,
        ])
    })
})

describe('vendorsEmptyHint', () => {
    it('asks a writer to add vendors', () => {
        expect(vendorsEmptyHint(true)).toBe(WRITER_HINT)
    })

    it('tells a read-only user that a bookkeeper adds them', () => {
        expect(vendorsEmptyHint(false)).toBe(READER_HINT)
    })
})

describe('vendorListCopy', () => {
    it('names the vendors list for a writer', () => {
        expect(vendorListCopy(true)).toEqual({
            title: 'Vendors',
            singular: 'vendor',
            plural: 'vendors',
            searchPlaceholder: 'Search vendors',
            emptyHint: WRITER_HINT,
        })
    })

    it("gives a read-only user the reader's hint", () => {
        expect(vendorListCopy(false).emptyHint).toBe(READER_HINT)
    })
})

import { describe, expect, it } from 'vitest'
import { vendorListCopy, vendorsEmptyHint } from '../tinycld/books/lib/vendor-display'

const WRITER_HINT = 'Add the people and companies you buy from.'
const READER_HINT = 'Vendors appear here once a bookkeeper adds them.'

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

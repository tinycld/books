import { describe, expect, it } from 'vitest'
import { accessFromRow } from '../tinycld/books/lib/access'

describe('accessFromRow', () => {
    it('denies everything until the row has loaded', () => {
        expect(accessFromRow({ level: 'admin' }, false)).toEqual({
            level: 'none',
            canRead: false,
            canWrite: false,
            isAdmin: false,
            isReady: false,
        })
    })

    it.each([
        ['none', false, false, false],
        ['read_only', true, false, false],
        ['bookkeeper', true, true, false],
        ['admin', true, true, true],
    ])('maps %s', (level, canRead, canWrite, isAdmin) => {
        expect(accessFromRow({ level }, true)).toEqual({
            level,
            canRead,
            canWrite,
            isAdmin,
            isReady: true,
        })
    })

    it('treats a missing or unknown level as none', () => {
        expect(accessFromRow(undefined, true).level).toBe('none')
        expect(accessFromRow({ level: 'owner' }, true).level).toBe('none')
    })
})

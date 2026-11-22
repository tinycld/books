import { describe, expect, it } from 'vitest'
import { DEPOSIT_READ_KEYS } from '../tinycld/books/lib/deposit-shortcuts'

// The deposit read view's keys (bank deposit spec §3.2): Edit E, Void V, View journal
// entry J.
describe('DEPOSIT_READ_KEYS', () => {
    it('maps edit to e, void to v and entry to j', () => {
        expect(DEPOSIT_READ_KEYS).toEqual({ edit: 'e', void: 'v', entry: 'j' })
    })
})

import { describe, expect, it } from 'vitest'
import { canWriteAccounts } from '../tinycld/books/lib/account-access'

describe('canWriteAccounts', () => {
    it('is false when access is not ready, even if writes are allowed', () => {
        expect(canWriteAccounts({ canWrite: true, isReady: false })).toBe(false)
    })

    it('is true when writes are allowed and access is ready', () => {
        expect(canWriteAccounts({ canWrite: true, isReady: true })).toBe(true)
    })

    it('is false when writes are not allowed', () => {
        expect(canWriteAccounts({ canWrite: false, isReady: true })).toBe(false)
    })
})

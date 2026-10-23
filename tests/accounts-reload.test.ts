import { describe, expect, it, vi } from 'vitest'
import { reloadCollections } from '../tinycld/books/lib/accounts-query'

// Fake collection-shaped inputs: only reload() is part of the contract.
const ok = () => ({ reload: vi.fn().mockResolvedValue(undefined) })
const failing = (err: unknown) => ({ reload: vi.fn().mockRejectedValue(err) })

describe('reloadCollections', () => {
    it('reloads every collection', async () => {
        const accounts = ok()
        const balances = ok()
        const onError = vi.fn()
        await reloadCollections([accounts, balances], onError)
        expect(accounts.reload).toHaveBeenCalledTimes(1)
        expect(balances.reload).toHaveBeenCalledTimes(1)
        expect(onError).not.toHaveBeenCalled()
    })

    it('never rejects and reports each failure once', async () => {
        const first = new Error('accounts down')
        const second = new Error('balances down')
        const onError = vi.fn()
        await expect(
            reloadCollections([failing(first), failing(second)], onError)
        ).resolves.toBeUndefined()
        expect(onError).toHaveBeenCalledTimes(2)
        expect(onError).toHaveBeenCalledWith(first)
        expect(onError).toHaveBeenCalledWith(second)
    })

    it('still reloads the other collection when one fails', async () => {
        const balances = ok()
        const onError = vi.fn()
        await reloadCollections([failing(new Error('x')), balances], onError)
        expect(balances.reload).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledTimes(1)
    })
})

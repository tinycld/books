import { describe, expect, it, vi } from 'vitest'

// A fresh module per test resets the shared warned-key set.
async function fresh() {
    vi.resetModules()
    const { log } = await import('@tinycld/core/lib/logger')
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {})
    const { warnOnce } = await import('../tinycld/books/lib/warn-once')
    const { ownBalance } = await import('../tinycld/books/lib/account-tree')
    const { accountDisplay } = await import('../tinycld/books/components/accounts/account-display')
    return { warn, warnOnce, ownBalance, accountDisplay }
}

describe('warnOnce', () => {
    it('logs the same key once with its context, message and extra', async () => {
        const { warn, warnOnce } = await fresh()
        warnOnce('k', 'books.ctx', 'something odd', { key: 'k' })
        warnOnce('k', 'books.other', 'again', { key: 'k2' })
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn).toHaveBeenCalledWith('books.ctx', 'something odd', { key: 'k' })
    })

    it('logs again for a distinct key', async () => {
        const { warn, warnOnce } = await fresh()
        warnOnce('a', 'c', 'm', {})
        warnOnce('b', 'c', 'm', {})
        expect(warn).toHaveBeenCalledTimes(2)
    })

    it('shares one set across ownBalance and accountDisplay', async () => {
        const { warn, ownBalance, accountDisplay } = await fresh()
        ownBalance('mystery', 10, 5)
        accountDisplay('mystery', 'x')
        expect(warn).toHaveBeenCalledTimes(1)
        accountDisplay('other_mystery', 'x')
        expect(warn).toHaveBeenCalledTimes(2)
    })
})

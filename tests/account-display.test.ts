import { describe, expect, it, vi } from 'vitest'

// A fresh module per test resets the warned-key memory.
async function freshDisplay() {
    vi.resetModules()
    const { log } = await import('@tinycld/core/lib/logger')
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {})
    const { accountDisplay } = await import('../tinycld/books/components/accounts/account-display')
    return { warn, accountDisplay }
}

describe('accountDisplay fallbacks', () => {
    it('falls back to the raw type key and warns once per distinct key', async () => {
        const { warn, accountDisplay } = await freshDisplay()
        expect(accountDisplay('bogus_type', 'x').typeLabel).toBe('bogus_type')
        expect(accountDisplay('bogus_type', 'x').group).toBeNull()
        expect(accountDisplay('bogus_type', 'y').typeLabel).toBe('bogus_type')
        expect(warn).toHaveBeenCalledTimes(1)
        accountDisplay('other_bogus', 'x')
        expect(warn).toHaveBeenCalledTimes(2)
        warn.mockRestore()
    })

    it('falls back to the raw detail key for a known type and warns once per key', async () => {
        const { warn, accountDisplay } = await freshDisplay()
        expect(accountDisplay('bank', 'no_such_detail').detailLabel).toBe('no_such_detail')
        expect(accountDisplay('bank', 'no_such_detail').typeLabel).toBe('Bank')
        expect(warn).toHaveBeenCalledTimes(1)
        accountDisplay('bank', 'another_missing')
        expect(warn).toHaveBeenCalledTimes(2)
        warn.mockRestore()
    })

    it('does not warn for a known type and detail type', async () => {
        const { warn, accountDisplay } = await freshDisplay()
        expect(accountDisplay('bank', 'checking').detailLabel).toBe('Checking')
        expect(warn).not.toHaveBeenCalled()
        warn.mockRestore()
    })
})

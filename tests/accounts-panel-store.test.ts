import { beforeEach, describe, expect, it } from 'vitest'
import { useAccountsPanelStore } from '../tinycld/books/stores/accounts-panel-store'

const state = () => useAccountsPanelStore.getState()

describe('useAccountsPanelStore', () => {
    beforeEach(() => {
        state().close()
    })

    it('starts closed', () => {
        expect(state().target).toBeNull()
    })

    it('openNew targets a new top-level account', () => {
        state().openNew()
        expect(state().target).toMatchObject({ mode: 'new', parentId: '' })
    })

    it('openSubAccount targets a new account under the parent', () => {
        state().openSubAccount('acct_fa_00001')
        expect(state().target).toMatchObject({ mode: 'new', parentId: 'acct_fa_00001' })
    })

    it('openEdit targets the account by id', () => {
        state().openEdit('acct_exp_0007')
        expect(state().target).toMatchObject({ mode: 'edit', id: 'acct_exp_0007' })
    })

    it('close clears the target', () => {
        state().openEdit('acct_exp_0007')
        state().close()
        expect(state().target).toBeNull()
    })

    it('a later open replaces the earlier target', () => {
        state().openSubAccount('acct_fa_00001')
        state().openEdit('acct_exp_0007')
        expect(state().target).toMatchObject({ mode: 'edit', id: 'acct_exp_0007' })
    })

    it.each([
        ['openNew', () => state().openNew()],
        ['openSubAccount', () => state().openSubAccount('acct_fa_00001')],
        ['openEdit', () => state().openEdit('acct_exp_0007')],
    ])('%s assigns a numeric seq', (_name, open) => {
        open()
        expect(typeof (state().target as { seq?: unknown }).seq).toBe('number')
    })

    it.each([
        ['openNew', () => state().openNew()],
        ['openSubAccount', () => state().openSubAccount('acct_fa_00001')],
        ['openEdit', () => state().openEdit('acct_exp_0007')],
    ])('two %s calls with the same key get different, increasing seq', (_name, open) => {
        open()
        const first = (state().target as { seq: number }).seq
        open()
        const second = (state().target as { seq: number }).seq
        expect(second).toBeGreaterThan(first)
    })

    it('seq keeps increasing across different opens and a close', () => {
        state().openNew()
        const a = (state().target as { seq: number }).seq
        state().openEdit('acct_exp_0007')
        const b = (state().target as { seq: number }).seq
        state().close()
        state().openSubAccount('acct_fa_00001')
        const c = (state().target as { seq: number }).seq
        expect(b).toBeGreaterThan(a)
        expect(c).toBeGreaterThan(b)
    })
})

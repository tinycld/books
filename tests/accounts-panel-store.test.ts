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
        expect(state().target).toEqual({ mode: 'new', parentId: '' })
    })

    it('openSubAccount targets a new account under the parent', () => {
        state().openSubAccount('acct_fa_00001')
        expect(state().target).toEqual({ mode: 'new', parentId: 'acct_fa_00001' })
    })

    it('openEdit targets the account by id', () => {
        state().openEdit('acct_exp_0007')
        expect(state().target).toEqual({ mode: 'edit', id: 'acct_exp_0007' })
    })

    it('close clears the target', () => {
        state().openEdit('acct_exp_0007')
        state().close()
        expect(state().target).toBeNull()
    })

    it('a later open replaces the earlier target', () => {
        state().openSubAccount('acct_fa_00001')
        state().openEdit('acct_exp_0007')
        expect(state().target).toEqual({ mode: 'edit', id: 'acct_exp_0007' })
    })
})

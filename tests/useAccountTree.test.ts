// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useAccountTree } from '../tinycld/books/hooks/useAccountTree'
import { buildAccountTree, defaultSort } from '../tinycld/books/lib/account-tree'
import { accountTypeDef } from '../tinycld/books/lib/account-types'
import { fixtureRows } from './accounts-test-rows'

function setup() {
    return renderHook(() => useAccountTree(fixtureRows()))
}

const ids = (hook: ReturnType<typeof setup>) => hook.result.current.rows.map(r => r.node.account.id)

describe('useAccountTree', () => {
    it('starts with every parent expanded', () => {
        const hook = setup()
        const parents = hook.result.current.rows.filter(r => r.hasChildren)
        expect(parents.length).toBeGreaterThan(0)
        expect(parents.every(r => !r.isCollapsed)).toBe(true)
        expect(ids(hook)).toContain('acct_exp_0005')
        expect(hook.result.current.areAllCollapsed).toBe(false)
    })

    it('toggleCollapsed hides the children and swaps the balance to the roll-up', () => {
        const hook = setup()
        const node = buildAccountTree(fixtureRows(), defaultSort)
            .flatMap(n => [n, ...n.children])
            .find(n => n.account.id === 'acct_exp_0001')
        expect(node?.rollupBalance).not.toBe(node?.ownBalance)
        act(() => hook.result.current.toggleCollapsed('acct_exp_0001'))
        const row = hook.result.current.rows.find(r => r.node.account.id === 'acct_exp_0001')
        expect(row?.isCollapsed).toBe(true)
        expect(row?.balance).toBe(node?.rollupBalance)
        expect(ids(hook)).not.toContain('acct_exp_0007')
        expect(ids(hook)).not.toContain('acct_exp_0005')
    })

    it('toggleAllCollapsed collapses every parent and a second call expands them', () => {
        const hook = setup()
        const before = ids(hook)
        act(() => hook.result.current.toggleAllCollapsed())
        expect(hook.result.current.areAllCollapsed).toBe(true)
        expect(hook.result.current.rows.every(r => r.node.depth === 1)).toBe(true)
        expect(hook.result.current.rows.filter(r => r.hasChildren).every(r => r.isCollapsed)).toBe(
            true
        )
        act(() => hook.result.current.toggleAllCollapsed())
        expect(hook.result.current.areAllCollapsed).toBe(false)
        expect(ids(hook)).toEqual(before)
    })

    it('onSort name twice reverses the sibling order', () => {
        const hook = setup()
        const siblings = () =>
            hook.result.current.rows
                .filter(r => r.node.account.parent === 'acct_exp_0001')
                .map(r => r.node.account.id)
        act(() => hook.result.current.onSort('name'))
        expect(siblings()).toEqual(['acct_exp_0002', 'acct_exp_0007', 'acct_exp_0008'])
        act(() => hook.result.current.onSort('name'))
        expect(siblings()).toEqual(['acct_exp_0008', 'acct_exp_0007', 'acct_exp_0002'])
        expect(hook.result.current.sort).toEqual({ key: 'name', direction: 'desc' })
    })

    it('setQuery keeps the ancestors of matches', () => {
        const hook = setup()
        act(() => hook.result.current.setQuery('rent'))
        expect(ids(hook)).toEqual(['acct_exp_0001', 'acct_exp_0007'])
        expect(hook.result.current.query).toBe('rent')
    })

    it('setGroup expense leaves only expense rows', () => {
        const hook = setup()
        act(() => hook.result.current.setGroup('expense'))
        const rows = hook.result.current.rows
        expect(rows.length).toBeGreaterThan(0)
        expect(rows.every(r => accountTypeDef(r.node.account.type)?.group === 'expense')).toBe(true)
        expect(ids(hook)).not.toContain('acct_bank_0001')
    })

    it('hides inactive rows unless showInactive is set', () => {
        const hook = setup()
        expect(hook.result.current.showInactive).toBe(false)
        expect(hook.result.current.rows.some(r => r.node.account.inactive)).toBe(false)
        expect(ids(hook)).not.toContain('acct_fa_00007')
        act(() => hook.result.current.setShowInactive(true))
        expect(ids(hook)).toContain('acct_fa_00007')
    })

    it('clearFilters resets the query, the group and the inactive toggle', () => {
        const hook = setup()
        act(() => {
            hook.result.current.setQuery('rent')
            hook.result.current.setGroup('expense')
            hook.result.current.setShowInactive(true)
        })
        expect(hook.result.current.hasFilters).toBe(true)
        act(() => hook.result.current.clearFilters())
        expect(hook.result.current.query).toBe('')
        expect(hook.result.current.group).toBe('')
        expect(hook.result.current.showInactive).toBe(false)
        expect(hook.result.current.hasFilters).toBe(false)
    })

    it('hasFilters is true for each filter alone', () => {
        const hook = setup()
        expect(hook.result.current.hasFilters).toBe(false)
        act(() => hook.result.current.setQuery('x'))
        expect(hook.result.current.hasFilters).toBe(true)
        act(() => hook.result.current.clearFilters())
        act(() => hook.result.current.setGroup('income'))
        expect(hook.result.current.hasFilters).toBe(true)
        act(() => hook.result.current.clearFilters())
        act(() => hook.result.current.setShowInactive(true))
        expect(hook.result.current.hasFilters).toBe(true)
    })

    it('isEmpty is true for no accounts and false otherwise', () => {
        expect(renderHook(() => useAccountTree([])).result.current.isEmpty).toBe(true)
        expect(setup().result.current.isEmpty).toBe(false)
    })

    it('canToggle is false while a query is set and true otherwise', () => {
        const hook = setup()
        expect(hook.result.current.canToggle).toBe(true)
        act(() => hook.result.current.setQuery('rent'))
        expect(hook.result.current.canToggle).toBe(false)
        act(() => hook.result.current.setQuery(''))
        expect(hook.result.current.canToggle).toBe(true)
        act(() => hook.result.current.setGroup('expense'))
        expect(hook.result.current.canToggle).toBe(true)
    })

    it('keeps the caret when the query is only whitespace', () => {
        const hook = setup()
        act(() => hook.result.current.toggleCollapsed('acct_exp_0001'))
        act(() => hook.result.current.setQuery('  '))
        expect(hook.result.current.canToggle).toBe(true)
        const row = hook.result.current.rows.find(r => r.node.account.id === 'acct_exp_0001')
        expect(row?.hasChildren).toBe(true)
        expect(row?.isCollapsed).toBe(true)
        expect(hook.result.current.hasFilters).toBe(false)
    })

    it('removes the caret while a real query is set', () => {
        const hook = setup()
        act(() => hook.result.current.toggleCollapsed('acct_exp_0001'))
        act(() => hook.result.current.setQuery('rent'))
        expect(hook.result.current.canToggle).toBe(false)
    })

    it('keeps matching children visible under a collapsed parent while a query is set', () => {
        const hook = setup()
        act(() => hook.result.current.toggleCollapsed('acct_exp_0001'))
        act(() => hook.result.current.setQuery('rent'))
        expect(hook.result.current.canToggle).toBe(false)
        expect(ids(hook)).toContain('acct_exp_0007')
    })
})

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
        act(() => hook.result.current.clearFilters())
        expect(hook.result.current.query).toBe('')
        expect(hook.result.current.group).toBe('')
        expect(hook.result.current.showInactive).toBe(false)
    })

    it('does not expose hasFilters; the view defines its own', () => {
        expect('hasFilters' in setup().result.current).toBe(false)
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

    it('hasParents is true when any account has children', () => {
        expect(setup().result.current.hasParents).toBe(true)
    })

    it('hasParents is false for a flat chart', () => {
        const flat = fixtureRows().map(row => ({ ...row, parent: '' }))
        expect(renderHook(() => useAccountTree(flat)).result.current.hasParents).toBe(false)
    })

    it('hasParents is false for no accounts', () => {
        expect(renderHook(() => useAccountTree([])).result.current.hasParents).toBe(false)
    })
})

describe('useAccountTree hasParents and areAllCollapsed follow the visible parents', () => {
    // The fixture's income group has a parent; flatten it so only expense and the
    // other groups keep parents.
    const noIncomeParents = () =>
        fixtureRows().map(row =>
            accountTypeDef(row.type)?.group === 'income' ? { ...row, parent: '' } : row
        )

    const parentsOf = (group: string) =>
        noIncomeParents().filter(r => accountTypeDef(r.type)?.group === group && r.parent !== '')

    it('the fixture setup has no income parents and some expense parents', () => {
        expect(parentsOf('income')).toHaveLength(0)
        expect(parentsOf('expense').length).toBeGreaterThan(0)
    })

    it('hasParents is false when the group filter hides every parent', () => {
        const hook = renderHook(() => useAccountTree(noIncomeParents()))
        expect(hook.result.current.hasParents).toBe(true)
        act(() => hook.result.current.setGroup('income'))
        expect(hook.result.current.hasParents).toBe(false)
    })

    it('hasParents is true when the group filter keeps a parent', () => {
        const hook = renderHook(() => useAccountTree(noIncomeParents()))
        act(() => hook.result.current.setGroup('expense'))
        expect(hook.result.current.hasParents).toBe(true)
    })

    it('areAllCollapsed is false for a group with no parents, never vacuously true', () => {
        const hook = renderHook(() => useAccountTree(noIncomeParents()))
        act(() => hook.result.current.setGroup('income'))
        expect(hook.result.current.areAllCollapsed).toBe(false)
    })

    it('areAllCollapsed is true when every visible parent is collapsed, hidden-group parents expanded', () => {
        const hook = renderHook(() => useAccountTree(noIncomeParents()))
        act(() => hook.result.current.setGroup('expense'))
        const expenseParents = new Set(parentsOf('expense').map(r => r.parent))
        expect(expenseParents.size).toBeGreaterThan(0)
        act(() => {
            for (const id of expenseParents) hook.result.current.toggleCollapsed(id)
        })
        expect(hook.result.current.areAllCollapsed).toBe(true)
    })

    it('areAllCollapsed is false while one visible parent stays expanded', () => {
        const hook = renderHook(() => useAccountTree(noIncomeParents()))
        act(() => hook.result.current.setGroup('expense'))
        const [first] = [...new Set(parentsOf('expense').map(r => r.parent))]
        act(() => hook.result.current.toggleCollapsed(first))
        expect(hook.result.current.areAllCollapsed).toBe(false)
    })

    it('toggleAllCollapsed under a group filter makes areAllCollapsed true', () => {
        const hook = renderHook(() => useAccountTree(noIncomeParents()))
        act(() => hook.result.current.setGroup('expense'))
        act(() => hook.result.current.toggleAllCollapsed())
        expect(hook.result.current.areAllCollapsed).toBe(true)
    })

    describe('inactive-only parents', () => {
        // A single parent that is inactive, with one inactive child, plus a flat active account.
        const base = fixtureRows()
        const template = base.find(r => r.id === 'acct_exp_0010') as (typeof base)[number]
        const rows = [
            { ...template, id: 'p_inactive', parent: '', inactive: true },
            { ...template, id: 'c_inactive', parent: 'p_inactive', inactive: true },
            { ...template, id: 'flat_active', parent: '', inactive: false },
        ]

        it('ignores them while showInactive is off', () => {
            const hook = renderHook(() => useAccountTree(rows))
            expect(hook.result.current.hasParents).toBe(false)
            expect(hook.result.current.areAllCollapsed).toBe(false)
        })

        it('counts them once showInactive is on', () => {
            const hook = renderHook(() => useAccountTree(rows))
            act(() => hook.result.current.setShowInactive(true))
            expect(hook.result.current.hasParents).toBe(true)
        })
    })
})

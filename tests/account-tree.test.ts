import { describe, expect, it, vi } from 'vitest'
import {
    accountPath,
    activeChildCount,
    buildAccountTree,
    defaultSort,
    flattenAccountTree,
    maxAccountDepth,
    nextSort,
    ownBalance,
    parentChoices,
    parentIds,
    type TreeAccount,
    type TreeFilters,
    type TreeNode,
} from '../tinycld/books/lib/account-tree'
import { accountTypeDef } from '../tinycld/books/lib/account-types'
import { ACCOUNTS, BALANCES } from '../tinycld/books/lib/chart-of-accounts-fixture'

function acct(partial: Partial<TreeAccount> & Pick<TreeAccount, 'id'>): TreeAccount {
    return {
        name: partial.id,
        number: '',
        type: 'bank',
        parent: '',
        inactive: false,
        debit_total: 0,
        credit_total: 0,
        ...partial,
    }
}

const fixtureAccounts: TreeAccount[] = ACCOUNTS.map(a => {
    const rows = BALANCES.filter(b => b.account === a.id)
    return {
        id: a.id,
        name: a.name,
        number: a.number,
        type: a.type,
        parent: a.parent,
        inactive: a.inactive,
        debit_total: rows.reduce((sum, r) => sum + r.debit_total, 0),
        credit_total: rows.reduce((sum, r) => sum + r.credit_total, 0),
    }
})

function allFilters(over: Partial<TreeFilters> = {}): TreeFilters {
    return { collapsed: new Set(), query: '', group: '', showInactive: true, ...over }
}

function find<T extends TreeAccount>(nodes: TreeNode<T>[], id: string): TreeNode<T> | undefined {
    for (const node of nodes) {
        if (node.account.id === id) return node
        const hit = find(node.children, id)
        if (hit) return hit
    }
    return undefined
}

function visibleIds(over: Partial<TreeFilters> = {}) {
    const tree = buildAccountTree(fixtureAccounts, defaultSort)
    return flattenAccountTree(tree, allFilters(over)).map(r => r.node.account.id)
}

describe('ownBalance', () => {
    it('is debits minus credits for a debit-normal type', () => {
        expect(ownBalance('bank', 500, 200)).toBe(300)
    })

    it('is credits minus debits for a credit-normal type', () => {
        expect(ownBalance('credit_card', 200, 500)).toBe(300)
    })

    it('stays negative when the account runs against its normal side', () => {
        expect(ownBalance('bank', 100, 300)).toBe(-200)
        expect(ownBalance('credit_card', 500, 200)).toBe(-300)
    })
})

describe('buildAccountTree', () => {
    it('puts a child under its parent at depth 2', () => {
        const tree = buildAccountTree(
            [acct({ id: 'p' }), acct({ id: 'c', parent: 'p' })],
            defaultSort
        )
        expect(tree).toHaveLength(1)
        expect(tree[0].children.map(n => n.account.id)).toEqual(['c'])
        expect(tree[0].children[0].depth).toBe(2)
    })

    it('makes an account with no parent top level at depth 1', () => {
        const tree = buildAccountTree([acct({ id: 'p', parent: '' })], defaultSort)
        expect(tree[0].depth).toBe(1)
    })

    it('treats an account whose parent id is missing as top level', () => {
        const tree = buildAccountTree([acct({ id: 'orphan', parent: 'gone' })], defaultSort)
        expect(tree.map(n => n.account.id)).toEqual(['orphan'])
        expect(tree[0].depth).toBe(1)
    })

    it('numbers depth 1-based down to maxAccountDepth in the fixture', () => {
        const tree = buildAccountTree(fixtureAccounts, defaultSort)
        expect(maxAccountDepth).toBe(5)
        expect(find(tree, 'acct_fa_00005')?.depth).toBe(maxAccountDepth)
        expect(find(tree, 'acct_fa_00001')?.depth).toBe(1)
    })

    it('carries own balance on each node', () => {
        const tree = buildAccountTree(fixtureAccounts, defaultSort)
        expect(find(tree, 'acct_bank_0002')?.ownBalance).toBe(
            4_820_000 + 3_100_000 - 2_105_050 - 1_980_025
        )
    })
})

describe('sorting', () => {
    it('sorts siblings by number, blank last, then name', () => {
        const tree = buildAccountTree(
            [
                acct({ id: 'a', name: 'Zulu', number: '' }),
                acct({ id: 'b', name: 'Alpha', number: '' }),
                acct({ id: 'c', name: 'Beta', number: '1000' }),
                acct({ id: 'd', name: 'Alpha', number: '1000' }),
                acct({ id: 'e', name: 'Mid', number: '2000' }),
            ],
            defaultSort
        )
        expect(tree.map(n => n.account.id)).toEqual(['d', 'c', 'e', 'b', 'a'])
    })

    it('defaults to no column key', () => {
        expect(defaultSort.key).toBeNull()
    })

    it('toggles ascending then descending on the same key', () => {
        const first = nextSort(defaultSort, 'name')
        expect(first).toEqual({ key: 'name', direction: 'asc' })
        expect(nextSort(first, 'name')).toEqual({ key: 'name', direction: 'desc' })
    })

    it('resets to ascending on a new key', () => {
        const desc = nextSort(nextSort(defaultSort, 'name'), 'name')
        expect(nextSort(desc, 'balance')).toEqual({ key: 'balance', direction: 'asc' })
    })

    it('does not sort by balance in buildAccountTree; flattenAccountTree does', () => {
        const accounts = [
            acct({ id: 'P', number: '1', debit_total: 50 }),
            acct({ id: 'Q', number: '2', debit_total: 200 }),
            acct({ id: 'C1', number: '1', parent: 'P', debit_total: 300 }),
            acct({ id: 'C2', number: '2', parent: 'P', debit_total: 100 }),
        ]
        const order = (nodes: TreeNode<TreeAccount>[]): unknown[] =>
            nodes.map(n => [n.account.id, order(n.children)])
        const byDefault = buildAccountTree(accounts, defaultSort)
        for (const direction of ['asc', 'desc'] as const) {
            const built = buildAccountTree(accounts, { key: 'balance', direction })
            expect(order(built)).toEqual(order(byDefault))
        }
        expect(order(byDefault)).toEqual([
            [
                'P',
                [
                    ['C1', []],
                    ['C2', []],
                ],
            ],
            ['Q', []],
        ])
    })

    it('orders by balance only through filters.sort in flattenAccountTree', () => {
        const accounts = [
            acct({ id: 'P', number: '1', debit_total: 50 }),
            acct({ id: 'Q', number: '2', debit_total: 200 }),
            acct({ id: 'C1', number: '1', parent: 'P', debit_total: 300 }),
            acct({ id: 'C2', number: '2', parent: 'P', debit_total: 100 }),
        ]
        const tree = buildAccountTree(accounts, { key: 'balance', direction: 'desc' })
        const ids = (direction: 'asc' | 'desc') =>
            flattenAccountTree(tree, {
                ...allFilters(),
                sort: { key: 'balance', direction },
            }).map(r => r.node.account.id)
        expect(ids('asc')).toEqual(['P', 'C2', 'C1', 'Q'])
        expect(ids('desc')).toEqual(['Q', 'P', 'C1', 'C2'])
    })

    it('sorts by name and reverses on desc', () => {
        const accounts = [
            acct({ id: 'a', name: 'Bravo', number: '1' }),
            acct({ id: 'b', name: 'alpha', number: '2' }),
        ]
        const asc = buildAccountTree(accounts, { key: 'name', direction: 'asc' })
        expect(asc.map(n => n.account.id)).toEqual(['b', 'a'])
        const desc = buildAccountTree(accounts, { key: 'name', direction: 'desc' })
        expect(desc.map(n => n.account.id)).toEqual(['a', 'b'])
    })
})

describe('rollupBalance', () => {
    it('adds ALL descendants of the same type, inactive ones included', () => {
        const tree = buildAccountTree(fixtureAccounts, defaultSort)
        // 95,000 own + Payroll subtree + Rent + Utilities + inactive Legal (250,000)
        expect(find(tree, 'acct_exp_0001')?.rollupBalance).toBe(11_114_220)
    })

    it('does not add a descendant of another type', () => {
        const tree = buildAccountTree(
            [
                acct({ id: 'p', type: 'bank', debit_total: 100 }),
                acct({ id: 'same', type: 'bank', parent: 'p', debit_total: 20 }),
                acct({ id: 'other', type: 'fixed_asset', parent: 'p', debit_total: 5000 }),
            ],
            defaultSort
        )
        expect(tree[0].rollupBalance).toBe(120)
    })

    it('equals own balance for a leaf', () => {
        const tree = buildAccountTree(fixtureAccounts, defaultSort)
        const leaf = find(tree, 'acct_exp_0008')
        expect(leaf?.rollupBalance).toBe(leaf?.ownBalance)
    })
})

describe('flattenAccountTree', () => {
    it('hides the children of a collapsed node', () => {
        const ids = visibleIds({ collapsed: new Set(['acct_exp_0001']) })
        expect(ids).toContain('acct_exp_0001')
        expect(ids).not.toContain('acct_exp_0002')
        expect(ids).not.toContain('acct_exp_0005')
        expect(ids).toContain('acct_exp_0010')
    })

    it('shows the roll-up on a collapsed parent', () => {
        const tree = buildAccountTree(fixtureAccounts, defaultSort)
        const rows = flattenAccountTree(tree, allFilters({ collapsed: new Set(['acct_exp_0001']) }))
        const row = rows.find(r => r.node.account.id === 'acct_exp_0001')
        expect(row?.hasChildren).toBe(true)
        expect(row?.isCollapsed).toBe(true)
        expect(row?.showsRollup).toBe(true)
        expect(row?.balance).toBe(11_114_220)
    })

    it('keeps inactive descendants in the roll-up when showInactive is off', () => {
        const tree = buildAccountTree(fixtureAccounts, defaultSort)
        const rows = flattenAccountTree(
            tree,
            allFilters({ collapsed: new Set(['acct_exp_0001']), showInactive: false })
        )
        expect(rows.find(r => r.node.account.id === 'acct_exp_0001')?.balance).toBe(11_114_220)
    })

    it('shows the own balance on an expanded parent', () => {
        const tree = buildAccountTree(fixtureAccounts, defaultSort)
        const row = flattenAccountTree(tree, allFilters()).find(
            r => r.node.account.id === 'acct_exp_0001'
        )
        expect(row?.isCollapsed).toBe(false)
        expect(row?.showsRollup).toBe(false)
        expect(row?.balance).toBe(95_000)
    })

    it('never shows a roll-up on a leaf', () => {
        const tree = buildAccountTree(fixtureAccounts, defaultSort)
        const row = flattenAccountTree(
            tree,
            allFilters({ collapsed: new Set(['acct_exp_0008']) })
        ).find(r => r.node.account.id === 'acct_exp_0008')
        expect(row?.hasChildren).toBe(false)
        expect(row?.showsRollup).toBe(false)
    })

    it('matches a query on name, case insensitively, and keeps expanded ancestors', () => {
        const collapsed = new Set(['acct_exp_0001', 'acct_exp_0002', 'acct_exp_0003'])
        const tree = buildAccountTree(fixtureAccounts, defaultSort)
        const rows = flattenAccountTree(tree, allFilters({ collapsed, query: 'PLATFORM' }))
        expect(rows.map(r => r.node.account.id)).toEqual([
            'acct_exp_0001',
            'acct_exp_0002',
            'acct_exp_0003',
            'acct_exp_0004',
            'acct_exp_0005',
        ])
        for (const ancestor of rows.slice(0, 4)) {
            expect(ancestor.isCollapsed).toBe(false)
            expect(ancestor.showsRollup).toBe(false)
        }
    })

    it('matches a query on number, case insensitively', () => {
        expect(visibleIds({ query: '1511.1a' })).toEqual([
            'acct_fa_00001',
            'acct_fa_00002',
            'acct_fa_00003',
            'acct_fa_00004',
            'acct_fa_00005',
        ])
    })

    it('filters by group', () => {
        const ids = visibleIds({ group: 'income' })
        expect(ids.sort()).toEqual(
            ['acct_inc_0001', 'acct_inc_0002', 'acct_inc_0003', 'acct_inc_0004'].sort()
        )
        for (const id of ids) {
            const account = fixtureAccounts.find(a => a.id === id)
            expect(accountTypeDef(account?.type ?? '')?.group).toBe('income')
        }
    })

    it('drops inactive accounts when showInactive is false', () => {
        const ids = visibleIds({ showInactive: false })
        expect(ids).not.toContain('acct_exp_0009')
        expect(ids).not.toContain('acct_fa_00007')
        expect(ids).toContain('acct_exp_0008')
    })

    it('drops the whole subtree under an inactive parent when showInactive is false', () => {
        const tree = buildAccountTree(
            [
                acct({ id: 'off', inactive: true }),
                acct({ id: 'kid', parent: 'off' }),
                acct({ id: 'on' }),
            ],
            defaultSort
        )
        const hidden = flattenAccountTree(tree, allFilters({ showInactive: false }))
        expect(hidden.map(r => r.node.account.id)).toEqual(['on'])
        const shown = flattenAccountTree(tree, allFilters({ showInactive: true }))
        expect(shown.map(r => r.node.account.id).sort()).toEqual(['kid', 'off', 'on'])
    })

    it('lists the fixture in tree order with nothing filtered', () => {
        const ids = visibleIds()
        expect(ids).toHaveLength(fixtureAccounts.length)
        expect(ids.indexOf('acct_bank_0001')).toBeLessThan(ids.indexOf('acct_bank_0002'))
    })
})

describe('parentIds', () => {
    it('lists every node that has children', () => {
        const tree = buildAccountTree(fixtureAccounts, defaultSort)
        const ids = parentIds(tree)
        expect(ids).toContain('acct_exp_0001')
        expect(ids).toContain('acct_fa_00004')
        expect(ids).not.toContain('acct_exp_0008')
        expect(ids).not.toContain('acct_fa_00005')
    })
})

describe('parentChoices', () => {
    const ids = (list: TreeAccount[]) => list.map(a => a.id).sort()

    it('excludes the editing account and its descendants', () => {
        const choices = parentChoices(fixtureAccounts, {
            type: 'expense',
            editingId: 'acct_exp_0002',
        })
        const got = ids(choices)
        expect(got).not.toContain('acct_exp_0002')
        for (const d of ['acct_exp_0003', 'acct_exp_0004', 'acct_exp_0005', 'acct_exp_0006']) {
            expect(got).not.toContain(d)
        }
        expect(got).toContain('acct_exp_0001')
    })

    it('offers only accounts of the chosen type', () => {
        const choices = parentChoices(fixtureAccounts, { type: 'bank', editingId: '' })
        expect(ids(choices)).toEqual(
            ['acct_bank_0001', 'acct_bank_0002', 'acct_bank_0003', 'acct_bank_0004'].sort()
        )
    })

    it('never offers a depth-5 account', () => {
        const got = ids(parentChoices(fixtureAccounts, { type: 'fixed_asset', editingId: '' }))
        expect(got).not.toContain('acct_fa_00005')
        expect(got).toContain('acct_fa_00004')
    })

    it('counts the height of the editing subtree', () => {
        // Equipment holds Computers > Laptops > Engineering laptops (height 3).
        const got = ids(
            parentChoices(fixtureAccounts, { type: 'fixed_asset', editingId: 'acct_fa_00002' })
        )
        expect(got).toEqual(['acct_fa_00001'])
    })

    it('offers a depth-4 account only to an account with no children', () => {
        const accounts = [
            acct({ id: 'A' }),
            acct({ id: 'B', parent: 'A' }),
            acct({ id: 'C', parent: 'B' }),
            acct({ id: 'D', parent: 'C' }),
            acct({ id: 'X' }),
            acct({ id: 'Y', parent: 'X' }),
            acct({ id: 'Z' }),
        ]
        const forLeaf = ids(parentChoices(accounts, { type: 'bank', editingId: 'Z' }))
        expect(forLeaf).toContain('D')
        const forParent = ids(parentChoices(accounts, { type: 'bank', editingId: 'X' }))
        expect(forParent).not.toContain('D')
        expect(forParent).toContain('C')
    })
})

describe('activeChildCount', () => {
    it('ignores inactive children', () => {
        const accounts = [
            acct({ id: 'p' }),
            acct({ id: 'a', parent: 'p' }),
            acct({ id: 'b', parent: 'p', inactive: true }),
            acct({ id: 'c', parent: 'p' }),
            acct({ id: 'other', parent: 'a' }),
        ]
        expect(activeChildCount(accounts, 'p')).toBe(2)
    })
})

describe('accountPath', () => {
    it('joins names from the top with a colon', () => {
        const top = acct({ id: 'top', name: 'Top' })
        const mid = acct({ id: 'mid', name: 'Mid', parent: 'top' })
        const leaf = acct({ id: 'leaf', name: 'Leaf', parent: 'mid' })
        const byId = new Map([top, mid, leaf].map(a => [a.id, a]))
        expect(accountPath(leaf, byId)).toBe('Top:Mid:Leaf')
        expect(accountPath(top, byId)).toBe('Top')
    })
})

// Assumed signature for the displayed-balance sort: TreeFilters gains an optional
// `sort: SortState`, and flattenAccountTree(nodes, filters) orders siblings by the
// balance the row DISPLAYS (roll-up when collapsed, own balance when expanded).
// The tree itself is built with defaultSort.
function flatWithSort(
    accounts: TreeAccount[],
    sort: { key: 'name' | 'type' | 'balance' | null; direction: 'asc' | 'desc' },
    over: Partial<TreeFilters> = {}
) {
    const filters = { ...allFilters(over), sort }
    return flattenAccountTree(buildAccountTree(accounts, defaultSort), filters)
}

describe('balance sort uses the displayed balance', () => {
    const accounts = [
        acct({ id: 'P', type: 'expense', debit_total: 100 }),
        acct({ id: 'C', type: 'expense', parent: 'P', debit_total: 900 }),
        acct({ id: 'Q', type: 'expense', debit_total: 500 }),
    ]

    it('sorts a collapsed parent by its roll-up', () => {
        const asc = flatWithSort(
            accounts,
            { key: 'balance', direction: 'asc' },
            { collapsed: new Set(['P']) }
        )
        expect(asc.map(r => r.node.account.id)).toEqual(['Q', 'P'])
        const desc = flatWithSort(
            accounts,
            { key: 'balance', direction: 'desc' },
            { collapsed: new Set(['P']) }
        )
        expect(desc.map(r => r.node.account.id)).toEqual(['P', 'Q'])
    })

    it('sorts an expanded parent by its own balance', () => {
        const asc = flatWithSort(accounts, { key: 'balance', direction: 'asc' })
        expect(asc.map(r => r.node.account.id)).toEqual(['P', 'C', 'Q'])
        const desc = flatWithSort(accounts, { key: 'balance', direction: 'desc' })
        expect(desc.map(r => r.node.account.id)).toEqual(['Q', 'P', 'C'])
    })
})

describe('child-level sort in flattenAccountTree', () => {
    const ids = (rows: { node: { account: { id: string } } }[]) => rows.map(r => r.node.account.id)

    it('orders children by the roll-up of a collapsed child parent', () => {
        const accounts = [
            acct({ id: 'R', type: 'expense', number: '0' }),
            acct({ id: 'X', type: 'expense', parent: 'R', debit_total: 500 }),
            acct({ id: 'Y', type: 'expense', parent: 'R', debit_total: 100 }),
            acct({ id: 'Y1', type: 'expense', parent: 'Y', debit_total: 900 }),
            acct({ id: 'Z', type: 'expense', parent: 'R', debit_total: 700 }),
        ]
        const sort = { key: 'balance', direction: 'asc' } as const
        const collapsed = flatWithSort(accounts, sort, { collapsed: new Set(['Y']) })
        expect(ids(collapsed)).toEqual(['R', 'X', 'Z', 'Y'])
        const open = flatWithSort(accounts, sort)
        expect(ids(open)).toEqual(['R', 'Y', 'Y1', 'X', 'Z'])
    })

    it('breaks balance ties by name', () => {
        const accounts = [
            acct({ id: 'R', number: '0' }),
            acct({ id: 'b', name: 'Bravo', parent: 'R', debit_total: 50 }),
            acct({ id: 'a', name: 'Alpha', parent: 'R', debit_total: 50 }),
        ]
        const asc = flatWithSort(accounts, { key: 'balance', direction: 'asc' })
        expect(ids(asc)).toEqual(['R', 'a', 'b'])
    })

    it('uses credits minus debits for a credit-normal child', () => {
        const accounts = [
            acct({ id: 'R', type: 'credit_card', number: '0' }),
            acct({ id: 'big', type: 'credit_card', parent: 'R', credit_total: 300 }),
            acct({ id: 'small', type: 'credit_card', parent: 'R', credit_total: 100 }),
            acct({
                id: 'mid',
                type: 'credit_card',
                parent: 'R',
                credit_total: 500,
                debit_total: 300,
            }),
        ]
        const asc = flatWithSort(accounts, { key: 'balance', direction: 'asc' })
        expect(ids(asc)).toEqual(['R', 'small', 'mid', 'big'])
        const desc = flatWithSort(accounts, { key: 'balance', direction: 'desc' })
        expect(ids(desc)).toEqual(['R', 'big', 'mid', 'small'])
    })

    it('applies the name key from filters.sort at every level', () => {
        const accounts = [
            acct({ id: 'p1', name: 'Zed', number: '1' }),
            acct({ id: 'p2', name: 'Abe', number: '2' }),
            acct({ id: 'c1', name: 'Yak', number: '1', parent: 'p1' }),
            acct({ id: 'c2', name: 'Bee', number: '2', parent: 'p1' }),
        ]
        const asc = flatWithSort(accounts, { key: 'name', direction: 'asc' })
        expect(ids(asc)).toEqual(['p2', 'p1', 'c2', 'c1'])
        const desc = flatWithSort(accounts, { key: 'name', direction: 'desc' })
        expect(ids(desc)).toEqual(['p1', 'c1', 'c2', 'p2'])
    })

    it('applies the type key from filters.sort at every level', () => {
        const accounts = [
            acct({ id: 'R', type: 'income', number: '0' }),
            acct({ id: 'inc', name: 'Aaa', type: 'income', number: '1', parent: 'R' }),
            acct({ id: 'exp', name: 'Zzz', type: 'expense', number: '2', parent: 'R' }),
        ]
        const label = (t: string) => accountTypeDef(t)?.label ?? ''
        const expected = ['inc', 'exp'].sort((x, y) =>
            label(x === 'inc' ? 'income' : 'expense').localeCompare(
                label(y === 'inc' ? 'income' : 'expense')
            )
        )
        const asc = flatWithSort(accounts, { key: 'type', direction: 'asc' })
        expect(ids(asc)).toEqual(['R', ...expected])
        const desc = flatWithSort(accounts, { key: 'type', direction: 'desc' })
        expect(ids(desc)).toEqual(['R', ...expected.slice().reverse()])
    })
})

describe('hasChildren uses all children', () => {
    it('keeps the caret when every child is inactive and hidden, and shows the roll-up when collapsed', () => {
        const accounts = [
            acct({ id: 'P', type: 'expense', debit_total: 100 }),
            acct({ id: 'K', type: 'expense', parent: 'P', inactive: true, debit_total: 40 }),
        ]
        const tree = buildAccountTree(accounts, defaultSort)
        const open = flattenAccountTree(tree, allFilters({ showInactive: false }))
        expect(open).toHaveLength(1)
        expect(open[0].hasChildren).toBe(true)
        expect(open[0].showsRollup).toBe(false)
        expect(open[0].balance).toBe(100)

        const closed = flattenAccountTree(
            tree,
            allFilters({ showInactive: false, collapsed: new Set(['P']) })
        )
        expect(closed).toHaveLength(1)
        expect(closed[0].hasChildren).toBe(true)
        expect(closed[0].isCollapsed).toBe(true)
        expect(closed[0].showsRollup).toBe(true)
        expect(closed[0].balance).toBe(140)
    })

    it('keeps hasChildren true, open and own balance when the parent matches a query but its children do not', () => {
        const accounts = [
            acct({ id: 'P', name: 'Parent', type: 'expense', debit_total: 100 }),
            acct({ id: 'K', name: 'Kid', type: 'expense', parent: 'P', debit_total: 40 }),
        ]
        const tree = buildAccountTree(accounts, defaultSort)
        const rows = flattenAccountTree(
            tree,
            allFilters({ query: 'parent', collapsed: new Set(['P']) })
        )
        expect(rows).toHaveLength(1)
        expect(rows[0].node.account.id).toBe('P')
        expect(rows[0].hasChildren).toBe(true)
        expect(rows[0].isCollapsed).toBe(false)
        expect(rows[0].showsRollup).toBe(false)
        expect(rows[0].balance).toBe(100)
    })
})

describe('parent cycles', () => {
    it('keeps both accounts of an A -> B -> A cycle, each once', () => {
        const accounts = [
            acct({ id: 'A', parent: 'B' }),
            acct({ id: 'B', parent: 'A' }),
            acct({ id: 'Z' }),
        ]
        const tree = buildAccountTree(accounts, defaultSort)
        const ids: string[] = []
        const collect = (nodes: TreeNode<TreeAccount>[]) => {
            for (const n of nodes) {
                ids.push(n.account.id)
                collect(n.children)
            }
        }
        collect(tree)
        expect(ids.slice().sort()).toEqual(['A', 'B', 'Z'])
    })
})

describe('parent cycle promotion is deterministic', () => {
    function orders<T>(items: T[]): T[][] {
        return [
            items,
            items.slice().reverse(),
            [items[1], items[2], items[0]],
            [items[2], items[0], items[1]],
        ]
    }
    const idsOf = (nodes: TreeNode<TreeAccount>[]) => nodes.map(n => n.account.id)

    it('promotes the lowest id of an A <-> B cycle regardless of input order', () => {
        const base = [
            acct({ id: 'A', parent: 'B', debit_total: 10 }),
            acct({ id: 'B', parent: 'A', debit_total: 20 }),
            acct({ id: 'Z', debit_total: 5 }),
        ]
        for (const input of orders(base)) {
            const tree = buildAccountTree(input, defaultSort)
            expect(idsOf(tree).slice().sort()).toEqual(['A', 'Z'])
            expect(idsOf(find(tree, 'A')?.children ?? [])).toEqual(['B'])
        }
    })

    it('promotes the lowest id of a 3-cycle regardless of input order', () => {
        const base = [
            acct({ id: 'A', parent: 'B' }),
            acct({ id: 'B', parent: 'C' }),
            acct({ id: 'C', parent: 'A' }),
        ]
        for (const input of orders(base)) {
            const tree = buildAccountTree(input, defaultSort)
            expect(idsOf(tree)).toEqual(['A'])
        }
    })

    it('keeps a tail account under its parent when the cycle is promoted', () => {
        const base = [
            acct({ id: 'A', parent: 'B' }),
            acct({ id: 'B', parent: 'A' }),
            acct({ id: 'T', parent: 'B' }),
        ]
        for (const input of orders(base)) {
            const tree = buildAccountTree(input, defaultSort)
            expect(idsOf(tree)).toEqual(['A'])
            expect(idsOf(find(tree, 'B')?.children ?? [])).toEqual(['T'])
            expect(find(tree, 'T')?.depth).toBe(3)
        }
    })

    it('gives the same roll-up values for any input order', () => {
        const base = [
            acct({ id: 'A', parent: 'B', debit_total: 10 }),
            acct({ id: 'B', parent: 'A', debit_total: 20 }),
            acct({ id: 'T', parent: 'B', debit_total: 4 }),
        ]
        for (const input of orders(base)) {
            const tree = buildAccountTree(input, defaultSort)
            expect(find(tree, 'A')?.rollupBalance).toBe(34)
            expect(find(tree, 'B')?.rollupBalance).toBe(24)
            expect(find(tree, 'T')?.rollupBalance).toBe(4)
        }
    })
})

describe('account number collation', () => {
    it('sorts numeric account numbers numerically with blanks last', () => {
        const accounts = [
            acct({ id: 'a', number: '100' }),
            acct({ id: 'b', number: '' }),
            acct({ id: 'c', number: '20' }),
        ]
        const ids = buildAccountTree(accounts, defaultSort).map(n => n.account.id)
        expect(ids).toEqual(['c', 'a', 'b'])
    })
})

describe('type sort and combined filters', () => {
    const typed = [
        acct({ id: 'inc', name: 'Z', type: 'income' }),
        acct({ id: 'bnk', name: 'Y', type: 'bank' }),
        acct({ id: 'exp', name: 'X', type: 'expense' }),
    ]
    // Label order (Bank, Expense, Income) differs from the type list order (bank, income, expense).
    it('sorts by type label ascending', () => {
        const ids = buildAccountTree(typed, { key: 'type', direction: 'asc' }).map(
            n => n.account.id
        )
        expect(ids).toEqual(['bnk', 'exp', 'inc'])
    })

    it('sorts by type label descending', () => {
        const ids = buildAccountTree(typed, { key: 'type', direction: 'desc' }).map(
            n => n.account.id
        )
        expect(ids).toEqual(['inc', 'exp', 'bnk'])
    })

    it('sorts by the label, not the list position, of two asset types', () => {
        const pair = [
            acct({ id: 'bank-row', name: 'A', type: 'bank' }),
            acct({ id: 'ar-row', name: 'B', type: 'accounts_receivable' }),
        ]
        const ids = (direction: 'asc' | 'desc') =>
            buildAccountTree(pair, { key: 'type', direction }).map(n => n.account.id)
        expect(accountTypeDef('accounts_receivable')?.label).toBe('Accounts receivable')
        expect(ids('asc')).toEqual(['ar-row', 'bank-row'])
        expect(ids('desc')).toEqual(['bank-row', 'ar-row'])
    })

    it('applies a group filter together with a query', () => {
        const accounts = [
            acct({ id: 'e1', name: 'Rent', type: 'expense' }),
            acct({ id: 'e2', name: 'Fuel', type: 'expense' }),
            acct({ id: 'a1', name: 'Rent deposit', type: 'bank' }),
        ]
        const rows = flattenAccountTree(
            buildAccountTree(accounts, defaultSort),
            allFilters({ group: 'expense', query: 'rent' })
        )
        expect(rows.map(r => r.node.account.id)).toEqual(['e1'])
    })

    it('applies a group filter with a collapsed parent', () => {
        const accounts = [
            acct({ id: 'P', type: 'expense' }),
            acct({ id: 'K', type: 'expense', parent: 'P' }),
            acct({ id: 'B', type: 'bank' }),
        ]
        const rows = flattenAccountTree(
            buildAccountTree(accounts, defaultSort),
            allFilters({ group: 'expense', collapsed: new Set(['P']) })
        )
        expect(rows.map(r => r.node.account.id)).toEqual(['P'])
        expect(rows[0].isCollapsed).toBe(true)
    })
})

describe('ownBalance unknown type', () => {
    it('falls back to debit-normal for an unknown type', () => {
        expect(ownBalance('mystery_type', 500, 200)).toBe(300)
    })

    it('stays debit-normal and warns once per unknown type', async () => {
        vi.resetModules()
        const { log } = await import('@tinycld/core/lib/logger')
        const warn = vi.spyOn(log, 'warn').mockImplementation(() => {})
        const fresh = await import('../tinycld/books/lib/account-tree')
        expect(fresh.ownBalance('mystery_type', 500, 200)).toBe(300)
        expect(fresh.ownBalance('mystery_type', 500, 200)).toBe(300)
        expect(warn).toHaveBeenCalledTimes(1)
        warn.mockRestore()
    })
})

describe('balance sort ties and non-finite balances', () => {
    const sortedBalance = (accounts: TreeAccount[], direction: 'asc' | 'desc') =>
        flatWithSort(accounts, { key: 'balance', direction }).map(r => r.node.account.id)

    it('breaks a balance tie by name ascending in both directions', () => {
        const accounts = [
            acct({ id: 'x', name: 'Bravo', debit_total: 100 }),
            acct({ id: 'y', name: 'Alpha', debit_total: 100 }),
        ]
        expect(sortedBalance(accounts, 'asc')).toEqual(['y', 'x'])
        expect(sortedBalance(accounts, 'desc')).toEqual(['y', 'x'])
    })

    it('sorts a NaN balance as zero regardless of input order', () => {
        const a = acct({ id: 'a', name: 'A', debit_total: 5 })
        const nan = acct({ id: 'n', name: 'N', debit_total: Number.NaN })
        const c = acct({ id: 'c', name: 'C', debit_total: -5 })
        for (const input of [
            [a, nan, c],
            [c, nan, a],
            [nan, c, a],
        ]) {
            expect(sortedBalance(input, 'asc')).toEqual(['c', 'n', 'a'])
            expect(sortedBalance(input, 'desc')).toEqual(['a', 'n', 'c'])
        }
    })

    it('sorts an infinite balance as zero too', () => {
        const accounts = [
            acct({ id: 'a', name: 'A', debit_total: 5 }),
            acct({ id: 'i', name: 'I', debit_total: Number.POSITIVE_INFINITY }),
            acct({ id: 'c', name: 'C', debit_total: -5 }),
        ]
        expect(sortedBalance(accounts, 'asc')).toEqual(['c', 'i', 'a'])
    })

    it('sorts a collapsed parent with a NaN roll-up as zero', () => {
        const accounts = [
            acct({ id: 'a', name: 'A', debit_total: 5 }),
            acct({ id: 'P', name: 'P' }),
            acct({ id: 'k', name: 'K', parent: 'P', debit_total: Number.NaN }),
            acct({ id: 'c', name: 'C', debit_total: -5 }),
        ]
        const run = (direction: 'asc' | 'desc') =>
            flatWithSort(
                accounts,
                { key: 'balance', direction },
                { collapsed: new Set(['P']) }
            ).map(r => r.node.account.id)
        expect(run('asc')).toEqual(['c', 'P', 'a'])
        expect(run('desc')).toEqual(['a', 'P', 'c'])
    })

    it('sorts an infinite balance as zero in both directions', () => {
        const accounts = [
            acct({ id: 'a', name: 'A', debit_total: 5 }),
            acct({ id: 'n', name: 'N', credit_total: Number.POSITIVE_INFINITY }),
            acct({ id: 'i', name: 'I', debit_total: Number.POSITIVE_INFINITY }),
            acct({ id: 'c', name: 'C', debit_total: -5 }),
        ]
        expect(sortedBalance(accounts, 'asc')).toEqual(['c', 'i', 'n', 'a'])
        expect(sortedBalance(accounts, 'desc')).toEqual(['a', 'i', 'n', 'c'])
    })

    it('falls back to id ascending when balance and name are equal', () => {
        const accounts = [
            acct({ id: 'b', name: 'Same', debit_total: 1 }),
            acct({ id: 'a', name: 'Same', debit_total: 1 }),
        ]
        expect(sortedBalance(accounts, 'asc')).toEqual(['a', 'b'])
        expect(sortedBalance(accounts.slice().reverse(), 'desc')).toEqual(['a', 'b'])
    })
})

describe('sibling order is deterministic', () => {
    const ids = (nodes: TreeNode<TreeAccount>[]) => nodes.map(n => n.account.id)

    it('falls back to id when number and name are equal', () => {
        const rows = [
            acct({ id: 'b', name: 'Same', number: '100' }),
            acct({ id: 'a', name: 'Same', number: '100' }),
            acct({ id: 'c', name: 'Same', number: '100' }),
        ]
        expect(ids(buildAccountTree(rows, defaultSort))).toEqual(['a', 'b', 'c'])
        expect(ids(buildAccountTree(rows.slice().reverse(), defaultSort))).toEqual(['a', 'b', 'c'])
    })

    it('falls back to id for equal names under a name sort', () => {
        const rows = [
            acct({ id: 'b', name: 'Same', number: '1' }),
            acct({ id: 'a', name: 'Same', number: '2' }),
        ]
        for (const direction of ['asc', 'desc'] as const) {
            for (const input of [rows, rows.slice().reverse()]) {
                expect(ids(buildAccountTree(input, { key: 'name', direction }))).toEqual(['a', 'b'])
            }
        }
    })

    it('falls back to id for equal names in the flattened name sort', () => {
        const rows = [acct({ id: 'b', name: 'Same' }), acct({ id: 'a', name: 'Same' })]
        for (const direction of ['asc', 'desc'] as const) {
            for (const input of [rows, rows.slice().reverse()]) {
                const flat = flatWithSort(input, { key: 'name', direction })
                expect(flat.map(r => r.node.account.id)).toEqual(['a', 'b'])
            }
        }
    })

    it('falls back to id ascending for equal type and name under a type sort', () => {
        const rows = [acct({ id: 'b', name: 'Same' }), acct({ id: 'a', name: 'Same' })]
        for (const direction of ['asc', 'desc'] as const) {
            for (const input of [rows, rows.slice().reverse()]) {
                const sort = { key: 'type' as const, direction }
                expect(ids(buildAccountTree(input, sort))).toEqual(['a', 'b'])
                const flat = flatWithSort(input, sort)
                expect(flat.map(r => r.node.account.id)).toEqual(['a', 'b'])
            }
        }
    })

    it('pin: a type sort multiplies the name tie-break by direction', () => {
        const rows = [
            acct({ id: '1', name: 'Alpha', type: 'bank' }),
            acct({ id: '2', name: 'Bravo', type: 'bank' }),
            acct({ id: '3', name: 'Zed', type: 'expense' }),
        ]
        const asc = { key: 'type' as const, direction: 'asc' as const }
        const desc = { key: 'type' as const, direction: 'desc' as const }
        for (const input of [rows, rows.slice().reverse()]) {
            expect(ids(buildAccountTree(input, asc))).toEqual(['1', '2', '3'])
            expect(ids(buildAccountTree(input, desc))).toEqual(['3', '2', '1'])
            expect(flatWithSort(input, asc).map(r => r.node.account.id)).toEqual(['1', '2', '3'])
            expect(flatWithSort(input, desc).map(r => r.node.account.id)).toEqual(['3', '2', '1'])
        }
    })

    it('orders nested siblings by id when number and name are equal', () => {
        const rows = [
            acct({ id: 'P' }),
            acct({ id: 'k2', name: 'Kid', parent: 'P' }),
            acct({ id: 'k1', name: 'Kid', parent: 'P' }),
        ]
        for (const input of [rows, rows.slice().reverse()]) {
            expect(ids(buildAccountTree(input, defaultSort)[0].children)).toEqual(['k1', 'k2'])
        }
    })
})

describe('flatten with a query, a collapsed parent and a balance sort', () => {
    const accounts = [
        acct({ id: 'P', name: 'm-parent', type: 'expense', debit_total: 100 }),
        acct({ id: 'C', name: 'm-child', type: 'expense', parent: 'P', debit_total: 900 }),
        acct({ id: 'Q', name: 'm-other', type: 'expense', debit_total: 500 }),
    ]
    const run = (direction: 'asc' | 'desc') =>
        flatWithSort(
            accounts,
            { key: 'balance', direction },
            { query: 'm-', collapsed: new Set(['P']) }
        )

    it('forces expansion and sorts by own balance, not roll-up', () => {
        const asc = run('asc')
        expect(asc.map(r => r.node.account.id)).toEqual(['P', 'C', 'Q'])
        expect(asc[0].isCollapsed).toBe(false)
        expect(asc[0].balance).toBe(100)
        expect(run('desc').map(r => r.node.account.id)).toEqual(['Q', 'P', 'C'])
    })
})

describe('unknown account type and the group filter', () => {
    const accounts = [
        acct({ id: 'ok', type: 'expense' }),
        acct({ id: 'odd', type: 'mystery_type' }),
    ]
    const flat = (group: TreeFilters['group']) =>
        flattenAccountTree(buildAccountTree(accounts, defaultSort), allFilters({ group })).map(
            r => r.node.account.id
        )

    it('excludes it when a group filter is active', () => {
        expect(flat('expense')).toEqual(['ok'])
    })

    it('shows it when no group filter is active', () => {
        expect(flat('').slice().sort()).toEqual(['odd', 'ok'])
    })
})

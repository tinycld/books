import { type AccountGroup, accountTypeDef } from './account-types'
import { warnOnce } from './warn-once'

export const maxAccountDepth = 5

export type TreeAccount = {
    id: string
    name: string
    number: string
    type: string
    parent: string
    inactive: boolean
    debit_total: number
    credit_total: number
}

export type SortKey = 'name' | 'type' | 'balance'
export type SortState = { key: SortKey | null; direction: 'asc' | 'desc' }

export const defaultSort: SortState = { key: null, direction: 'asc' }

export function nextSort(current: SortState, key: SortKey): SortState {
    if (current.key !== key) return { key, direction: 'asc' }
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
}

export type TreeNode<T extends TreeAccount> = {
    account: T
    children: TreeNode<T>[]
    depth: number
    ownBalance: number | null
    rollupBalance: number | null
}

// The account's posted balance, normal side positive, or null when it is not
// exact. The sums come from a live query that adds month rows as floats
// (lib/accounts-query.ts, lib/register-query.ts, lib/bank-connections-query.ts):
// past 2^53 - 1 a float no longer holds every cent, so a sum there, or a net
// there, is not a number Books can show. Two such sums can net to a small
// number that looks right and is not.
export function ownBalance(type: string, debitTotal: number, creditTotal: number): number | null {
    // An unknown type stays debit-normal so its balance is still shown rather than dropped.
    const def = accountTypeDef(type)
    if (!def) warnOnce(`type:${type}`, 'books.accounts', 'unknown account type', { key: type })
    if (!Number.isSafeInteger(debitTotal) || !Number.isSafeInteger(creditTotal)) return null
    const net = def?.normal === 'credit' ? creditTotal - debitTotal : debitTotal - creditTotal
    return Number.isSafeInteger(net) ? net : null
}

// The sum of two balances, or null when either is not exact or the sum is not.
export function addExact(a: number | null, b: number | null): number | null {
    if (a === null || b === null) return null
    const sum = a + b
    return Number.isSafeInteger(sum) ? sum : null
}

// Exported so a live query can order by chart order with these exact compares
// (lib/bank-connections-query.ts); module-level functions keep a stable reference,
// which TanStack DB's custom string sort requires.
export function compareText(a: string, b: string): number {
    return a.toLowerCase().localeCompare(b.toLowerCase())
}

export function compareNumbers(a: string, b: string): number {
    return a.toLowerCase().localeCompare(b.toLowerCase(), undefined, { numeric: true })
}

function compareNumberThenName(a: TreeAccount, b: TreeAccount): number {
    if (a.number !== b.number) {
        if (a.number === '') return 1
        if (b.number === '') return -1
        const byNumber = compareNumbers(a.number, b.number)
        if (byNumber !== 0) return byNumber
    }
    return compareText(a.name, b.name)
}

function compareId(a: TreeAccount, b: TreeAccount): number {
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function columnCompare(key: 'name' | 'type', a: TreeAccount, b: TreeAccount): number {
    if (key === 'name') return compareText(a.name, b.name)
    const byType = compareText(
        accountTypeDef(a.type)?.label ?? a.type,
        accountTypeDef(b.type)?.label ?? b.type
    )
    return byType !== 0 ? byType : compareText(a.name, b.name)
}

// Balance is not structural: it depends on collapse state, so only
// flattenAccountTree sorts by it. The tree itself keeps the default order.
function comparator(sort: SortState) {
    const { key, direction } = sort
    if (key !== 'name' && key !== 'type') {
        return (a: TreeAccount, b: TreeAccount) => compareNumberThenName(a, b) || compareId(a, b)
    }
    const sign = direction === 'asc' ? 1 : -1
    // The id fallback ignores direction so equal rows never swap when it flips.
    return (a: TreeAccount, b: TreeAccount) => sign * columnCompare(key, a, b) || compareId(a, b)
}

function sameTypeDescendantsTotal<T extends TreeAccount>(
    node: TreeNode<T>,
    type: string
): number | null {
    let total: number | null = 0
    for (const child of node.children) {
        if (child.account.type === type) total = addExact(total, child.ownBalance)
        total = addExact(total, sameTypeDescendantsTotal(child, type))
    }
    return total
}

export function buildAccountTree<T extends TreeAccount>(
    accounts: readonly T[],
    sort: SortState
): TreeNode<T>[] {
    const compare = comparator(sort)
    const byId = new Map(accounts.map(a => [a.id, a]))
    const childrenOf = new Map<string, T[]>()
    const roots: T[] = []
    for (const account of accounts) {
        const hasParent =
            account.parent !== '' && account.parent !== account.id && byId.has(account.parent)
        if (!hasParent) {
            roots.push(account)
            continue
        }
        const siblings = childrenOf.get(account.parent) ?? []
        siblings.push(account)
        childrenOf.set(account.parent, siblings)
    }

    // An account in a parent cycle is not reachable from any root; promote one
    // member per cycle to top level so nothing is dropped.
    const reached = new Set<string>()
    const markReached = (account: T) => {
        if (reached.has(account.id)) return
        reached.add(account.id)
        for (const child of childrenOf.get(account.id) ?? []) markReached(child)
    }
    for (const root of roots) markReached(root)
    const promoted = new Set<string>()
    // Promote the lowest id of each cycle so the result does not depend on input order.
    const cycleRoot = (start: T): T => {
        const walked = new Set<string>()
        let member = start
        while (!walked.has(member.id)) {
            walked.add(member.id)
            const next = byId.get(member.parent)
            if (!next) return member
            member = next
        }
        let lowest = member
        for (let cur = byId.get(member.parent); cur && cur.id !== member.id; ) {
            if (cur.id < lowest.id) lowest = cur
            cur = byId.get(cur.parent)
        }
        return lowest
    }
    for (const account of accounts) {
        if (reached.has(account.id)) continue
        const root = cycleRoot(account)
        roots.push(root)
        promoted.add(root.id)
        markReached(root)
    }

    const toNode = (account: T, depth: number): TreeNode<T> => {
        const children = (childrenOf.get(account.id) ?? [])
            .filter(child => !promoted.has(child.id))
            .slice()
            .sort(compare)
            .map(child => toNode(child, depth + 1))
        const own = ownBalance(account.type, account.debit_total, account.credit_total)
        const node: TreeNode<T> = { account, children, depth, ownBalance: own, rollupBalance: own }
        node.rollupBalance = addExact(own, sameTypeDescendantsTotal(node, account.type))
        return node
    }
    return roots
        .slice()
        .sort(compare)
        .map(root => toNode(root, 1))
}

export type TreeFilters = {
    collapsed: ReadonlySet<string>
    query: string
    group: AccountGroup | ''
    showInactive: boolean
    sort?: SortState
}

export type VisibleRow<T extends TreeAccount> = {
    node: TreeNode<T>
    hasChildren: boolean
    isCollapsed: boolean
    balance: number | null
    showsRollup: boolean
}

export function flattenAccountTree<T extends TreeAccount>(
    nodes: TreeNode<T>[],
    filters: TreeFilters
): VisibleRow<T>[] {
    const query = filters.query.trim().toLowerCase()

    const matches = (account: T) =>
        account.name.toLowerCase().includes(query) || account.number.toLowerCase().includes(query)

    // An inactive account with an active account below it stays in the list: hiding
    // it would hide the active one, which still takes postings. The server refuses
    // that state now (server/accounts.go checkActiveParent), but a row older than
    // the rule can hold it. The row shows its Inactive label as any inactive row.
    const hasActiveBelow = (node: TreeNode<T>): boolean =>
        node.children.some(child => !child.account.inactive || hasActiveBelow(child))

    const isExcluded = (node: TreeNode<T>) => {
        const { account } = node
        if (filters.group !== '' && accountTypeDef(account.type)?.group !== filters.group) {
            return true
        }
        if (!account.inactive || filters.showInactive) return false
        return !hasActiveBelow(node)
    }

    const isKept = (node: TreeNode<T>): boolean => {
        if (isExcluded(node)) return false
        if (query === '') return true
        return matches(node.account) || node.children.some(isKept)
    }

    // hasChildren counts every child, so a hidden child still gives the parent a caret and a roll-up.
    // With a query, every kept child sits on a path to a match, so its parent stays open.
    const collapsedState = (node: TreeNode<T>) =>
        node.children.length > 0 && query === '' && filters.collapsed.has(node.account.id)

    const displayedBalance = (node: TreeNode<T>) =>
        collapsedState(node) ? node.rollupBalance : node.ownBalance

    // A balance that is not exact has no place in the order; it sorts as zero, so the
    // comparator always returns a number.
    const sortableBalance = (node: TreeNode<T>) => displayedBalance(node) ?? 0

    const sortSiblings = (siblings: TreeNode<T>[]) => {
        const { sort } = filters
        if (!sort || sort.key === null) return siblings
        const { key } = sort
        const sign = sort.direction === 'asc' ? 1 : -1
        return siblings.slice().sort((a, b) => {
            if (key === 'balance') {
                const byBalance = sortableBalance(a) - sortableBalance(b)
                // Name and id tie-breaks stay ascending in both directions.
                return (
                    sign * byBalance ||
                    compareText(a.account.name, b.account.name) ||
                    compareId(a.account, b.account)
                )
            }
            return (
                sign * columnCompare(key, a.account, b.account) || compareId(a.account, b.account)
            )
        })
    }

    const walk = (node: TreeNode<T>, rows: VisibleRow<T>[]) => {
        const isCollapsed = collapsedState(node)
        rows.push({
            node,
            hasChildren: node.children.length > 0,
            isCollapsed,
            balance: displayedBalance(node),
            showsRollup: isCollapsed,
        })
        if (isCollapsed) return
        for (const child of sortSiblings(node.children.filter(isKept))) walk(child, rows)
    }

    const rows: VisibleRow<T>[] = []
    for (const node of sortSiblings(nodes.filter(isKept))) walk(node, rows)
    return rows
}

export function parentIds<T extends TreeAccount>(nodes: TreeNode<T>[]): string[] {
    return nodes.flatMap(node => [
        ...(node.children.length > 0 ? [node.account.id] : []),
        ...parentIds(node.children),
    ])
}

export function parentChoices<T extends TreeAccount>(
    accounts: readonly T[],
    opts: { type: string; editingId: string }
): T[] {
    const tree = buildAccountTree(accounts, defaultSort)
    const depthById = new Map<string, number>()
    const excluded = new Set<string>()
    let height = 0

    const subtreeHeight = (node: TreeNode<T>): number =>
        node.children.length === 0 ? 0 : 1 + Math.max(...node.children.map(subtreeHeight))

    const visit = (node: TreeNode<T>, inEditing: boolean) => {
        depthById.set(node.account.id, node.depth)
        const editing = inEditing || (opts.editingId !== '' && node.account.id === opts.editingId)
        if (editing) excluded.add(node.account.id)
        if (editing && !inEditing) height = subtreeHeight(node)
        for (const child of node.children) visit(child, editing)
    }
    for (const root of tree) visit(root, false)

    // A new account is active. An active account gets no inactive parent
    // (server/accounts.go checkActiveParent); an inactive one may have any.
    const editing = accounts.find(account => account.id === opts.editingId)
    const needsActiveParent = !(editing?.inactive ?? false)

    return accounts.filter(candidate => {
        if (candidate.type !== opts.type || excluded.has(candidate.id)) return false
        if (needsActiveParent && candidate.inactive) return false
        const depth = depthById.get(candidate.id)
        return depth !== undefined && depth + 1 + height <= maxAccountDepth
    })
}

export function activeChildCount(accounts: readonly TreeAccount[], id: string): number {
    return accounts.filter(a => a.parent === id && !a.inactive).length
}

export function accountPath(account: TreeAccount, byId: ReadonlyMap<string, TreeAccount>): string {
    const names = [account.name]
    const seen = new Set([account.id])
    let parent = byId.get(account.parent)
    while (parent && !seen.has(parent.id)) {
        names.unshift(parent.name)
        seen.add(parent.id)
        parent = byId.get(parent.parent)
    }
    return names.join(':')
}

import { buildAccountTree, defaultSort, type TreeNode } from './account-tree'

type OptionAccount = {
    id: string
    name: string
    number: string
    type: string
    parent: string
    inactive: boolean
}

type TreeRow = OptionAccount & { debit_total: number; credit_total: number }

// Display names cover every account, because an old line may name an inactive one;
// the picker offers active accounts only, in chart order, indented by depth.
// An active child of an inactive parent is still offered. The depth travels as the
// select's `indent`, not as leading spaces, so the menu shows the chart's shape and
// the trigger shows the plain `number name`.
export function accountOptionList(accounts: readonly OptionAccount[]) {
    const names = new Map(
        accounts.map(account => [account.id, `${account.number} ${account.name}`.trim()])
    )
    const tree = buildAccountTree<TreeRow>(
        accounts.map(account => ({ ...account, debit_total: 0, credit_total: 0 })),
        defaultSort
    )
    const options: { value: string; label: string; indent: number }[] = []
    const walk = (node: TreeNode<TreeRow>) => {
        const { account, depth } = node
        if (!account.inactive) {
            options.push({
                value: account.id,
                label: names.get(account.id) ?? '',
                indent: depth - 1,
            })
        }
        for (const child of node.children) walk(child)
    }
    for (const root of tree) walk(root)
    return { options, names }
}

/**
 * The chart's options for one account field: the accounts `keep` accepts, in chart
 * order and depth (the walk covers every account, so an offered child keeps its depth),
 * and a `triggerLabel` that names a stored account the list does not offer (it became
 * inactive, or its type no longer fits), which the select shows while no option matches.
 */
export function filteredAccountOptions<A extends OptionAccount>(
    accounts: readonly A[],
    storedId: string,
    keep: (account: A) => boolean
) {
    const kept = new Set(accounts.filter(keep).map(account => account.id))
    const { options: chart, names } = accountOptionList(accounts)
    const options = chart.filter(option => kept.has(option.value))
    const isOffered = options.some(option => option.value === storedId)
    const triggerLabel = isOffered ? '' : (names.get(storedId) ?? '')
    return { options, triggerLabel }
}

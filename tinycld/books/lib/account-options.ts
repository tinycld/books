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

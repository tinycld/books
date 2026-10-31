import type { BooksAccounts } from '../types'
import { buildAccountTree, defaultSort, type TreeNode } from './account-tree'
import { isExpenseGroupType } from './form-1099'

type Form1099Account = Pick<
    BooksAccounts,
    'id' | 'name' | 'number' | 'type' | 'parent' | 'inactive' | 'form_1099_box'
>

type TreeRow = Form1099Account & { debit_total: number; credit_total: number }

const NO_HELD_IDS: ReadonlySet<string> = new Set()

// Every expense-group account in chart order with its tree depth. Sub-accounts share
// their parent's type (server/accounts.go), so a tree over the expense group has the
// chart's depth. An inactive account that still has a box is listed so its box can be
// cleared; a sub-account keeps its chart depth even when its parent is left out. An id in
// `held` is listed whatever its box: clearing an inactive account's box drops the reason
// it is listed before the server answers, and its row must stay to show the outcome.
export function form1099Accounts(
    accounts: readonly Form1099Account[],
    held: ReadonlySet<string> = NO_HELD_IDS
): {
    id: string
    label: string
    depth: number
    inactive: boolean
    box: BooksAccounts['form_1099_box']
}[] {
    const group: TreeRow[] = accounts
        .filter(account => isExpenseGroupType(account.type))
        .map(account => ({ ...account, debit_total: 0, credit_total: 0 }))
    const rows: ReturnType<typeof form1099Accounts> = []
    const walk = (node: TreeNode<TreeRow>) => {
        const { account } = node
        if (!account.inactive || account.form_1099_box !== '' || held.has(account.id)) {
            rows.push({
                id: account.id,
                label: `${account.number} ${account.name}`.trim(),
                depth: node.depth,
                inactive: account.inactive,
                box: account.form_1099_box,
            })
        }
        for (const child of node.children) walk(child)
    }
    for (const root of buildAccountTree(group, defaultSort)) walk(root)
    return rows
}

export type Form1099AccountRow = ReturnType<typeof form1099Accounts>[number]

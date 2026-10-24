// Fixture-derived AccountRow data shared by the checkpoint 2 tests. It sums
// the balance rows the way accountsWithBalances does, so a view or hook test
// starts from the shape the live query produces.
import type { AccountRow } from '../tinycld/books/hooks/useAccountsQuery'
import { ACCOUNTS, BALANCES } from '../tinycld/books/lib/chart-of-accounts-fixture'

export function fixtureRows(): AccountRow[] {
    return ACCOUNTS.map(account => {
        const own = BALANCES.filter(b => b.account === account.id)
        return {
            id: account.id,
            name: account.name,
            number: account.number,
            type: account.type,
            parent: account.parent,
            inactive: account.inactive,
            description: account.description,
            detail_type: account.detail_type,
            currency: account.currency,
            debit_total: own.reduce((sum, b) => sum + b.debit_total, 0),
            credit_total: own.reduce((sum, b) => sum + b.credit_total, 0),
        }
    })
}

export function byTestId(root: ParentNode, id: string): HTMLElement | null {
    return root.querySelector(`[testID="${id}"], [testid="${id}"]`)
}

export function classOf(el: Element | null): string {
    return el?.getAttribute('class') ?? ''
}

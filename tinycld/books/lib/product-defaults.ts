import type { BooksAccounts } from '../types'
import { accountOptionList } from './account-options'
import { EMPTY_PRODUCT_FIELDS, type ProductColumns } from './product-columns'
import type { ProductType } from './product-types'

export type DefaultAccount = Pick<
    BooksAccounts,
    'id' | 'name' | 'number' | 'type' | 'detail_type' | 'parent' | 'inactive'
>

// The detail type a new product's income account is first looked for by (Q7).
const INCOME_DETAIL: Record<ProductType, string | null> = {
    service: 'service_income',
    non_inventory: 'product_sales',
    bundle: null,
}

// The active accounts in chart order, the order the account selects offer them.
function activeInChartOrder(accounts: readonly DefaultAccount[]): DefaultAccount[] {
    const byId = new Map(accounts.map(account => [account.id, account]))
    return accountOptionList(accounts).options.flatMap(option => {
        const account = byId.get(option.value)
        return account ? [account] : []
    })
}

/**
 * A new product's income account: the first active account with the type's detail
 * type (Service income for a service, Product sales for a non-inventory item), else
 * the first active Income account, else none. A bundle has no income account.
 */
export function defaultIncomeAccount(
    accounts: readonly DefaultAccount[],
    type: ProductType
): string {
    const detail = INCOME_DETAIL[type]
    if (detail === null) return ''
    const chart = activeInChartOrder(accounts)
    const match =
        chart.find(account => account.detail_type === detail) ??
        chart.find(account => account.type === 'income')
    return match?.id ?? ''
}

/** A new product's expense account: the first active Cost of goods sold account, else none. */
export function defaultExpenseAccount(accounts: readonly DefaultAccount[]): string {
    const match = activeInChartOrder(accounts).find(
        account => account.type === 'cost_of_goods_sold'
    )
    return match?.id ?? ''
}

/** The create form's first values for a new product of `type`. */
export function newProductValues(
    type: ProductType,
    accounts: readonly DefaultAccount[]
): Required<ProductColumns> {
    if (type === 'bundle') return { ...EMPTY_PRODUCT_FIELDS, type }
    return {
        ...EMPTY_PRODUCT_FIELDS,
        type,
        income_account: defaultIncomeAccount(accounts, type),
        expense_account: defaultExpenseAccount(accounts),
    }
}

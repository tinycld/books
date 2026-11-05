// The tax columns a new product or customer starts with. The product and
// customer forms do not edit them yet, so their inserts spread these under the
// row the form gives (hooks/useProductForm.ts, hooks/useCustomerForm.ts).

import type { BooksCustomers, BooksProducts } from '../types'
import type { ColumnOf } from './fixture-columns'

export const EMPTY_PRODUCT_TAX_COLUMNS = { taxable: false } satisfies Pick<BooksProducts, 'taxable'>

export const EMPTY_CUSTOMER_TAX_COLUMNS = {
    tax_exempt: false,
    exemption_reason: '',
    exemption_number: '',
    default_tax_rate: '',
} satisfies Pick<
    BooksCustomers,
    ColumnOf<
        BooksCustomers,
        'tax_exempt' | 'exemption_reason' | 'exemption_number' | 'default_tax_rate'
    >
>

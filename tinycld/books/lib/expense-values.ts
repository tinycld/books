// The expense form's start values (spec §3.3, §3.4, §3.8): a new form's by the Purchase
// lines setting, what a vendor pick fills, a copy's and a correction's. The lines every
// purchase kind shares are in lib/purchase-values.ts.

import type { FormValues } from '@tinycld/core/lib/forms/logic'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import type { BooksExpenses, BooksVendors } from '../types'
import type { PaymentMethodKey } from './payment-methods'
import type { PurchaseLineRow } from './purchase-line-columns'
import type { PurchaseLines } from './purchase-lines'
import {
    purchaseLinesWithNewIds,
    purchaseStartLines,
    vendorAccountLineFills,
} from './purchase-values'

// The `books:expense` host's built-in values, keyed as the engine keys them. `replaces` is
// no built-in: a correction's save writes it with the new expense.
export type ExpenseFormValues = FormValues & {
    replaces?: string
    vendor: string
    paid_from: string
    date: string
    payment_method: PaymentMethodKey | ''
    reference_no: string
    account_lines: TableRow[]
    item_lines: TableRow[]
    memo: string
}

// What a vendor pick reads: its default expense account.
type ExpenseVendorFill = Pick<BooksVendors, 'id' | 'expense_account'>

// What picking a vendor fills (spec §3.3): nothing in the band, and the first account
// line's empty Account (vendorAccountLineFills).
export const expenseVendorFills = vendorAccountLineFills

// A new form: an empty band paid today, with the setting's starting lines. With a vendor
// (the `?vendor` route param) the first account line is filled as a pick fills it.
export function newExpenseValues(input: {
    today: string
    purchaseLines: PurchaseLines
    vendor?: ExpenseVendorFill | null
    accountIsListed?: boolean
}): ExpenseFormValues {
    const { today, purchaseLines, vendor, accountIsListed = false } = input
    const blank: ExpenseFormValues = {
        vendor: '',
        paid_from: '',
        date: today,
        payment_method: '',
        reference_no: '',
        ...purchaseStartLines(purchaseLines),
        memo: '',
    }
    if (!vendor) return blank
    return { ...blank, vendor: vendor.id, ...expenseVendorFills(vendor, accountIsListed, blank) }
}

type SourceExpense = Pick<
    BooksExpenses,
    'id' | 'vendor' | 'paid_from' | 'payment_method' | 'date' | 'reference_no' | 'memo'
>

// Read view "Copy" (`?copy=<id>`): a new draft for the same vendor, from the same Paid from
// account while it is still active (else empty, for the user to choose), with the payment
// method, the lines of both tables and the memo, paid today; no Ref no., and it replaces
// nothing.
export function copyExpenseValues(
    expense: SourceExpense,
    lines: readonly PurchaseLineRow[],
    today: string,
    activePaidFromIds: ReadonlySet<string>
): ExpenseFormValues {
    return {
        vendor: expense.vendor,
        paid_from: activePaidFromIds.has(expense.paid_from) ? expense.paid_from : '',
        date: today,
        payment_method: expense.payment_method,
        reference_no: '',
        ...purchaseLinesWithNewIds(lines),
        memo: expense.memo,
    }
}

// Read view "Edit" (`?replaces=<id>`): a correction keeps every value of the posted
// expense, its Ref no. included, with new line ids, and names the expense it replaces.
export function expenseCorrectionValues(
    expense: SourceExpense,
    lines: readonly PurchaseLineRow[]
): ExpenseFormValues {
    return {
        vendor: expense.vendor,
        paid_from: expense.paid_from,
        date: expense.date,
        payment_method: expense.payment_method,
        reference_no: expense.reference_no,
        ...purchaseLinesWithNewIds(lines),
        memo: expense.memo,
        replaces: expense.id,
    }
}

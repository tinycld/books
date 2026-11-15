import { z } from '@tinycld/core/ui/form'
import { PAYMENT_METHOD_KEYS } from './payment-methods'
import { type ColumnsParse, optionalText, parseColumns } from './record-columns'

/**
 * The built-in expense columns the form writes. Every key is optional: core `splitValues`
 * leaves out a key whose value is undefined, and an edit patch holds only the dirty keys.
 * Strict, so a column the expense does not have (an address, Terms) is refused. The line
 * tables are rows, not columns.
 */
export const expenseColumnsSchema = z.strictObject({
    vendor: optionalText,
    paid_from: optionalText,
    date: optionalText,
    // Required on every expense (the form refuses a save without one), so '' is refused.
    payment_method: z.enum(PAYMENT_METHOD_KEYS).optional(),
    reference_no: optionalText,
    memo: optionalText,
})

export type ExpenseColumns = z.infer<typeof expenseColumnsSchema>

export function expenseColumnsFrom(columns: Record<string, unknown>): ColumnsParse<ExpenseColumns> {
    return parseColumns(expenseColumnsSchema, columns)
}

// The base of an insert, so a column the form left out is stored empty. A new expense is
// always a draft; `replaces` is set by a correction. Payment method has no empty value:
// the form's required rule puts one in every insert's columns.
export const EMPTY_EXPENSE_COLUMNS: Omit<Required<ExpenseColumns>, 'payment_method'> & {
    status: 'draft'
    replaces: string
} = {
    vendor: '',
    paid_from: '',
    date: '',
    reference_no: '',
    memo: '',
    status: 'draft',
    replaces: '',
}

// The start values every purchase kind (the bill, the expense, the vendor credit) shares
// (spec §3.1, §3.3, §3.4): the empty lines of its two tables, the lines a new form starts
// with by the Purchase lines setting, a stored document's lines as new rows, and the
// vendor pick's fill of the first account line. Plain: type imports, the id maker, core's
// row mapper, form-values.ts and purchase-line-columns.ts only.

import type { FormValues } from '@tinycld/core/lib/forms/logic'
import { tableRowsOf } from '@tinycld/core/lib/forms/table-rows'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { newRecordId } from 'pbtsdb/core'
import type { BooksVendors } from '../types'
import { rowsOf } from './form-values'
import { PURCHASE_LINE_MAPPER, type PurchaseLineRow } from './purchase-line-columns'
import type { PurchaseLines } from './purchase-lines'

export type PurchaseTableRows = { account_lines: TableRow[]; item_lines: TableRow[] }

export function emptyAccountLine(): TableRow {
    return { id: newRecordId(), kind: 'account', account: '', description: '', amount: '' }
}

export function emptyPurchaseItemLine(): TableRow {
    return {
        id: newRecordId(),
        kind: 'item',
        product: '',
        description: '',
        quantity: 1,
        rate: '',
        amount: null,
    }
}

// The lines a new form starts with (spec §3.4): Both — one empty account line and an
// empty product table; Accounts — one empty account line; Products — one empty product
// line.
export function purchaseStartLines(setting: PurchaseLines): PurchaseTableRows {
    if (setting === 'products') return { account_lines: [], item_lines: [emptyPurchaseItemLine()] }
    return { account_lines: [emptyAccountLine()], item_lines: [] }
}

// A stored document's lines as the rows of its two tables, in position order, each with a
// new id: the form inserts them as lines of a new document, never as the source's rows.
export function purchaseLinesWithNewIds(lines: readonly PurchaseLineRow[]): PurchaseTableRows {
    const rowsOfKind = (kind: PurchaseLineRow['kind']) =>
        tableRowsOf(
            lines.filter(line => line.kind === kind),
            PURCHASE_LINE_MAPPER
        ).map(row => ({ ...row, id: newRecordId() }))
    return { account_lines: rowsOfKind('account'), item_lines: rowsOfKind('item') }
}

// The vendor pick's account fill: when the account table's first line has no account, it
// gets the vendor's default expense account, only when the Account picker lists it
// (`accountIsListed`). Null when nothing changes: no account line, a first line that has
// an account, a vendor with no default account, or one the picker does not list.
export function vendorAccountFill(
    vendor: Pick<BooksVendors, 'expense_account'>,
    accountIsListed: boolean,
    accountLines: readonly TableRow[]
): TableRow[] | null {
    const [first, ...rest] = accountLines
    const isFirstEmpty = first !== undefined && (first.account ?? '') === ''
    if (!isFirstEmpty || !accountIsListed || vendor.expense_account === '') return null
    return [{ ...first, account: vendor.expense_account }, ...rest]
}

// What picking a vendor fills on a purchase kind with nothing to fill in its band (an
// expense, a vendor credit): when the account table holds a first line with no account,
// that line gets the vendor's default expense account, only when the Account picker lists
// it (`accountIsListed`, vendorAccountFill); otherwise the fills are empty.
export function vendorAccountLineFills(
    vendor: Pick<BooksVendors, 'expense_account'>,
    accountIsListed: boolean,
    current: FormValues
): Partial<PurchaseTableRows> {
    const accountLines = vendorAccountFill(vendor, accountIsListed, rowsOf(current.account_lines))
    if (!accountLines) return {}
    return { account_lines: accountLines }
}

// The bill form's start values (spec §3.3, §3.4, §3.6): a new form's by the Bill lines
// setting, what a vendor pick fills, a copy's and a correction's. The shared line and
// totals helpers are in lib/document-values.ts.

import type { FormValues } from '@tinycld/core/lib/forms/logic'
import { tableRowsOf } from '@tinycld/core/lib/forms/table-rows'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { newRecordId } from 'pbtsdb/core'
import type { BooksBills, BooksVendors } from '../types'
import type { CustomerAddress } from './address'
import { dueDateFor } from './document-dates'
import { PURCHASE_LINE_MAPPER, type PurchaseLineRow } from './purchase-line-columns'
import type { PurchaseLines } from './purchase-lines'

// The `books:bill` host's built-in values, keyed as the engine keys them. `replaces` is no
// built-in: a correction's save writes it with the new bill.
export type BillFormValues = FormValues & {
    replaces?: string
    vendor: string
    mailing_address: CustomerAddress | null
    terms: BooksBills['terms']
    date: string
    due_date: string
    ref_no: string
    account_lines: TableRow[]
    item_lines: TableRow[]
    memo: string
}

// What a vendor pick reads: its address, its terms and its default expense account.
export type VendorBillFill = Pick<BooksVendors, 'id' | 'address' | 'terms' | 'expense_account'>

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

// A due date from terms; a vendor with no terms gives the bill date.
function billDueDate(date: string, terms: BooksBills['terms']): string {
    return dueDateFor(date, terms) ?? date
}

// What picking a vendor fills: Mailing address, Terms and the Due date they give. When
// the account table holds a first line with no account, that line also gets the vendor's
// default expense account, only when the Account picker lists it (`accountIsListed`);
// otherwise `account_lines` is not part of the fills. A second pick, whose first line
// already has an account, so refills the address, terms and due date only (Q8).
export function vendorBillFills(
    vendor: VendorBillFill,
    accountIsListed: boolean,
    current: Pick<BillFormValues, 'date' | 'account_lines'>
): Pick<BillFormValues, 'mailing_address' | 'terms' | 'due_date'> &
    Partial<Pick<BillFormValues, 'account_lines'>> {
    const fills = {
        mailing_address: vendor.address ?? null,
        terms: vendor.terms,
        due_date: billDueDate(current.date, vendor.terms),
    }
    const [first, ...rest] = current.account_lines
    const isFirstEmpty = first !== undefined && (first.account ?? '') === ''
    if (!isFirstEmpty || !accountIsListed || vendor.expense_account === '') return fills
    return { ...fills, account_lines: [{ ...first, account: vendor.expense_account }, ...rest] }
}

// The lines a new form starts with (spec §3.4): Both — one empty account line and an
// empty product table; Accounts — one empty account line; Products — one empty product
// line.
function startingLines(
    setting: PurchaseLines
): Pick<BillFormValues, 'account_lines' | 'item_lines'> {
    if (setting === 'products') return { account_lines: [], item_lines: [emptyPurchaseItemLine()] }
    return { account_lines: [emptyAccountLine()], item_lines: [] }
}

// A new form: dated and due today with the setting's starting lines. With a vendor (the
// `?vendor` route param) the header is filled as a pick fills it.
export function newBillValues(input: {
    today: string
    purchaseLines: PurchaseLines
    vendor?: VendorBillFill | null
    accountIsListed?: boolean
}): BillFormValues {
    const { today, purchaseLines, vendor, accountIsListed = false } = input
    const blank: BillFormValues = {
        vendor: '',
        mailing_address: null,
        terms: '',
        date: today,
        due_date: today,
        ref_no: '',
        ...startingLines(purchaseLines),
        memo: '',
    }
    if (!vendor) return blank
    return { ...blank, vendor: vendor.id, ...vendorBillFills(vendor, accountIsListed, blank) }
}

// A stored bill's lines as the rows of its two tables, in position order, each with a new
// id: the form inserts them as lines of a new bill, never as the source's rows.
export function billLinesWithNewIds(
    lines: readonly PurchaseLineRow[]
): Pick<BillFormValues, 'account_lines' | 'item_lines'> {
    const rowsOf = (kind: PurchaseLineRow['kind']) =>
        tableRowsOf(
            lines.filter(line => line.kind === kind),
            PURCHASE_LINE_MAPPER
        ).map(row => ({ ...row, id: newRecordId() }))
    return { account_lines: rowsOf('account'), item_lines: rowsOf('item') }
}

type SourceBill = Pick<
    BooksBills,
    'id' | 'vendor' | 'mailing_address' | 'terms' | 'date' | 'due_date' | 'ref_no' | 'memo'
>

// Read view "Copy" (`?copy=<id>`): a new draft for the same vendor with the lines of both
// tables and the memo, dated today; no vendor's bill no., and it replaces nothing.
// Mailing address and Terms come from the vendor's current record as a vendor pick fills
// them (the source's are a snapshot taken for that bill), and the due date from those
// terms.
export function copyBillValues(
    bill: SourceBill,
    lines: readonly PurchaseLineRow[],
    today: string,
    vendor: VendorBillFill
): BillFormValues {
    return {
        vendor: bill.vendor,
        mailing_address: vendor.address ?? null,
        terms: vendor.terms,
        date: today,
        due_date: billDueDate(today, vendor.terms),
        ref_no: '',
        ...billLinesWithNewIds(lines),
        memo: bill.memo,
    }
}

// Read view "Edit" (`?replaces=<id>`): a correction keeps every value of the posted bill,
// its vendor's bill no. included, with new line ids, and names the bill it replaces.
export function billCorrectionValues(
    bill: SourceBill,
    lines: readonly PurchaseLineRow[]
): BillFormValues {
    return {
        vendor: bill.vendor,
        mailing_address: bill.mailing_address ?? null,
        terms: bill.terms,
        date: bill.date,
        due_date: bill.due_date,
        ref_no: bill.ref_no,
        ...billLinesWithNewIds(lines),
        memo: bill.memo,
        replaces: bill.id,
    }
}

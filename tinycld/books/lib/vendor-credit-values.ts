// The vendor credit form's start values (vendor credit spec §3.3, §3.4, §3.7, §3.8): a new
// form's by the Purchase lines setting, what a vendor pick fills, a copy's and a
// correction's. A vendor credit has no terms, due date or mailing address. The lines every
// purchase kind shares are in lib/purchase-values.ts.

import type { FormValues } from '@tinycld/core/lib/forms/logic'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import type { BooksVendorCredits, BooksVendors } from '../types'
import type { PurchaseLineRow } from './purchase-line-columns'
import type { PurchaseLines } from './purchase-lines'
import {
    purchaseLinesWithNewIds,
    purchaseStartLines,
    vendorAccountLineFills,
} from './purchase-values'

// The `books:vendor_credit` host's built-in values, keyed as the engine keys them.
// `replaces` is no built-in: a correction's save writes it with the new vendor credit.
export type VendorCreditFormValues = FormValues & {
    replaces?: string
    vendor: string
    date: string
    ref_no: string
    account_lines: TableRow[]
    item_lines: TableRow[]
    memo: string
}

// What picking a vendor fills (spec §3.3): nothing in the band, and the first account
// line's empty Account (vendorAccountLineFills), as the expense's pick.
export const vendorCreditVendorFills = vendorAccountLineFills

// A new form: an empty band dated today, with the setting's starting lines. With a vendor
// (the `?vendor` route param) the first account line is filled as a pick fills it.
export function newVendorCreditValues(input: {
    today: string
    purchaseLines: PurchaseLines
    vendor?: Pick<BooksVendors, 'id' | 'expense_account'> | null
    accountIsListed?: boolean
}): VendorCreditFormValues {
    const { today, purchaseLines, vendor, accountIsListed = false } = input
    const blank: VendorCreditFormValues = {
        vendor: '',
        date: today,
        ref_no: '',
        ...purchaseStartLines(purchaseLines),
        memo: '',
    }
    if (!vendor) return blank
    return {
        ...blank,
        vendor: vendor.id,
        ...vendorCreditVendorFills(vendor, accountIsListed, blank),
    }
}

type SourceVendorCredit = Pick<BooksVendorCredits, 'id' | 'vendor' | 'date' | 'ref_no' | 'memo'>

// Read view "Copy" (`?copy=<id>`, spec §3.7): a new draft for the same vendor with the
// lines of both tables and the memo, dated today; no Vendor's credit no., no attachments,
// and it replaces nothing.
export function copyVendorCreditValues(
    credit: SourceVendorCredit,
    lines: readonly PurchaseLineRow[],
    today: string
): VendorCreditFormValues {
    return {
        vendor: credit.vendor,
        date: today,
        ref_no: '',
        ...purchaseLinesWithNewIds(lines),
        memo: credit.memo,
    }
}

// Read view "Edit" (`?replaces=<id>`): a correction keeps every value of the posted
// credit, its Vendor's credit no. included, with new line ids, and names the credit it
// replaces.
export function vendorCreditCorrectionValues(
    credit: SourceVendorCredit,
    lines: readonly PurchaseLineRow[]
): VendorCreditFormValues {
    return {
        vendor: credit.vendor,
        date: credit.date,
        ref_no: credit.ref_no,
        ...purchaseLinesWithNewIds(lines),
        memo: credit.memo,
        replaces: credit.id,
    }
}

// The purchase order form's start values (purchase order spec §3.3, §3.4, §3.7): a new
// form's by the Purchase lines setting, what a vendor pick fills, a copy's, and the read
// view's rows after Total. The lines every purchase kind shares are in
// lib/purchase-values.ts.

import type { FormValues } from '@tinycld/core/lib/forms/logic'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import type { BooksPurchaseOrderLines, BooksPurchaseOrders, BooksVendors } from '../types'
import type { CustomerAddress } from './address'
import type { DocumentTotalRow } from './document-total-rows'
import { formatMoney, MINUS } from './money'
import type { PurchaseLineRow } from './purchase-line-columns'
import type { PurchaseLines } from './purchase-lines'
import { purchaseLinesWithNewIds, purchaseStartLines, vendorAccountFill } from './purchase-values'

// The `books:purchase_order` host's built-in values, keyed as the engine keys them.
export type PurchaseOrderFormValues = FormValues & {
    vendor: string
    mailing_address: CustomerAddress | null
    email: string
    date: string
    ship_to: string
    account_lines: TableRow[]
    item_lines: TableRow[]
    message: string
    memo: string
}

// What a vendor pick reads: its address, its email and its default expense account.
export type VendorOrderFill = Pick<BooksVendors, 'id' | 'address' | 'email' | 'expense_account'>

// What picking a vendor fills: Mailing address and Email. When the account table holds a
// first line with no account, that line also gets the vendor's default expense account,
// only when the Account picker lists it (vendorAccountFill), as on a bill. A second pick,
// whose first line already has an account, so refills the address and Email only.
export function vendorOrderFills(
    vendor: VendorOrderFill,
    accountIsListed: boolean,
    current: Pick<PurchaseOrderFormValues, 'account_lines'>
): Pick<PurchaseOrderFormValues, 'mailing_address' | 'email'> &
    Partial<Pick<PurchaseOrderFormValues, 'account_lines'>> {
    const fills = { mailing_address: vendor.address ?? null, email: vendor.email }
    const accountLines = vendorAccountFill(vendor, accountIsListed, current.account_lines)
    if (!accountLines) return fills
    return { ...fills, account_lines: accountLines }
}

// A new form: dated today, with the setting's starting lines and Ship to from the Company
// settings (`shipTo`, shipToStartOf). With a vendor (the `?vendor` route param) the header
// is filled as a pick fills it.
export function newPurchaseOrderValues(input: {
    today: string
    purchaseLines: PurchaseLines
    shipTo: string
    vendor?: VendorOrderFill | null
    accountIsListed?: boolean
}): PurchaseOrderFormValues {
    const { today, purchaseLines, shipTo, vendor, accountIsListed = false } = input
    const blank: PurchaseOrderFormValues = {
        vendor: '',
        mailing_address: null,
        email: '',
        date: today,
        ship_to: shipTo,
        ...purchaseStartLines(purchaseLines),
        message: '',
        memo: '',
    }
    if (!vendor) return blank
    return { ...blank, vendor: vendor.id, ...vendorOrderFills(vendor, accountIsListed, blank) }
}

type SourceOrder = Pick<
    BooksPurchaseOrders,
    'vendor' | 'mailing_address' | 'email' | 'ship_to' | 'message'
>

// Read view "Copy" (`?copy=<id>`, spec §3.7): a new order for the same vendor with its
// mailing address, email, Ship to, the lines of both tables (new ids, so nothing is
// received or billed on them) and the message, dated today. The memo is not copied.
export function copyPurchaseOrderValues(
    order: SourceOrder,
    lines: readonly PurchaseLineRow[],
    today: string
): PurchaseOrderFormValues {
    return {
        vendor: order.vendor,
        mailing_address: order.mailing_address ?? null,
        email: order.email,
        date: today,
        ship_to: order.ship_to,
        ...purchaseLinesWithNewIds(lines),
        message: order.message,
        memo: '',
    }
}

// The read view's rows after Total (spec §3.6): Billed, the amount on posted bills, with
// a minus sign and only above zero; then Open (strong), the order's open amount.
export function purchaseOrderReadTotals(
    order: Pick<BooksPurchaseOrders, 'currency' | 'open_amount'>,
    lines: readonly Pick<BooksPurchaseOrderLines, 'billed'>[]
): DocumentTotalRow[] {
    const billed = lines.reduce((sum, line) => sum + line.billed, 0)
    const open: DocumentTotalRow = {
        label: 'Open',
        amount: formatMoney(order.open_amount, order.currency),
        testId: 'purchase-order-total-open',
        isStrong: true,
    }
    if (billed <= 0) return [open]
    const billedRow = {
        label: 'Billed',
        amount: `${MINUS}${formatMoney(billed, order.currency)}`,
        testId: 'purchase-order-total-billed',
    }
    return [billedRow, open]
}

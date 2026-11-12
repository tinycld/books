// The sales receipt form's own start values: a new form's, a copy's and a correction's.
// The shared values (lines, totals) are in lib/document-values.ts.

import type { BooksSalesReceipts } from '../types'
import { type CustomerFill, customerFills, type TaxRateFill } from './document-fills'
import type { DocumentLineRow } from './document-line-columns'
import { type DocumentFormValuesBase, emptyItemLine, linesWithNewIds } from './document-values'
import { SALES_RECEIPT_KIND } from './sales-document-kinds'

// The `books:sales_receipt` host's built-in values: the shared ones and the payment
// row. A receipt has no Terms and no Due date.
export type SalesReceiptFormValues = DocumentFormValuesBase & {
    payment_method: BooksSalesReceipts['payment_method']
    reference_no: string
    deposit_to: string
}

// A new form: dated today, on the default deposit account, with one empty Item line and
// no customer. With a customer (the `?customer` route param) the header is filled as a
// pick fills it, and an exempt customer's line is not taxable.
export function newSalesReceiptValues(input: {
    today: string
    customer?: CustomerFill | null
    rates: TaxRateFill[]
    defaultRateId: string
    depositDefault: string
}): SalesReceiptFormValues {
    const { today, customer, rates, defaultRateId, depositDefault } = input
    const fills = customer ? customerFills(customer, rates, today, null, SALES_RECEIPT_KIND) : null
    const line = emptyItemLine()
    const lines = fills?.isExempt ? [{ ...line, taxable: false }] : [line]
    return {
        customer: customer?.id ?? '',
        bill_to: fills?.bill_to ?? null,
        email: fills?.email ?? '',
        date: today,
        tax_rate: fills ? fills.tax_rate : defaultRateId,
        payment_method: '',
        reference_no: '',
        deposit_to: depositDefault,
        lines,
        message: '',
        memo: '',
    }
}

type SourceReceipt = Pick<
    BooksSalesReceipts,
    | 'id'
    | 'customer'
    | 'bill_to'
    | 'email'
    | 'date'
    | 'tax_rate'
    | 'payment_method'
    | 'reference_no'
    | 'deposit_to'
    | 'message'
    | 'memo'
>

// Where a copy deposits (spec §3.3): the account set in "Sales deposited to"; with Ask,
// the source's account while it is still an active deposit account, else the default.
export type CopyDeposit = {
    setAccount: string
    activeIds: ReadonlySet<string>
    defaultId: string
}

function copyDepositTo(source: string, deposit: CopyDeposit): string {
    if (deposit.setAccount !== '') return deposit.setAccount
    return deposit.activeIds.has(source) ? source : deposit.defaultId
}

// Read view "Copy" (`?copy=<id>`): a new draft for the same customer (or none) with the
// same lines, tax, payment method and message, dated the day given; no reference no., no
// memo, and it replaces nothing. Bill to and Email come from the customer's current
// record as a pick fills them (the source's are a snapshot taken for that receipt).
export function copySalesReceiptValues(
    receipt: SourceReceipt,
    lines: readonly DocumentLineRow[],
    today: string,
    customer: CustomerFill | null,
    deposit: CopyDeposit
): SalesReceiptFormValues {
    // The tax stays the source's, so no rate list is needed for the fill.
    const fills = customer ? customerFills(customer, [], today, null, SALES_RECEIPT_KIND) : null
    return {
        customer: receipt.customer,
        bill_to: fills?.bill_to ?? null,
        email: fills?.email ?? '',
        date: today,
        tax_rate: receipt.tax_rate,
        payment_method: receipt.payment_method,
        reference_no: '',
        deposit_to: copyDepositTo(receipt.deposit_to, deposit),
        lines: linesWithNewIds(lines),
        message: receipt.message,
        memo: '',
    }
}

// Read view "Edit" (`?replaces=<id>`): a correction keeps every value of the posted
// receipt, with new line ids, and names the receipt it replaces.
export function salesReceiptCorrectionValues(
    receipt: SourceReceipt,
    lines: readonly DocumentLineRow[]
): SalesReceiptFormValues {
    return {
        customer: receipt.customer,
        bill_to: receipt.bill_to,
        email: receipt.email,
        date: receipt.date,
        tax_rate: receipt.tax_rate,
        payment_method: receipt.payment_method,
        reference_no: receipt.reference_no,
        deposit_to: receipt.deposit_to,
        lines: linesWithNewIds(lines),
        message: receipt.message,
        memo: receipt.memo,
        replaces: receipt.id,
    }
}

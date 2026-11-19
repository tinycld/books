// The refund receipt form's own start values: a new form's, a copy's and a correction's.
// The shared values (lines, totals) are in lib/document-values.ts.

import type { BooksCreditMemos, BooksRefundReceipts, BooksSalesReceipts } from '../types'
import {
    type DepositAccountRow,
    defaultRefundFromAccount,
    isDepositAccountRow,
} from './deposit-accounts'
import { type CustomerFill, customerFills, type TaxRateFill } from './document-fills'
import type { DocumentLineRow } from './document-line-columns'
import { type DocumentFormValuesBase, emptyItemLine, linesWithNewIds } from './document-values'
import { REFUND_RECEIPT_KIND } from './sales-document-kinds'
import type { CopyDeposit } from './sales-receipt-values'

// The `books:refund_receipt` host's built-in values: the shared ones and the payment row,
// plus the source link (`sales_receipt`, `credit_memo`). The link is no field of the form:
// the save writes it, so the form drops it from its values (useDocumentForm).
export type RefundReceiptFormValues = DocumentFormValuesBase & {
    payment_method: BooksRefundReceipts['payment_method']
    reference_no: string
    refund_from: string
    sales_receipt: string
    credit_memo: string
}

// How a new form and a copy choose Refund from (spec §3.2, Q3): the active bank and
// Undeposited funds accounts, and the default (defaultRefundFromAccount). No Books
// setting names a refund account, so `setAccount` is always ''.
export function refundFromStart(accounts: readonly DepositAccountRow[]): CopyDeposit {
    const active = accounts.filter(isDepositAccountRow)
    return {
        setAccount: '',
        activeIds: new Set(active.map(account => account.id)),
        defaultId: defaultRefundFromAccount(accounts),
    }
}

// A new form: dated today, from the default Refund from account, with one empty Item line,
// no message (Q8: "Default message to customer" does not fill a refund), no customer and
// no link. With a customer (the `?customer` route param) the header is filled as a pick
// fills it, and an exempt customer's line is not taxable.
export function newRefundReceiptValues(input: {
    today: string
    customer?: CustomerFill | null
    rates: TaxRateFill[]
    defaultRateId: string
    refundFrom: CopyDeposit
}): RefundReceiptFormValues {
    const { today, customer, rates, defaultRateId, refundFrom } = input
    const fills = customer ? customerFills(customer, rates, today, null, REFUND_RECEIPT_KIND) : null
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
        refund_from: refundFrom.defaultId,
        sales_receipt: '',
        credit_memo: '',
        lines,
        message: '',
        memo: '',
    }
}

type SourceRefund = Pick<
    BooksRefundReceipts,
    | 'id'
    | 'customer'
    | 'bill_to'
    | 'email'
    | 'date'
    | 'tax_rate'
    | 'payment_method'
    | 'reference_no'
    | 'refund_from'
    | 'sales_receipt'
    | 'credit_memo'
    | 'message'
    | 'memo'
>

// A copy's Refund from: the source's while it is still an active refund account, else the
// default.
function copyRefundFrom(source: string, refundFrom: CopyDeposit): string {
    return refundFrom.activeIds.has(source) ? source : refundFrom.defaultId
}

// Read view "Copy" (`?copy=<id>`): a new draft for the same customer (or none) with the
// same lines, tax, payment method and message, dated the day given; no reference no., no
// memo, no link, and it replaces nothing. Bill to and Email come from the customer's
// current record as a pick fills them (the source's are a snapshot taken for that refund).
export function copyRefundReceiptValues(
    refund: SourceRefund,
    lines: readonly DocumentLineRow[],
    today: string,
    customer: CustomerFill | null,
    refundFrom: CopyDeposit
): RefundReceiptFormValues {
    // The tax stays the source's, so no rate list is needed for the fill.
    const fills = customer ? customerFills(customer, [], today, null, REFUND_RECEIPT_KIND) : null
    return {
        customer: refund.customer,
        bill_to: fills?.bill_to ?? null,
        email: fills?.email ?? '',
        date: today,
        tax_rate: refund.tax_rate,
        payment_method: refund.payment_method,
        reference_no: '',
        refund_from: copyRefundFrom(refund.refund_from, refundFrom),
        sales_receipt: '',
        credit_memo: '',
        lines: linesWithNewIds(lines),
        message: refund.message,
        memo: '',
    }
}

// Read view "Refund" on a posted sales receipt (`?sales_receipt=<id>`, spec §3.2): a new
// draft with the receipt's customer (or none), Bill to, Email, Tax and payment method and
// a copy of every line (kind, product, description, quantity, rate or percent, taxable)
// under new ids, dated the day given; Refund from is the receipt's deposit account while it
// is an active refund account, else the default rule; no reference no., an empty message
// and an empty memo. It names the receipt in `sales_receipt` and replaces nothing. Bill to
// and Email are the receipt's snapshot, as a credit memo made from an invoice takes the
// invoice's.
export function refundValuesFromSalesReceipt(
    receipt: Pick<
        BooksSalesReceipts,
        'id' | 'customer' | 'bill_to' | 'email' | 'tax_rate' | 'payment_method' | 'deposit_to'
    >,
    lines: readonly DocumentLineRow[],
    today: string,
    refundFrom: CopyDeposit
): RefundReceiptFormValues {
    return {
        customer: receipt.customer,
        bill_to: receipt.bill_to,
        email: receipt.email,
        date: today,
        tax_rate: receipt.tax_rate,
        payment_method: receipt.payment_method,
        reference_no: '',
        refund_from: copyRefundFrom(receipt.deposit_to, refundFrom),
        sales_receipt: receipt.id,
        credit_memo: '',
        lines: linesWithNewIds(lines),
        message: '',
        memo: '',
    }
}

// Read view "Refund credit" on a posted credit memo (`?credit_memo=<id>`, spec §3.3): a
// payout with the memo's customer, Bill to, Email and Tax and a copy of every line under
// new ids, dated the day given or the memo's date when that is later (a payout is never
// dated before its memo); Refund from by the default rule; no payment method, no reference
// no., an empty message and an empty memo. It names the memo in `credit_memo`.
export function refundValuesFromCreditMemo(
    memo: Pick<BooksCreditMemos, 'id' | 'customer' | 'bill_to' | 'email' | 'tax_rate' | 'date'>,
    lines: readonly DocumentLineRow[],
    today: string,
    refundFrom: CopyDeposit
): RefundReceiptFormValues {
    const memoDay = memo.date.slice(0, 10)
    return {
        customer: memo.customer,
        bill_to: memo.bill_to,
        email: memo.email,
        date: memoDay > today ? memoDay : today,
        tax_rate: memo.tax_rate,
        payment_method: '',
        reference_no: '',
        refund_from: refundFrom.defaultId,
        sales_receipt: '',
        credit_memo: memo.id,
        lines: linesWithNewIds(lines),
        message: '',
        memo: '',
    }
}

// Read view "Edit" (`?replaces=<id>`): a correction keeps every value of the posted
// refund, its link included, with new line ids, and names the refund it replaces.
export function refundReceiptCorrectionValues(
    refund: SourceRefund,
    lines: readonly DocumentLineRow[]
): RefundReceiptFormValues {
    return {
        customer: refund.customer,
        bill_to: refund.bill_to,
        email: refund.email,
        date: refund.date,
        tax_rate: refund.tax_rate,
        payment_method: refund.payment_method,
        reference_no: refund.reference_no,
        refund_from: refund.refund_from,
        sales_receipt: refund.sales_receipt,
        credit_memo: refund.credit_memo,
        lines: linesWithNewIds(lines),
        message: refund.message,
        memo: refund.memo,
        replaces: refund.id,
    }
}

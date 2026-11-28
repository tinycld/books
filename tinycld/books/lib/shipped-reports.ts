// e2e specs import this module in Node (lesson 29), so it imports only core's
// param-key, which imports nothing.
import { paramKey } from '@tinycld/core/reports/lib/param-key'

// The shipped_key of each Books shipped report that a Books screen links to
// (server/report_sales_tax_liability.go, server/report_customer_balance.go,
// server/report_ar_aging.go, server/report_ap_aging.go, server/report_vendor_balance.go
// and server/report_sales.go register the reports under these keys). The Vendors
// list's Reports menu links the Vendor Balance and the A/P Aging.
// server/report_expenses_by_vendor.go registers the Expenses by Vendor.
export const SALES_TAX_LIABILITY_SHIPPED_KEY = 'books.sales_tax_liability'
export const CUSTOMER_BALANCE_SHIPPED_KEY = 'books.customer_balance'
export const AR_AGING_SHIPPED_KEY = 'books.ar_aging'
export const AP_AGING_SHIPPED_KEY = 'books.ap_aging'
export const VENDOR_BALANCE_SHIPPED_KEY = 'books.vendor_balance'
export const EXPENSES_BY_VENDOR_SHIPPED_KEY = 'books.expenses_by_vendor'
// server/report_form_1099.go registers the 1099 Summary and Detail.
export const FORM_1099_SHIPPED_KEY = 'books.form_1099'
// server/report_purchase_orders.go registers the Open Purchase Orders, which the
// Purchase orders tab's toolbar and the Vendors list's Reports menu link.
export const OPEN_PURCHASE_ORDERS_SHIPPED_KEY = 'books.open_purchase_orders'
// server/report_bins.go registers the Stock by Bin Location, which the Bin locations tab's
// toolbar and its row menu's Stock in this bin link.
export const STOCK_BY_BIN_SHIPPED_KEY = 'books.stock_by_bin'
// Its Bin param (multi-pick of bin ids), as server/report_bins.go and the fixture's
// STOCK_BY_BIN_PARAMS name it.
export const STOCK_BY_BIN_BINS_PARAM = 'bins'
export const SALES_BY_CUSTOMER_SHIPPED_KEY = 'books.sales_by_customer'
export const SALES_BY_PRODUCT_SHIPPED_KEY = 'books.sales_by_product'
// server/report_statements.go: the rows of a customer statement's PDF.
export const STATEMENT_BALANCE_FORWARD_SHIPPED_KEY = 'books.statement_balance_forward'
export const STATEMENT_OPEN_ITEMS_SHIPPED_KEY = 'books.statement_open_items'
// server/report_reconciliation.go: the finished reconciliation summary's View report.
export const RECONCILIATION_REPORT_SHIPPED_KEY = 'books.reconciliation_report'

// A report link's params by param id: a string for a single value, a list for a
// multi-pick param (as the Stock by Bin's Bin).
export type ReportParams = Record<string, string | readonly string[]>

// A param value as core's report view reads it from the URL: a string as given, a list as
// a JSON list (core's view-url writes and reads a multi-pick that way).
function paramQueryValue(value: string | readonly string[]): string {
    if (typeof value === 'string') return value
    return JSON.stringify(value)
}

// A report link's query: each param under the key core's report view reads it from
// (`paramKey`), so the report opens with those filters set.
export function reportParamQuery(params: ReportParams): Record<string, string> {
    return Object.fromEntries(
        Object.entries(params).map(([id, value]) => [paramKey(id), paramQueryValue(value)])
    )
}

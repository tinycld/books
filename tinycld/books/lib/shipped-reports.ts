// The shipped_key of each Books shipped report that a Books screen links to
// (server/report_sales_tax_liability.go, server/report_customer_balance.go,
// server/report_ar_aging.go, server/report_ap_aging.go, server/report_vendor_balance.go
// and server/report_sales.go register the reports under these keys). The Vendors
// list's Reports menu links the Vendor Balance and the A/P Aging.
export const SALES_TAX_LIABILITY_SHIPPED_KEY = 'books.sales_tax_liability'
export const CUSTOMER_BALANCE_SHIPPED_KEY = 'books.customer_balance'
export const AR_AGING_SHIPPED_KEY = 'books.ar_aging'
export const AP_AGING_SHIPPED_KEY = 'books.ap_aging'
export const VENDOR_BALANCE_SHIPPED_KEY = 'books.vendor_balance'
export const SALES_BY_CUSTOMER_SHIPPED_KEY = 'books.sales_by_customer'
export const SALES_BY_PRODUCT_SHIPPED_KEY = 'books.sales_by_product'
// server/report_statements.go: the rows of a customer statement's PDF.
export const STATEMENT_BALANCE_FORWARD_SHIPPED_KEY = 'books.statement_balance_forward'
export const STATEMENT_OPEN_ITEMS_SHIPPED_KEY = 'books.statement_open_items'

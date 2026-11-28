// The groups of the Books report list, in list order. A shipped report is in the group of
// its key; a shipped report that is not in the map is in Accounting; a saved report (no
// shipped key) is in Saved, after every shipped report.
export const REPORT_GROUPS = ['overview', 'sales', 'expenses', 'accounting', 'saved'] as const

export type ReportGroup = (typeof REPORT_GROUPS)[number]

const GROUP_OF_KEY: Record<string, ReportGroup> = {
    'books.profit_and_loss': 'overview',
    'books.profit_and_loss_by_month': 'overview',
    'books.balance_sheet': 'overview',
    'books.ar_aging': 'sales',
    'books.customer_balance': 'sales',
    'books.sales_by_customer': 'sales',
    'books.sales_by_product': 'sales',
    'books.sales_tax_liability': 'sales',
    'books.statement_balance_forward': 'sales',
    'books.statement_open_items': 'sales',
    'books.ap_aging': 'expenses',
    'books.vendor_balance': 'expenses',
    'books.expenses_by_vendor': 'expenses',
    'books.form_1099': 'expenses',
    'books.open_purchase_orders': 'expenses',
    'books.stock_by_bin': 'expenses',
}

export function reportGroup(shippedKey: string): ReportGroup {
    if (shippedKey === '') return 'saved'
    return GROUP_OF_KEY[shippedKey] ?? 'accounting'
}

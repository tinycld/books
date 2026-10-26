// Data only, so the sidebar can read which reports exist without importing any data hook.
// A report unit flips its entry's `available` flag when it ships the report's definition.

export type ReportSectionId =
    | 'business-overview'
    | 'accountant'
    | 'who-owes-you'
    | 'what-you-owe'
    | 'sales'
    | 'expenses'
    | 'taxes'

export interface ReportSection {
    id: ReportSectionId
    title: string
}

export const REPORT_SECTIONS: readonly ReportSection[] = [
    { id: 'business-overview', title: 'Business overview' },
    { id: 'accountant', title: 'For my accountant' },
    { id: 'who-owes-you', title: 'Who owes you' },
    { id: 'what-you-owe', title: 'What you owe' },
    { id: 'sales', title: 'Sales and customers' },
    { id: 'expenses', title: 'Expenses and vendors' },
    { id: 'taxes', title: 'Taxes' },
]

export interface ReportEntry {
    id: string
    title: string
    description: string
    section: ReportSectionId
    available: boolean
}

export const REPORT_ENTRIES: readonly ReportEntry[] = [
    {
        id: 'profit-and-loss',
        title: 'Profit and Loss',
        description: 'Income, expenses and net income for a period',
        section: 'business-overview',
        available: false,
    },
    {
        id: 'balance-sheet',
        title: 'Balance Sheet',
        description: 'What the business owns, what it owes, and its equity on a date',
        section: 'business-overview',
        available: false,
    },
    {
        id: 'trial-balance',
        title: 'Trial Balance',
        description: 'Debit and credit balance of every account on a date',
        section: 'accountant',
        available: false,
    },
    {
        id: 'general-ledger',
        title: 'General Ledger',
        description: 'Every posted line, grouped by account, for a period',
        section: 'accountant',
        available: false,
    },
    {
        id: 'journal',
        title: 'Journal',
        description: 'Every posted entry with its lines, in date order',
        section: 'accountant',
        available: false,
    },
    {
        id: 'audit-log',
        title: 'Audit log',
        description: 'Who changed what in the books, and when',
        section: 'accountant',
        available: false,
    },
    {
        id: 'receivables-aging',
        title: 'Accounts receivable aging',
        description: 'Unpaid invoices by how long they are overdue',
        section: 'who-owes-you',
        available: false,
    },
    {
        id: 'customer-balance',
        title: 'Customer balance',
        description: 'What each customer owes today',
        section: 'who-owes-you',
        available: false,
    },
    {
        id: 'payables-aging',
        title: 'Accounts payable aging',
        description: 'Unpaid bills by how long they are overdue',
        section: 'what-you-owe',
        available: false,
    },
    {
        id: 'vendor-balance',
        title: 'Vendor balance',
        description: 'What you owe each vendor today',
        section: 'what-you-owe',
        available: false,
    },
    {
        id: 'sales-by-customer',
        title: 'Sales by customer',
        description: 'Income per customer for a period',
        section: 'sales',
        available: false,
    },
    {
        id: 'sales-by-product',
        title: 'Sales by product or service',
        description: 'Income per product or service for a period',
        section: 'sales',
        available: false,
    },
    {
        id: 'expenses-by-vendor',
        title: 'Expenses by vendor',
        description:
            'Spending per vendor for a period, with the bills, expenses and checks that make up each total',
        section: 'expenses',
        available: false,
    },
    {
        id: 'sales-tax-liability',
        title: 'Sales tax liability',
        description: 'Sales tax collected and owed per agency',
        section: 'taxes',
        available: false,
    },
    {
        id: 'report-1099',
        title: '1099 contractor summary',
        description: 'Payments to each 1099 contractor for a calendar year',
        section: 'taxes',
        available: false,
    },
]

export type HubSection = ReportSection & { entries: ReportEntry[] }

export function hubSections(
    entries: readonly ReportEntry[],
    sections: readonly ReportSection[] = REPORT_SECTIONS
): HubSection[] {
    return sections
        .map(section => ({
            ...section,
            entries: entries.filter(entry => entry.section === section.id && entry.available),
        }))
        .filter(section => section.entries.length > 0)
}

export function reportEntry(
    id: string,
    entries: readonly ReportEntry[] = REPORT_ENTRIES
): ReportEntry | undefined {
    return entries.find(entry => entry.id === id)
}

export function hasAvailableReport(entries: readonly ReportEntry[] = REPORT_ENTRIES): boolean {
    return entries.some(entry => entry.available)
}

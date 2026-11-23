import type { ReactNode } from 'react'
import type { DashboardPrefs, WidgetId } from '../../lib/dashboard-prefs'
import { BankAccountsWidget } from './BankAccountsWidget'
import { ExpensesWidget } from './ExpensesWidget'
import { InvoicesWidget } from './InvoicesWidget'
import { ProfitAndLossWidget } from './ProfitAndLossWidget'
import { SalesWidget } from './SalesWidget'

// What the grid hands every widget.
export type WidgetProps = {
    hideAmounts: boolean
    canWrite: boolean
    prefs: DashboardPrefs
    // A widget's period picker is disabled until the preference has loaded.
    isPrefsReady: boolean
    // The grid has one column: the Sales columns of a long period draw one-letter labels.
    isOneColumn: boolean
    onPrefsChange: (next: DashboardPrefs) => void
}

// The component of each widget (plan D7).
export const DASHBOARD_WIDGETS: Record<WidgetId, (props: WidgetProps) => ReactNode> = {
    invoices: InvoicesWidget,
    expenses: ExpensesWidget,
    bankAccounts: BankAccountsWidget,
    profitAndLoss: ProfitAndLossWidget,
    sales: SalesWidget,
}

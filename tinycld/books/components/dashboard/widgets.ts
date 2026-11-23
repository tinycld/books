import type { ReactNode } from 'react'
import type { DashboardPrefs, WidgetId } from '../../lib/dashboard-prefs'
import { InvoicesWidget } from './InvoicesWidget'

// What the grid hands every widget.
export type WidgetProps = {
    hideAmounts: boolean
    canWrite: boolean
    prefs: DashboardPrefs
    // A widget's period picker is disabled until the preference has loaded.
    isPrefsReady: boolean
    onPrefsChange: (next: DashboardPrefs) => void
}

// The component of each widget (plan D7). A widget id with no component here draws nothing.
export const DASHBOARD_WIDGETS: Partial<Record<WidgetId, (props: WidgetProps) => ReactNode>> = {
    invoices: InvoicesWidget,
}

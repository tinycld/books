import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useUrl } from '@tinycld/core/lib/use-url'
import { router } from 'expo-router'
import type { LucideIcon } from 'lucide-react-native'
import { BOOKS_REPORT_BASE, BOOKS_REPORT_ROUTE } from '../lib/books-report-route'
import { newActionSidebarLabel } from '../lib/new-actions'
import { availableOnly, isActivePath, SIDEBAR_ENTRIES } from '../lib/shell-nav'
import { filterTerms, matchesTerms } from '../lib/sidebar-filter'
import { useBooksUIStore } from '../stores/books-ui-store'
import { useBooksReportList } from './useBooksReportList'
import { useNewMenu } from './useNewMenu'

export interface FilterRow {
    key: string
    label: string
    // The section the row comes from, drawn beside the label. A navigation row has its
    // icon instead.
    tag?: string
    icon?: LucideIcon
    isActive: boolean
    testID: string
    onPress: () => void
}

// The rows of the sidebar that match its filter, in sidebar order: the navigation (with
// the Accounting rows, folded or not), the New actions, then the reports. The Shortcuts
// are left out: each one opens a row that is in this list already.
export function useSidebarFilterRows() {
    const query = useBooksUIStore(s => s.filter)
    const orgHref = useOrgHref()
    const { pathname } = useUrl()
    const { columns, open } = useNewMenu()
    const list = useBooksReportList()
    const terms = filterTerms(query)

    const navRows: FilterRow[] = availableOnly(SIDEBAR_ENTRIES).map(entry => ({
        key: `nav-${entry.id}`,
        label: entry.label,
        icon: entry.icon,
        isActive: isActivePath(pathname, entry),
        testID: `books-sidebar-match-nav-${entry.id}`,
        onPress: () => router.navigate(orgHref(entry.href, entry.params)),
    }))
    const newRows: FilterRow[] = columns
        .flatMap(column => column.actions)
        .map(action => ({
            key: `new-${action.id}`,
            label: newActionSidebarLabel(action),
            tag: 'New',
            isActive: false,
            testID: `books-sidebar-match-new-${action.id.replace(/_/g, '-')}`,
            onPress: () => open(action),
        }))
    const reportRows: FilterRow[] = list.reports.map(report => ({
        key: `report-${report.id}`,
        label: report.title,
        tag: 'Report',
        isActive: pathname.endsWith(`/${BOOKS_REPORT_BASE}/${report.id}`),
        testID: `books-sidebar-match-report-${report.id}`,
        onPress: () => router.navigate(orgHref(BOOKS_REPORT_ROUTE, { id: report.id })),
    }))

    const rows = [...navRows, ...newRows, ...reportRows].filter(row =>
        matchesTerms(terms, [row.label, row.tag ?? ''])
    )
    return { rows, isLoadingReports: list.isLoading }
}

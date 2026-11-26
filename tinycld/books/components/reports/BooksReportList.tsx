import { SidebarDivider, SidebarItem } from '@tinycld/core/components/sidebar-primitives'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useUrl } from '@tinycld/core/lib/use-url'
import { router } from 'expo-router'
import { BarChart3 } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import type { BooksReport } from '../../hooks/useBooksReports'
import {
    BOOKS_HUB_PARAMS,
    BOOKS_REPORT_BASE,
    BOOKS_REPORT_ROUTE,
    REPORTS_HUB_ROUTE,
} from '../../lib/books-report-route'

// Where the list is drawn. The two can be on screen together (the sidebar beside the Books
// reports screen), so each has its own test ids.
export type ReportListScope = 'sidebar' | 'screen'

const ID_PREFIX: Record<ReportListScope, { row: string; part: string }> = {
    sidebar: { row: 'books-sidebar-report', part: 'books-sidebar-reports' },
    screen: { row: 'books-reports-row', part: 'books-reports' },
}

function GroupDivider({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <SidebarDivider />
}

function ReportsNote({
    isVisible,
    testID,
    text,
}: {
    isVisible: boolean
    testID: string
    text: string
}) {
    if (!isVisible) return null
    return (
        <Text testID={testID} className="px-3 py-2 text-sm text-muted-foreground">
            {text}
        </Text>
    )
}

function ReportsError({
    isVisible,
    part,
    onRetry,
}: {
    isVisible: boolean
    part: string
    onRetry: () => void
}) {
    if (!isVisible) return null
    return (
        <View testID={`${part}-error`} className="flex-row items-center gap-2 px-3">
            <Text accessibilityRole="alert" className="flex-1 text-sm text-danger">
                Could not load the reports
            </Text>
            <Pressable
                testID={`${part}-retry`}
                accessibilityRole="button"
                onPress={onRetry}
                className="justify-center px-2"
                style={{ minHeight: 44 }}
            >
                <Text className="text-sm font-medium text-primary">Retry</Text>
            </Pressable>
        </View>
    )
}

interface BooksReportListProps {
    isVisible: boolean
    scope: ReportListScope
    reports: readonly BooksReport[]
    isLoading: boolean
    isError: boolean
    onRetry: () => void
}

// The Books reports, or what stands in for them, then the row that opens core's Reports
// hub. That row is drawn in every state: the hub does its own read.
export function BooksReportList(props: BooksReportListProps) {
    const { isVisible, scope, reports, isLoading, isError, onRetry } = props
    const orgHref = useOrgHref()
    const { pathname } = useUrl()
    if (!isVisible) return null

    const { row, part } = ID_PREFIX[scope]
    // The list is in group order (sortBooksReports): a divider starts each group after the
    // first.
    const startsGroup = (index: number) =>
        index > 0 && reports[index - 1].group !== reports[index].group
    const items = reports.map((report, index) => (
        <View key={report.id}>
            <GroupDivider isVisible={startsGroup(index)} />
            <SidebarItem
                label={report.title}
                isActive={pathname.endsWith(`/${BOOKS_REPORT_BASE}/${report.id}`)}
                closesDrawer
                onPress={() => router.navigate(orgHref(BOOKS_REPORT_ROUTE, { id: report.id }))}
                testID={`${row}-${report.id}`}
            />
        </View>
    ))
    const isEmpty = !isLoading && !isError && reports.length === 0
    return (
        <>
            {items}
            <ReportsNote isVisible={isLoading} testID={`${part}-loading`} text="Loading…" />
            <ReportsNote isVisible={isEmpty} testID={`${part}-empty`} text="No reports" />
            <ReportsError isVisible={isError} part={part} onRetry={onRetry} />
            <SidebarItem
                label="All reports"
                icon={BarChart3}
                closesDrawer
                onPress={() => router.navigate(orgHref(REPORTS_HUB_ROUTE, BOOKS_HUB_PARAMS))}
                testID={`${part}-all`}
            />
        </>
    )
}

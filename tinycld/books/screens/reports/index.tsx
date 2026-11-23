import { ScrollView, Text } from 'react-native'
import { BooksReportList } from '../../components/reports/BooksReportList'
import { useBooksReportList } from '../../hooks/useBooksReportList'
import { useFabClearanceStyle } from '../../lib/fab-clearance'

/**
 * `/a/books/reports`: the Books reports, inside Books. Core's report view opens this route
 * for Back when there is no history (a report opened from a link or after a reload), so
 * Back from a Books report always stays in Books.
 */
export default function BooksReportsScreen() {
    const list = useBooksReportList()
    // The phone New button floats over the scroller, so the last row needs room to clear it.
    const fabClearance = useFabClearanceStyle()
    return (
        <ScrollView
            testID="books-reports-screen"
            className="flex-1 bg-background"
            contentContainerClassName="gap-1 p-4"
            contentContainerStyle={fabClearance}
        >
            <Text accessibilityRole="header" className="px-3 text-xl font-semibold text-foreground">
                Reports
            </Text>
            <Text className="px-3 pb-2 text-sm text-muted-foreground">
                The Books reports you can open. To search, make or share a report, choose All
                reports.
            </Text>
            <BooksReportList
                isVisible
                scope="screen"
                reports={list.reports}
                isLoading={list.isLoading}
                isError={list.isError}
                onRetry={list.retry}
            />
        </ScrollView>
    )
}

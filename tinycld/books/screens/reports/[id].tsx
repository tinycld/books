import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { ReportScreen } from '@tinycld/core/reports/screens/ReportScreen'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router, useLocalSearchParams } from 'expo-router'
import { Text, View } from 'react-native'
import { useBooksReportState } from '../../hooks/useBooksReportState'
import { BOOKS_REPORT_BASE } from '../../lib/books-report-route'

// A report of another package was opened on the Books route (a hand-written link). It is
// not drawn in Books; the person can open it where it belongs.
function NotBooksReport({ reportId }: { reportId: string }) {
    const orgHref = useOrgHref()
    return (
        <View
            testID="books-report-foreign"
            className="flex-1 items-center justify-center gap-3 bg-background p-6"
        >
            <Text className="text-base text-foreground">This report is not a Books report.</Text>
            <Button
                size="sm"
                variant="outline"
                testID="books-report-foreign-open"
                onPress={() => router.replace(orgHref('reports/[id]', { id: reportId }))}
            >
                <ButtonText>Open it in Reports</ButtonText>
            </Button>
        </View>
    )
}

/**
 * A Books report, in core's report view, on a Books route: the Books sidebar stays, and the
 * view's drill, Back and Save as links stay under `books/reports`.
 *
 * Edit runs core's report builder on this same route (`?edit=1`), and the builder keeps its
 * unsaved input in component state. So the view is drawn for every state but one: a loaded
 * row of another package. Do not put a loading, error or list check in front of it.
 */
export default function BooksReportRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const state = useBooksReportState(id)
    if (state === 'foreign') return <NotBooksReport reportId={id} />
    return <ReportScreen reportId={id} basePath={BOOKS_REPORT_BASE} />
}

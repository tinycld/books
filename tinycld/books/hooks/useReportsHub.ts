import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { router } from 'expo-router'
import {
    type HubSection,
    hubSections,
    REPORT_ENTRIES,
    type ReportEntry,
} from '../lib/report-registry'
import { useReportUIStore } from '../stores/report-ui-store'
import { useBooksAccess } from './useBooksAccess'

export type ReportsHubState = 'loading' | 'error' | 'ready'

export type ReportsHub = {
    state: ReportsHubState
    sections: HubSection[]
    isEmpty: boolean
    onOpen(entry: ReportEntry): void
    onRetry(): void
}

function hubState(access: { isReady: boolean; isError: boolean }): ReportsHubState {
    if (access.isError) return 'error'
    if (!access.isReady) return 'loading'
    return 'ready'
}

export function useReportsHub(entries: readonly ReportEntry[] = REPORT_ENTRIES): ReportsHub {
    const orgHref = useOrgHref()
    const access = useBooksAccess()
    const [accessCollection] = useStore('books_access')
    const startVisit = useReportUIStore(state => state.startVisit)
    const state = hubState(access)
    const sections = state === 'ready' && access.canRead ? hubSections(entries) : []

    return {
        state,
        sections,
        // Never "No reports yet" while access loads or after it fails.
        isEmpty: access.isReady && !access.isError && access.canRead && sections.length === 0,
        onOpen: entry => {
            startVisit(entry.id)
            router.push(orgHref(`books/reports/${entry.id}`))
        },
        // books_access is safe as a source since tinycld #379: core cleans only a source in
        // the error state, so the ready source every Books screen reads is never emptied.
        onRetry: () => {
            void recoverLiveQueries({
                queries: [access.collection],
                sources: [accessCollection],
                onError: err => log.error('books.reports', err),
            })
        },
    }
}

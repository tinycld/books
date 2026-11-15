import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'

// The href of the shipped report with this key that the reader can open (the reports
// list rule admits only the reader's own, shared and published rows). Null while it
// loads, when the load fails, and when the reader has no such report: the caller then
// shows no link. Nothing is logged here: a missing link is the whole failure, and a log
// in render would repeat on every render.
export function useShippedReportHref(shippedKey: string) {
    const orgHref = useOrgHref()
    const [reportsCollection] = useStore('reports')
    const { data } = useLiveQuery({
        query: q =>
            q
                .from({ report: reportsCollection })
                .where(({ report }) => eq(report.shipped_key, shippedKey))
                .select(({ report }) => ({ id: report.id }))
                .findOne(),
        queryKey: ['books', 'shipped-report', shippedKey],
    })
    const id = data?.id
    if (!id) return null
    return orgHref('reports/[id]', { id })
}

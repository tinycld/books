import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { reportParamQuery } from '../lib/shipped-reports'

type OrgHref = ReturnType<typeof useOrgHref>

// The callers that pass no params share one value, so their href stays the same string.
const NO_PARAMS: Record<string, string> = {}

// The id of the shipped report with this key that the reader can open (the reports list
// rule admits only the reader's own, shared and published rows). Null while it loads,
// when the load fails, and when the reader has no such report.
export function useShippedReportId(shippedKey: string): string | null {
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
    return data?.id ?? null
}

// The report's route with each param written as core's report view reads it
// (`?p-<param id>=<value>`), so the report opens with those filters set.
export function shippedReportHref(orgHref: OrgHref, id: string, params: Record<string, string>) {
    return orgHref('reports/[id]', { id, ...reportParamQuery(params) })
}

// The href of the shipped report with this key, opened with `params` set. Null while it
// loads, when the load fails, and when the reader has no such report: the caller then
// shows no link. Nothing is logged here: a missing link is the whole failure, and a log
// in render would repeat on every render.
export function useShippedReportHref(
    shippedKey: string,
    params: Record<string, string> = NO_PARAMS
) {
    const orgHref = useOrgHref()
    const id = useShippedReportId(shippedKey)
    if (!id) return null
    return shippedReportHref(orgHref, id, params)
}

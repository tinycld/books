import { Text, View } from 'react-native'
import { type DocumentStatus, statusBadgeOf } from '../../lib/document-lifecycle'
import { formatDay } from '../../lib/register-range'
import { StatusBadge } from '../StatusBadge'
import { DocumentDetail } from './DocumentDetail'
import { useDocumentKind } from './document-kind-context'
import type { DocumentReadDetailsProps } from './document-kinds'

// The status as a badge under its label, as the title draws it.
function StatusDetail({ status }: { status: DocumentStatus }) {
    const { doc } = useDocumentKind()
    const badge = statusBadgeOf(doc.lifecycle, status)
    if (!badge) return null
    const testID = `${doc.testId}-detail-status`
    return (
        <View testID={testID} className="items-start gap-0.5">
            <Text className="text-xs text-muted-foreground">Status</Text>
            <StatusBadge label={badge.label} tone={badge.tone} />
        </View>
    )
}

// The estimate's own read details (spec §3.8): the shared date (its host labels it
// "Estimate date"), Expiration date, the status, and Accepted by and Accepted date when
// set. A record of another kind has none of them, so only the shared date shows.
export function EstimateReadDetails({ record, children }: DocumentReadDetailsProps) {
    const fields = record.kindFields
    if (fields.kind !== 'estimate') return children
    const expiration = fields.expiration_date ? formatDay(fields.expiration_date) : ''
    const acceptedDate = fields.accepted_date ? formatDay(fields.accepted_date) : ''
    return (
        <>
            {children}
            <DocumentDetail field="expiration" label="Expiration date" value={expiration} />
            <StatusDetail status={record.status} />
            <DocumentDetail field="accepted-by" label="Accepted by" value={fields.accepted_by} />
            <DocumentDetail field="accepted-date" label="Accepted date" value={acceptedDate} />
        </>
    )
}

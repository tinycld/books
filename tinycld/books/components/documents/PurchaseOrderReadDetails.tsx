import { Text } from 'react-native'
import type { DocumentRecord } from '../../hooks/document-data'
import { stampText } from '../../lib/entry-display'
import { localDayOf } from '../../lib/opening-balances'
import { formatDay } from '../../lib/register-range'
import { DocumentDetail } from './DocumentDetail'
import { useDocumentKind } from './document-kind-context'
import type { DocumentReadBandRowProps, DocumentReadDetailsProps } from './document-kinds'

// The order's own read details (purchase order spec §3.6): the shared date (its host labels
// it "Order date"), then Ship to. A record of another kind has none, so only the shared
// date shows; an order with no Ship to draws no detail (DocumentDetail).
export function PurchaseOrderReadDetails({ record, children }: DocumentReadDetailsProps) {
    const fields = record.kindFields
    if (fields.kind !== 'purchase_order') return children
    return (
        <>
            {children}
            <DocumentDetail field="ship-to" label="Ship to" value={fields.ship_to} />
        </>
    )
}

type OrderFields = Extract<DocumentRecord['kindFields'], { kind: 'purchase_order' }>

// "Closed by <name>, <date time>" for an order closed by hand; "Closed on <date>: every line
// is received" for one its bills closed; '' while it is open.
function closedText(status: DocumentRecord['status'], fields: OrderFields): string {
    if (status !== 'closed') return ''
    if (fields.closed_reason === 'received') {
        const localDay = localDayOf(fields.closed_at)
        const day = localDay ? formatDay(localDay) : ''
        return day ? `Closed on ${day}: every line is received` : ''
    }
    const closed = stampText(fields.closedBy?.name, fields.closed_at)
    return closed ? `Closed by ${closed}` : ''
}

function OrderStamp({ testID, text }: { testID: string; text: string }) {
    if (text === '') return null
    return (
        <Text testID={testID} className="text-xs text-muted-foreground">
            {text}
        </Text>
    )
}

// Under the message and memo, where a posting kind shows Posted by (spec §3.6): "Created by
// <name>, <date time>", and for a closed order the line that says how it closed. The people
// are the record query's (`createdBy`, `closedBy`), part of the screen's loading and Retry.
export function PurchaseOrderStamps({ record }: DocumentReadBandRowProps) {
    const { doc } = useDocumentKind()
    const fields = record.kindFields
    if (fields.kind !== 'purchase_order') return null
    const created = stampText(fields.createdBy?.name, fields.created)
    const createdText = created ? `Created by ${created}` : ''
    const closed = closedText(record.status, fields)
    return (
        <>
            <OrderStamp testID={`${doc.testId}-created-by`} text={createdText} />
            <OrderStamp testID={`${doc.testId}-closed`} text={closed} />
        </>
    )
}

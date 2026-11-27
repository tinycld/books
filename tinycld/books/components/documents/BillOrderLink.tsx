import { purchaseOrderLinkLabel } from '../../lib/document-source-links'
import { PURCHASE_ORDER_KIND } from '../../lib/sales-document-kinds'
import { DocumentSourceLink } from './DocumentSourceLink'
import { DocumentSourceLinkRow, type SourceLinkRowIds } from './DocumentSourceLinkRow'
import type { DocumentReadBandRowProps } from './document-kinds'

// The link's test id is the same on the form and the read view.
const LINK_TEST_ID = 'bill-from-purchase-order'

const IDS: SourceLinkRowIds = {
    row: 'bill-purchase-order-row',
    link: LINK_TEST_ID,
    remove: 'bill-purchase-order-remove',
    error: 'bill-purchase-order-error',
}

/**
 * The bill form's purchase order link row (the kind's FormBandRow, drawn before Terms, so
 * its Tab stop follows Vendor): "From purchase order 1004", which opens the order, and the
 * server's refusal of the link under it (DocumentSourceLinkRow). A bill keeps its order
 * (sourceLinkRules: no Remove link); nothing shows on a bill that names no order.
 */
export function BillOrderLinkRow() {
    return (
        <DocumentSourceLinkRow
            ids={IDS}
            targetKind={PURCHASE_ORDER_KIND}
            errorKey="purchase_order"
        />
    )
}

// Under the Posted-by stamp of a bill made from a purchase order: "From purchase order
// <n>", which opens the order. Its number is the bill query's (`orderRow`), so the link
// waits on no query of its own; nothing shows for a bill that names no order.
export function BillFromOrderLink({ record }: DocumentReadBandRowProps) {
    const fields = record.kindFields
    if (fields.kind !== 'bill' || !fields.purchase_order || !fields.orderRow) return null
    const label = purchaseOrderLinkLabel(fields.orderRow.number)
    return (
        <DocumentSourceLink
            label={label}
            kind={PURCHASE_ORDER_KIND}
            id={fields.purchase_order}
            testID={LINK_TEST_ID}
        />
    )
}

import { DocumentDetail } from './DocumentDetail'
import type { DocumentReadDetailsProps } from './document-kinds'

// The vendor credit's own read details (vendor credit spec §3.5): Vendor's credit no. after
// the shared date (Credit date). The band draws the Vendor itself. A detail with no value
// is not drawn (a credit with no vendor's credit no.). A record of another kind has none,
// so only the shared date shows.
export function VendorCreditReadDetails({ record, children }: DocumentReadDetailsProps) {
    const fields = record.kindFields
    if (fields.kind !== 'vendor_credit') return children
    return (
        <>
            {children}
            <DocumentDetail field="ref-no" label="Vendor's credit no." value={fields.ref_no} />
        </>
    )
}

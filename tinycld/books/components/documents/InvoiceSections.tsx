import type { DocumentReadSectionProps } from './document-kinds'
import { InvoiceCreditMemos } from './InvoiceCreditMemos'
import { InvoiceWriteOffs } from './InvoiceWriteOffs'

/**
 * The invoice kind's ReadSection: its Credit memos section (spec §3.10 of the credit memo
 * design), then its Write-offs section (write-off spec §3.4). Each section reads the
 * documents that name the invoice by its id and keeps its own Retry.
 */
export function InvoiceSections({ record }: DocumentReadSectionProps) {
    return (
        <>
            <InvoiceCreditMemos record={record} />
            <InvoiceWriteOffs record={record} />
        </>
    )
}

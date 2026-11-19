import { INVOICE_LINK_KEY } from '../../lib/credit-memo-link'
import { INVOICE_KIND } from '../../lib/sales-document-kinds'
import { DocumentSourceLinkRow, type SourceLinkRowIds } from './DocumentSourceLinkRow'

const IDS: SourceLinkRowIds = {
    row: 'credit-memo-link-row',
    link: 'credit-memo-invoice-link',
    remove: 'credit-memo-remove-link',
    error: 'credit-memo-invoice-error',
}

/**
 * The credit memo form's invoice link row (the kind's FormBandRow): "For invoice 1004",
 * or "(void)" once that invoice is void, which opens the invoice, then Remove link, and
 * the server's refusal of the link under them (DocumentSourceLinkRow).
 */
export function CreditMemoLinkRow() {
    return <DocumentSourceLinkRow ids={IDS} targetKind={INVOICE_KIND} errorKey={INVOICE_LINK_KEY} />
}

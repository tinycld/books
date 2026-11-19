import { View } from 'react-native'
import { REFUND_RECEIPT_MESSAGES } from '../../lib/document-texts'
import { CREDIT_MEMO_KIND, SALES_RECEIPT_KIND } from '../../lib/sales-document-kinds'
import { DocumentInlineNotice } from './DocumentInlineNotice'
import { DocumentSourceLinkRow, type SourceLinkRowIds } from './DocumentSourceLinkRow'
import { useDocumentFormScope } from './document-form-context'

const IDS: SourceLinkRowIds = {
    row: 'refund-receipt-link-row',
    link: 'refund-receipt-source-link',
    remove: 'refund-receipt-remove-link',
    error: 'refund-receipt-source-error',
}

const NOTICE_ID = 'refund-receipt-payout-notice'

function PayoutNotice({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View className="mt-1">
            <DocumentInlineNotice
                testID={NOTICE_ID}
                message={REFUND_RECEIPT_MESSAGES.payoutNotice}
            />
        </View>
    )
}

/**
 * The refund receipt form's source link row (the kind's FormBandRow; spec §3.2, §3.3).
 * A refund of a sales receipt: "Refund of sales receipt 1004" ("(void)" once it is void),
 * which opens the receipt, then Remove link. A payout: "Pays out credit memo 1001 ·
 * $250.00 unapplied" (the memo's live balance, plus what the original pays out on a
 * correction), no Remove link, and the payout notice under it. The refusal of the link
 * (the server's, or the payout's cap) shows under the row. Nothing shows while the form
 * names no source.
 */
export function RefundReceiptLinkRow() {
    const { sourceLink } = useDocumentFormScope()
    const isPayout = sourceLink.key === 'credit_memo'
    const targetKind = isPayout ? CREDIT_MEMO_KIND : SALES_RECEIPT_KIND
    const errorKey = isPayout ? 'credit_memo' : 'sales_receipt'
    return (
        <DocumentSourceLinkRow ids={IDS} targetKind={targetKind} errorKey={errorKey}>
            <PayoutNotice isVisible={isPayout} />
        </DocumentSourceLinkRow>
    )
}

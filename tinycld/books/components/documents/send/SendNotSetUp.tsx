import { Dialog } from '@tinycld/core/ui/dialog'
import type { SendKind } from '../../../lib/document-send'
import { DOCUMENT_PARTIES } from '../../../lib/sales-document-kinds'
import { DocumentInlineNotice } from '../DocumentInlineNotice'
import { SendLinkButtons } from './SendLinkButtons'
import { hasCustomerLink, SEND_DOCUMENT_KINDS } from './send-kinds'

const NOT_SET_UP_LINK =
    'Email sending is not set up. Share the customer link or the PDF with your customer.'

// A kind with no customer page names its own party: a purchase order's vendor.
function notSetUpPdf(kind: SendKind): string {
    const party = DOCUMENT_PARTIES[SEND_DOCUMENT_KINDS[kind].party].label.toLowerCase()
    return `Email sending is not set up. Download the PDF and send it to your ${party}.`
}

interface SendNotSetUpProps {
    isVisible: boolean
    kind: SendKind
    documentId: string
    number: string
    token: string
    onClose: () => void
}

/**
 * The Send dialog when the server cannot send (spec §3.2 "Email is not set up"): no
 * field and no editor; the notice names the other two paths, the attachment line and the
 * two link buttons stand under it, and the footer holds only Close.
 */
export function SendNotSetUp({
    isVisible,
    kind,
    documentId,
    number,
    token,
    onClose,
}: SendNotSetUpProps) {
    if (!isVisible) return null
    const message = hasCustomerLink(kind) ? NOT_SET_UP_LINK : notSetUpPdf(kind)
    return (
        <>
            <Dialog.Body>
                <DocumentInlineNotice testID="document-send-not-set-up" message={message} />
                <SendLinkButtons
                    kind={kind}
                    documentId={documentId}
                    number={number}
                    token={token}
                />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={onClose} label="Close" testID="document-send-close" />
            </Dialog.Footer>
        </>
    )
}

import { Dialog } from '@tinycld/core/ui/dialog'
import type { SendKind } from '../../../lib/document-send'
import { DocumentInlineNotice } from '../DocumentInlineNotice'
import { SendLinkButtons } from './SendLinkButtons'
import { hasCustomerLink } from './send-kinds'

const NOT_SET_UP_LINK =
    'Email sending is not set up. Share the customer link or the PDF with your customer.'
const NOT_SET_UP_PDF = 'Email sending is not set up. Download the PDF and send it to your customer.'

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
    const message = hasCustomerLink(kind) ? NOT_SET_UP_LINK : NOT_SET_UP_PDF
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

import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { useCopyDocumentLink } from '../../../hooks/useCopyDocumentLink'
import { usePdfDownload } from '../../../hooks/usePdfDownload'
import type { SendKind } from '../../../lib/document-send'
import { attachmentLine, hasCustomerLink, SEND_DOCUMENT_KINDS } from './send-kinds'

const TAP = { minHeight: 44 }

interface SendLinkButtonsProps {
    kind: SendKind
    documentId: string
    number: string
    // The document's `public_token` ('' for a kind with no customer page).
    token: string
}

function CopyLinkButton({ kind, token }: { kind: 'invoice' | 'estimate'; token: string }) {
    const link = useCopyDocumentLink(kind, token)
    return (
        <Button
            testID="document-send-copy-link"
            variant="link"
            size="sm"
            style={TAP}
            onPress={link.copy}
            isDisabled={!link.isOffered}
        >
            <ButtonText>Copy customer link</ButtonText>
        </Button>
    )
}

function CopyLinkSlot({ kind, token }: { kind: SendKind; token: string }) {
    if (!hasCustomerLink(kind)) return null
    return <CopyLinkButton kind={kind} token={token} />
}

/**
 * "Attachment: <file name>" and the row of two link buttons of the Send dialog (spec
 * §3.2), drawn in the form and in the not-set-up notice: Copy customer link (an invoice
 * and an estimate only; useCopyDocumentLink, disabled while writes are not available) and
 * Download PDF (usePdfDownload, the kind's `pdfStem` as the fallback name).
 */
export function SendLinkButtons({ kind, documentId, number, token }: SendLinkButtonsProps) {
    const download = usePdfDownload()
    const doc = SEND_DOCUMENT_KINDS[kind]
    const attachment = attachmentLine(kind, number)
    const onDownload = () =>
        download.mutate({ kind: doc.key, id: documentId, fallbackName: doc.pdfStem(number) })
    return (
        <View className="gap-1">
            <Text testID="document-send-attachment" className="text-sm text-muted-foreground">
                {attachment}
            </Text>
            <View className="flex-row flex-wrap items-center gap-x-4">
                <CopyLinkSlot kind={kind} token={token} />
                <Button
                    testID="document-send-download"
                    variant="link"
                    size="sm"
                    style={TAP}
                    onPress={onDownload}
                    isDisabled={download.isPending}
                >
                    <ButtonText>Download PDF</ButtonText>
                </Button>
            </View>
        </View>
    )
}

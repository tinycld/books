import { Text } from 'react-native'
import { useDocumentSends } from '../../hooks/useDocumentSends'
import { documentSentLine, type SendKind } from '../../lib/document-send'

interface DocumentSentLineProps {
    kind: SendKind
    documentId: string
    testID: string
}

/**
 * "Sent Nov 20, 2026 to <address>", then " · sent 3 times" after more than one send (spec
 * §3.6), from the document's sends (useDocumentSends). A document never sent shows no line;
 * a failed read draws nothing (useDocumentSends logs it).
 */
export function DocumentSentLine({ kind, documentId, testID }: DocumentSentLineProps) {
    const { latest, count } = useDocumentSends(kind, documentId)
    if (!latest) return null
    const text = documentSentLine(latest, count)
    return (
        <Text testID={testID} className="text-sm text-muted-foreground">
            {text}
        </Text>
    )
}

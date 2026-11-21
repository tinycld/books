import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { useDocumentPdf } from '../../hooks/useDocumentPdf'
import { useDocumentKind } from './document-kind-context'
import { PdfPage } from './PdfPage'

const TAP = { minHeight: 44 }

interface UnsavedProps {
    isSaving: boolean
    onSave: () => void
}

// A new form has nothing printed yet: its save is the bar's, so it is idle offline and
// while a save runs. The text and the button's label are the kind's (Save draft, or a
// quote's Save).
function Unsaved({ isSaving, onSave }: UnsavedProps) {
    const { doc } = useDocumentKind()
    const writeState = useServerActionState({ isDisabled: isSaving })
    const testID = `${doc.testId}-pdf-unsaved`
    const saveLabel = doc.messages.pdfUnsavedSave
    return (
        <View testID={testID} className="items-center gap-3 py-10">
            <Text className="text-base font-medium text-foreground">{doc.messages.pdfUnsaved}</Text>
            <Button
                variant="outline"
                style={TAP}
                isDisabled={writeState.isDisabled}
                accessibilityHint={writeState.accessibilityHint}
                onPress={onSave}
            >
                <ButtonText>{saveLabel}</ButtonText>
            </Button>
        </View>
    )
}

function StaleNotice({ isVisible }: { isVisible: boolean }) {
    const { doc } = useDocumentKind()
    if (!isVisible) return null
    const testID = `${doc.testId}-pdf-stale`
    return (
        <View
            testID={testID}
            className="rounded-lg border border-border bg-surface-secondary px-3 py-2"
        >
            <Text className="text-sm text-muted-foreground">{doc.messages.pdfStale}</Text>
        </View>
    )
}

interface DocumentPdfViewProps {
    // The saved document; null on a new form that has written nothing.
    documentId: string | null
    // The document's `updated`: a save fetches the PDF again.
    version: string
    // The form has edits the PDF does not show.
    isDirty: boolean
    isSaving: boolean
    // The bar's save of a new form: Save draft on a posting kind, Save on a quote.
    onSave: () => void
}

/**
 * The PDF view tab: the server's PDF of the saved document in core PdfCanvasViewer. A
 * new form shows the kind's unsaved text with its save (Save draft, or a quote's Save);
 * a form with unsaved edits says the PDF shows the last saved version.
 */
export function DocumentPdfView({
    documentId,
    version,
    isDirty,
    isSaving,
    onSave,
}: DocumentPdfViewProps) {
    const { doc } = useDocumentKind()
    const pdf = useDocumentPdf(doc, documentId, version)
    if (documentId === null) return <Unsaved isSaving={isSaving} onSave={onSave} />
    const pageId = `${doc.testId}-pdf`
    return (
        <View className="gap-3">
            <StaleNotice isVisible={isDirty} />
            <PdfPage uri={pdf.uri} error={pdf.error} onRetry={pdf.retry} testId={pageId} />
        </View>
    )
}

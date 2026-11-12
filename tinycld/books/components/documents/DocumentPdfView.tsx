import { LoadingState } from '@tinycld/core/components/LoadingState'
import { PdfCanvasViewer } from '@tinycld/core/file-viewer/previews/PdfCanvasViewer'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { useDocumentPdf } from '../../hooks/useDocumentPdf'
import { useDocumentKind } from './document-kind-context'

const TAP = { minHeight: 44 }

// A letter-size page, as the reference draws it: the viewer scrolls inside it.
const PAGE = { width: '100%', maxWidth: 640, aspectRatio: 0.773 } as const
const PAGE_CLASS = 'self-center overflow-hidden rounded-md border border-border bg-background'

interface UnsavedProps {
    isSaving: boolean
    onSaveDraft: () => void
}

// A new form has nothing printed yet: its Save draft is the bar's, so it is idle
// offline and while a save runs.
function Unsaved({ isSaving, onSaveDraft }: UnsavedProps) {
    const { doc } = useDocumentKind()
    const writeState = useServerActionState({ isDisabled: isSaving })
    const testID = `${doc.testId}-pdf-unsaved`
    return (
        <View testID={testID} className="items-center gap-3 py-10">
            <Text className="text-base font-medium text-foreground">{doc.messages.pdfUnsaved}</Text>
            <Button
                variant="outline"
                style={TAP}
                isDisabled={writeState.isDisabled}
                accessibilityHint={writeState.accessibilityHint}
                onPress={onSaveDraft}
            >
                <ButtonText>Save draft</ButtonText>
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

interface PageProps {
    uri: string | null
    error: string | null
    onRetry: () => void
}

// The page frame holds the viewer, or what stands in its place after a refusal and
// while it loads (useDocumentPdf gives no uri and no error then).
function Page({ uri, error, onRetry }: PageProps) {
    const { doc } = useDocumentKind()
    const testId = doc.testId
    if (error !== null) {
        const errorId = `${testId}-pdf-error`
        const retryId = `${testId}-pdf-retry`
        const errorClass = `${PAGE_CLASS} items-center justify-center gap-3 p-6`
        return (
            <View testID={errorId} accessibilityRole="alert" className={errorClass} style={PAGE}>
                <Text className="text-center text-base font-medium text-foreground">{error}</Text>
                <Button testID={retryId} variant="outline" style={TAP} onPress={onRetry}>
                    <ButtonText>Retry</ButtonText>
                </Button>
            </View>
        )
    }
    if (uri === null) {
        const loadingId = `${testId}-pdf-loading`
        return (
            <View testID={loadingId} className={PAGE_CLASS} style={PAGE}>
                <LoadingState />
            </View>
        )
    }
    const pdfId = `${testId}-pdf`
    return (
        <View testID={pdfId} className={PAGE_CLASS} style={PAGE}>
            <PdfCanvasViewer url={uri} />
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
    onSaveDraft: () => void
}

/**
 * The PDF view tab: the server's PDF of the saved document in core PdfCanvasViewer. A
 * new form shows "Save a draft to see the PDF" with Save draft; a form with unsaved
 * edits says the PDF shows the last saved version.
 */
export function DocumentPdfView({
    documentId,
    version,
    isDirty,
    isSaving,
    onSaveDraft,
}: DocumentPdfViewProps) {
    const { doc } = useDocumentKind()
    const pdf = useDocumentPdf(doc, documentId, version)
    if (documentId === null) return <Unsaved isSaving={isSaving} onSaveDraft={onSaveDraft} />
    return (
        <View className="gap-3">
            <StaleNotice isVisible={isDirty} />
            <Page uri={pdf.uri} error={pdf.error} onRetry={pdf.retry} />
        </View>
    )
}

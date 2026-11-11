import { LoadingState } from '@tinycld/core/components/LoadingState'
import { PdfCanvasViewer } from '@tinycld/core/file-viewer/previews/PdfCanvasViewer'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { useInvoicePdf } from '../../hooks/useInvoicePdf'
import { INVOICE_MESSAGES } from '../../lib/invoice-messages'

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
    const writeState = useServerActionState({ isDisabled: isSaving })
    return (
        <View testID="invoice-pdf-unsaved" className="items-center gap-3 py-10">
            <Text className="text-base font-medium text-foreground">
                {INVOICE_MESSAGES.pdfUnsaved}
            </Text>
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
    if (!isVisible) return null
    return (
        <View
            testID="invoice-pdf-stale"
            className="rounded-lg border border-border bg-surface-secondary px-3 py-2"
        >
            <Text className="text-sm text-muted-foreground">{INVOICE_MESSAGES.pdfStale}</Text>
        </View>
    )
}

interface PageProps {
    uri: string | null
    error: string | null
    onRetry: () => void
}

// The page frame holds the viewer, or what stands in its place after a refusal and
// while it loads (useInvoicePdf gives no uri and no error then).
function Page({ uri, error, onRetry }: PageProps) {
    if (error !== null) {
        return (
            <View
                testID="invoice-pdf-error"
                accessibilityRole="alert"
                className={`${PAGE_CLASS} items-center justify-center gap-3 p-6`}
                style={PAGE}
            >
                <Text className="text-center text-base font-medium text-foreground">{error}</Text>
                <Button testID="invoice-pdf-retry" variant="outline" style={TAP} onPress={onRetry}>
                    <ButtonText>Retry</ButtonText>
                </Button>
            </View>
        )
    }
    if (uri === null) {
        return (
            <View testID="invoice-pdf-loading" className={PAGE_CLASS} style={PAGE}>
                <LoadingState />
            </View>
        )
    }
    return (
        <View testID="invoice-pdf" className={PAGE_CLASS} style={PAGE}>
            <PdfCanvasViewer url={uri} />
        </View>
    )
}

interface InvoicePdfViewProps {
    // The saved invoice; null on a new form that has written nothing.
    invoiceId: string | null
    // The invoice's `updated`: a save fetches the PDF again.
    version: string
    // The form has edits the PDF does not show.
    isDirty: boolean
    isSaving: boolean
    onSaveDraft: () => void
}

/**
 * The PDF view tab: the server's PDF of the saved invoice in core PdfCanvasViewer. A new
 * form shows "Save a draft to see the PDF" with Save draft; a form with unsaved edits
 * says the PDF shows the last saved version.
 */
export function InvoicePdfView({
    invoiceId,
    version,
    isDirty,
    isSaving,
    onSaveDraft,
}: InvoicePdfViewProps) {
    const pdf = useInvoicePdf(invoiceId, version)
    if (invoiceId === null) return <Unsaved isSaving={isSaving} onSaveDraft={onSaveDraft} />
    return (
        <View className="gap-3">
            <StaleNotice isVisible={isDirty} />
            <Page uri={pdf.uri} error={pdf.error} onRetry={pdf.retry} />
        </View>
    )
}

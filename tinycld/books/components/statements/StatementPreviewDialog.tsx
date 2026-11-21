import { Dialog } from '@tinycld/core/ui/dialog'
import type { useStatementPreview } from '../../hooks/useStatementPreview'
import { PdfPage } from '../documents/PdfPage'

type StatementPreview = ReturnType<typeof useStatementPreview>

/**
 * Preview of the create screen (statements spec §3.4): a core Dialog (a sheet on a phone)
 * titled "Preview" with the PDF's page view, Close and Download (core saveFile, through the
 * hook's `download`). It is open only while the hook holds a fetched file: while the PDF is
 * prepared the bar's Preview reads "Preparing…", and a refusal is the hook's error toast
 * with no dialog. So the page here always has its file, and its Retry only closes.
 */
export function StatementPreviewDialog({ preview }: { preview: StatementPreview }) {
    if (preview.uri === null) return null
    const download = () => void preview.download()
    return (
        <Dialog
            isOpen
            onClose={preview.close}
            title="Preview"
            size="xl"
            testID="statements-preview-dialog"
        >
            <Dialog.Body>
                <PdfPage
                    uri={preview.uri}
                    error={null}
                    onRetry={preview.close}
                    testId="statements-preview-page"
                />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton
                    onPress={preview.close}
                    label="Close"
                    testID="statements-preview-close"
                />
                <Dialog.ActionButton
                    label="Download"
                    onPress={download}
                    requiresServer={false}
                    testID="statements-preview-download"
                />
            </Dialog.Footer>
        </Dialog>
    )
}

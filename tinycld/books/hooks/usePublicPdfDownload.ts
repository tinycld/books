import { downloadFromUrl } from '@tinycld/core/file-viewer/file-url'
import { getResolvedAddress } from '@tinycld/core/lib/server-address'
import { pdfFileName, publicEstimatePdfPath, publicInvoicePdfPath } from '../lib/pdf-download'

const PUBLIC_PDF_PATHS = {
    estimate: publicEstimatePdfPath,
    invoice: publicInvoicePdfPath,
} as const

// Download PDF on a customer's page: the signed-out token route of the kind. Core's
// download returns at once (web: an anchor click; native: it reports its own failure), so
// there is no pending state here.
export function usePublicPdfDownload(
    kind: keyof typeof PUBLIC_PDF_PATHS,
    token: string,
    number: string
): () => void {
    return () => {
        const url = `${getResolvedAddress() ?? ''}${PUBLIC_PDF_PATHS[kind](token)}`
        downloadFromUrl(url, pdfFileName(`${kind}-${number}`), 'application/pdf')
    }
}

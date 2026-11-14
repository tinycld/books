import { downloadFromUrl } from '@tinycld/core/file-viewer/file-url'
import { getResolvedAddress } from '@tinycld/core/lib/server-address'
import { pdfFileName, publicEstimatePdfPath } from '../lib/pdf-download'

// Download PDF on the customer's page: the signed-out token route. Core's download
// returns at once (web: an anchor click; native: it reports its own failure), so there is
// no pending state here.
export function usePublicPdfDownload(token: string, number: string): () => void {
    return () => {
        const url = `${getResolvedAddress() ?? ''}${publicEstimatePdfPath(token)}`
        downloadFromUrl(url, pdfFileName(`estimate-${number}`), 'application/pdf')
    }
}

import { errorToString } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { notify } from '@tinycld/core/lib/notify'
import { saveFile } from '@tinycld/core/lib/save-file'
import { zipSync } from 'fflate'
import {
    BATCH_PDF_CONCURRENCY,
    batchPdfArchiveName,
    mapWithLimit,
    uniqueEntryNames,
} from '../lib/batch-pdf'
import type { DocumentListRow } from '../lib/document-list'
import { isExpectedRefusal, pdfDownloadName } from '../lib/pdf-download'
import { PDF_KINDS } from './useDocumentRowActions'
import type { useListSelection } from './useListSelection'
import { fetchPdf } from './usePdfDownload'

interface BatchPdfInput {
    rows: readonly DocumentListRow[]
    selection: ReturnType<typeof useListSelection>
}

// The ticked rows of a kind with a PDF, in the list's order.
function pdfRowsOf(rows: readonly DocumentListRow[], ticked: ReadonlySet<string>) {
    return rows.filter(row => ticked.has(row.id) && PDF_KINDS[row.kind] !== undefined)
}

// One document's PDF bytes and the name the server gives it.
async function fetchRowPdf(row: DocumentListRow) {
    const kind = PDF_KINDS[row.kind]
    if (kind === undefined) throw new Error(`${row.kind} has no PDF`)
    const { bytes, disposition } = await fetchPdf(kind.key, row.id)
    return { bytes, name: pdfDownloadName(disposition, kind.pdfStem(row.number)) }
}

// A number given to a kind's `pdfStem`, to cut the stem before it.
const NUMBER_MARK = '0'
const NUMBER_SUFFIX = `-${NUMBER_MARK}`

// The archive's stem: the first row's kind's PDF stem without the number, as the kind's
// `pdfStem` (sales-document-kinds) names a numbered PDF: "purchase-order-1004" gives
// "purchase-order", so the archive is "purchase-orders.zip".
function archiveStemOf(rows: readonly DocumentListRow[]): string {
    const first = rows[0]
    const kind = first ? PDF_KINDS[first.kind] : undefined
    if (kind === undefined) return 'document'
    const numbered = kind.pdfStem(NUMBER_MARK)
    if (!numbered.endsWith(NUMBER_SUFFIX)) return numbered
    return numbered.slice(0, -NUMBER_SUFFIX.length)
}

// One ticked document saves its own PDF; more save one zip of their PDFs. Both go through
// core saveFile: a Blob URL and an anchor click on web, a cache file and the share sheet
// on native.
async function saveRowPdfs(rows: readonly DocumentListRow[]) {
    const files = await mapWithLimit(rows, BATCH_PDF_CONCURRENCY, fetchRowPdf)
    const [only] = files
    if (files.length === 1 && only) {
        await saveFile({
            bytes: only.bytes,
            fileName: only.name,
            mimeType: 'application/pdf',
            uti: 'com.adobe.pdf',
        })
        return
    }
    const names = uniqueEntryNames(files.map(file => file.name))
    const entries = Object.fromEntries(files.map((file, index) => [names[index], file.bytes]))
    const archive = zipSync(entries, { level: 0 })
    await saveFile({
        bytes: new Uint8Array(archive),
        fileName: batchPdfArchiveName(archiveStemOf(rows)),
        mimeType: 'application/zip',
        uti: 'public.zip-archive',
    })
}

/**
 * The Batch actions menu's Download PDF (purchase order spec §3.9 "Batch actions", as the
 * estimates of the Sales lists): the ticked rows' PDFs, fetched with the bearer token as
 * the single Download PDF fetches them (fetchPdf), BATCH_PDF_CONCURRENCY at a time
 * (mapWithLimit), saved as one file, the PDF of one row or
 * a zip of them (stored, not compressed: a PDF is compressed already). Offered while a
 * ticked row has a PDF; it waits for a running download. A failure shows the single
 * download's toast, with the server's words.
 */
export function useBatchPdfDownload({ rows, selection }: BatchPdfInput) {
    const ticked = new Set(selection.ids)
    const pdfRows = pdfRowsOf(rows, ticked)
    const download = useMutation<void, Error, readonly DocumentListRow[]>({
        mutationKey: ['books', 'pdf', 'batch'],
        // Offline is a failure to show now, not a request to hold.
        networkMode: 'always',
        mutationFn: saveRowPdfs,
        onError: (error: unknown) => {
            if (isExpectedRefusal(error)) {
                log.info('books.pdf', 'batch download refused', { error: errorToString(error) })
            } else {
                log.error('books.pdf', error)
            }
            notify.emit({
                event: 'mutation.error',
                title: 'Could not create the PDF',
                body: errorToString(error),
                durationMs: 6000,
                data: { operation: 'books.pdf.batch', error: errorToString(error) },
            })
        },
    })
    return {
        isOffered: pdfRows.length > 0,
        isPending: download.isPending,
        start: () => download.mutate(pdfRows),
    }
}

export type BatchPdfDownload = ReturnType<typeof useBatchPdfDownload>

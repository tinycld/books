import { fileNameFromDisposition } from '@tinycld/core/lib/save-file'

// Pure parts of the PDF download (hooks/usePdfDownload.ts), shared by every
// screen that prints a Books document.

// The server route for a printed document (server/pdf_routes.go).
export function pdfPath(kind: string, id?: string): string {
    const base = `/api/books/pdf/${encodeURIComponent(kind)}`
    return id === undefined ? base : `${base}/${encodeURIComponent(id)}`
}

// The signed-out route of an estimate's PDF, found by its public token (server/pdf_routes.go).
export function publicEstimatePdfPath(token: string): string {
    return `/api/books/public/estimates/${encodeURIComponent(token)}/pdf`
}

// The signed-out route of an invoice's PDF, found by its public token (server/pdf_routes.go
// servePublicInvoicePDF).
export function publicInvoicePdfPath(token: string): string {
    return `/api/books/public/invoices/${encodeURIComponent(token)}/pdf`
}

// The saved file's name when the server's Content-Disposition gives none (see
// pdfDownloadName). A stem can come from a person (a customer, a number),
// so anything that could escape a directory is replaced. Letters and digits of
// every script stay, with their combining marks and the zero-width joiners that
// Persian and Indic spellings need, so a non-Latin name is not thrown away or
// split into pieces. The joiner is outside the class (a lookahead) because a
// joiner inside a class reads as an emoji sequence.
export function pdfFileName(stem: string): string {
    const safe = stem
        .replace(/(?:(?!\u200D)[^\p{L}\p{M}\p{N}\u200C._-])+/gu, '-')
        .replace(/^[-.]+|[-.]+$/g, '')
        .toLowerCase()
    return `${safe || 'document'}.pdf`
}

// The saved file's name: the server's, else the fallback stem made safe.
export function pdfDownloadName(disposition: string | null, fallbackStem: string): string {
    return fileNameFromDisposition(disposition) ?? pdfFileName(fallbackStem)
}

// A download the server refused, with its HTTP status.
export class PdfRefusalError extends Error {
    readonly status: number

    constructor(status: number, body: unknown) {
        super(pdfRefusalMessage(status, body))
        this.name = 'PdfRefusalError'
        this.status = status
    }
}

// An expected refusal (a 4xx the server chose to send: no access, not found)
// is logged as a warning; a network fault, a 5xx or a failed save is an error.
export function isExpectedRefusal(error: unknown): error is PdfRefusalError {
    return error instanceof PdfRefusalError && error.status >= 400 && error.status < 500
}

// What a refused download tells the person: the server's message (PocketBase
// error JSON) or the status.
export function pdfRefusalMessage(status: number, body: unknown): string {
    const message = (body as { message?: unknown } | null)?.message
    return typeof message === 'string' && message !== ''
        ? message
        : `The server answered ${status}.`
}

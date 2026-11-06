// Pure parts of the PDF download (hooks/usePdfDownload.ts), shared by every
// screen that prints a Books document.

// The server route for a printed document (server/pdf_routes.go).
export function pdfPath(kind: string, id?: string): string {
    const base = `/api/books/pdf/${encodeURIComponent(kind)}`
    return id === undefined ? base : `${base}/${encodeURIComponent(id)}`
}

// The saved file's name. A stem can come from a person (a customer, a number),
// so anything that could escape a directory is replaced. Letters and digits of
// every script stay, so a non-Latin name is not thrown away.
export function pdfFileName(stem: string): string {
    const safe = stem
        .replace(/[^\p{L}\p{N}._-]+/gu, '-')
        .replace(/^[-.]+|[-.]+$/g, '')
        .toLowerCase()
    return `${safe || 'document'}.pdf`
}

// What a refused download tells the person: the server's message (PocketBase
// error JSON) or the status.
export function pdfRefusalMessage(status: number, body: unknown): string {
    const message = (body as { message?: unknown } | null)?.message
    return typeof message === 'string' && message !== ''
        ? message
        : `The server answered ${status}.`
}

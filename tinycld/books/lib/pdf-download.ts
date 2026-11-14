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

// The file name the server gave in its Content-Disposition header (RFC 6266):
// the UTF-8 filename* when present and decodable, else filename. null when the
// header has no usable name, or the name could leave its directory.
export function fileNameFromDisposition(header: string | null): string | null {
    if (!header) return null
    const extended = /(?:^|;)\s*filename\*\s*=\s*([^;]+)/i.exec(header)?.[1]?.trim()
    const encoded = extended ? /^UTF-8'[^']*'(.+)$/i.exec(extended)?.[1] : undefined
    if (encoded) {
        const decoded = decodePercent(encoded)
        if (decoded !== null && isSafeFileName(decoded)) return decoded
    }
    const plain = /(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;\s]+))/i.exec(header)
    const name = plain?.[1]?.replace(/\\(.)/g, '$1') ?? plain?.[2]
    return name !== undefined && isSafeFileName(name) ? name : null
}

function decodePercent(text: string): string | null {
    try {
        return decodeURIComponent(text)
    } catch {
        return null
    }
}

// The server already cleans the name; this guards the native file write
// against a header from anything else.
function isSafeFileName(name: string): boolean {
    const trimmed = name.trim()
    // Compared by code point: biome refuses control characters in a regex.
    const hasControl = [...trimmed].some(ch => {
        const code = ch.codePointAt(0) ?? 0
        return code < 0x20 || code === 0x7f
    })
    return (
        trimmed !== '' &&
        trimmed !== '.' &&
        trimmed !== '..' &&
        !/[/\\]/.test(trimmed) &&
        !hasControl
    )
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

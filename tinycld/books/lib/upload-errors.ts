// The text a failed file upload shows: a bank file (banking) or an attachment (bills and
// expenses). Plain module, no React.

import { UploadError } from '@tinycld/core/file-viewer/upload-file'

export const UPLOAD_TRANSPORT_TEXT =
    'The file could not be uploaded. Check your connection and try again.'

const STATUS_ONLY_FAILURE = /^Upload failed \(\d+\)$/

// Core's upload rejects an error status with an UploadError that carries the server's
// message, or "Upload failed (<status>)" when the response has none. Only a 4xx refusal's
// own text helps the user; a 5xx message, an abort or a network failure is transport.
export function uploadErrorText(error: unknown): { text: string; isTransport: boolean } {
    const isRefusal =
        error instanceof UploadError &&
        error.status >= 400 &&
        error.status < 500 &&
        !STATUS_ONLY_FAILURE.test(error.message)
    if (isRefusal) return { text: error.message, isTransport: false }
    return { text: UPLOAD_TRANSPORT_TEXT, isTransport: true }
}

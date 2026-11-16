import { UploadError } from '@tinycld/core/file-viewer/upload-file'
import { describe, expect, it } from 'vitest'
import { FAILED_ATTACHMENTS } from '../tinycld/books/lib/attachments-fixture'
import * as bankConnections from '../tinycld/books/lib/bank-connections'
import { UPLOAD_TRANSPORT_TEXT, uploadErrorText } from '../tinycld/books/lib/upload-errors'

describe('uploadErrorText', () => {
    const transport = 'The file could not be uploaded. Check your connection and try again.'

    it('shows a server refusal as written', () => {
        const refusal = 'oct.csv was already uploaded to 1000 Business Checking on Nov 3, 2026.'
        expect(uploadErrorText(new UploadError(refusal, 400))).toEqual({
            text: refusal,
            isTransport: false,
        })
    })

    it('shows the transport text for a server fault, an abort, a network failure or a non-refusal', () => {
        const asTransport = { text: transport, isTransport: true }
        expect(UPLOAD_TRANSPORT_TEXT).toBe(transport)
        expect(uploadErrorText(new UploadError('Something went wrong.', 500))).toEqual(asTransport)
        expect(uploadErrorText(new UploadError('Upload failed (413)', 413))).toEqual(asTransport)
        expect(uploadErrorText(new DOMException('Aborted', 'AbortError'))).toEqual(asTransport)
        expect(uploadErrorText(new TypeError('Network request failed'))).toEqual(asTransport)
        expect(uploadErrorText(new Error('Unable to read the file'))).toEqual(asTransport)
        expect(uploadErrorText('x')).toEqual(asTransport)
    })

    // Attachments spec §3.9: core's storage quota refusal (a 413) shows on the row as the
    // server wrote it.
    it('shows the quota refusal of a 413 unchanged', () => {
        const quota =
            'Organization storage limit exceeded: 10.0 GB used of 10.0 GB limit, 0 B available but 60.0 KB requested.'
        expect(FAILED_ATTACHMENTS[0].state).toEqual({ kind: 'failed', message: quota })
        expect(uploadErrorText(new UploadError(quota, 413))).toEqual({
            text: quota,
            isTransport: false,
        })
    })

    // The texts moved here from lib/bank-connections.ts; no re-export is kept there.
    it('is no longer exported by lib/bank-connections.ts', () => {
        expect(Object.hasOwn(bankConnections, 'uploadErrorText')).toBe(false)
        expect(Object.hasOwn(bankConnections, 'UPLOAD_TRANSPORT_TEXT')).toBe(false)
    })
})

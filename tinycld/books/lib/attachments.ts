// The Attachments section's rules and texts (attachments spec §3): the client's file
// check, the row and section texts, the preview source of a stored row, who sees add and
// Remove, and the split of a document's attachment rows. Plain module, no React. The
// server says the size, type and limit refusals with the same words (server/
// attachments.go, drift-tested by tests/attachments.test.ts).

import type { FilePreviewSource } from '@tinycld/core/file-viewer/types'
import { formatBytes } from '@tinycld/core/lib/format-utils'
import type { BooksAttachments } from '../types'
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_DOCUMENT } from './attachments-fixture'
import type { SalesDocumentKind } from './sales-document-kinds'

export const ATTACHMENTS_COLLECTION = 'books_attachments'

// The extensions Books keeps, lower case, and the type each one is. The server checks
// the same list (attachmentExtensions in server/attachments.go).
export const ATTACHMENT_EXTENSIONS: Readonly<Record<string, string>> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    txt: 'text/plain',
    csv: 'text/csv',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

// The file field's allow-list (migration 2100000019, attachmentMimeTypes in Go). HTML,
// SVG and executables are not on it: a stored file opens from the app's own origin.
export const ATTACHMENT_MIME_TYPES: readonly string[] = [
    ...new Set(Object.values(ATTACHMENT_EXTENSIONS)),
]

// The image types PocketBase makes a thumbnail of. A HEIC or HEIF photo has no
// thumbnail (PocketBase would serve the full file, which a browser cannot draw), so its
// row shows the type icon.
const THUMBNAIL_MIME_TYPES: readonly string[] = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
]

export const ATTACHMENT_LIMIT_TEXT = 'Up to 20 MB each'
export const ATTACHMENTS_FAILED_TEXT = 'Attachments could not be loaded.'
export const NO_ATTACHMENTS_TEXT = 'No attachments'
export const NOT_SAVED_TEXT = 'Not saved yet'
export const DROP_PROMPT_WEB = 'Drag files here or choose them'
export const DROP_PROMPT_NATIVE = 'Add a photo or a file'
export const DROP_OVERLAY = 'Drop files to attach'

const TYPE_TEXT =
    'is not a file type Books keeps. Attach a PDF, an image, or an office or text file.'

function extensionMime(name: string): string {
    const dot = name.lastIndexOf('.')
    if (dot < 0) return ''
    return ATTACHMENT_EXTENSIONS[name.slice(dot + 1).toLowerCase()] ?? ''
}

// The file's type: the type it reports, or, when it reports none, the type of its
// name's extension ('' for an extension Books does not keep).
export function attachmentMimeOf(name: string, reportedType: string): string {
    return reportedType || extensionMime(name)
}

// Whether a row draws a thumbnail rather than the type icon.
export function isImageMime(mime: string): boolean {
    return THUMBNAIL_MIME_TYPES.includes(mime)
}

// A picked or dropped file (core PickedFile's name, type and size).
type CheckedFile = { name: string; type: string; size: number }

// The refusal of a file before it is added, or null: over 20 MB; a name without an
// allow-listed extension, or a reported type off the allow-list (the server checks the
// name and the bytes, so the client refuses what the server would); the 26th attachment
// of the document (`count` is the document's attachments before this one).
export function attachmentIssue(
    file: CheckedFile,
    kind: Pick<SalesDocumentKind, 'key'>,
    count: number
): string | null {
    if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name} is larger than 20 MB.`
    const isKeptType = file.type === '' || ATTACHMENT_MIME_TYPES.includes(file.type)
    if (extensionMime(file.name) === '' || !isKeptType) return `${file.name} ${TYPE_TEXT}`
    if (count >= MAX_ATTACHMENTS_PER_DOCUMENT) {
        return kind.key === 'expense'
            ? `An expense holds at most ${MAX_ATTACHMENTS_PER_DOCUMENT} attachments.`
            : `A bill holds at most ${MAX_ATTACHMENTS_PER_DOCUMENT} attachments.`
    }
    return null
}

export function attachmentsHeading(count: number): string {
    return count > 0 ? `Attachments (${count})` : 'Attachments'
}

// The UTC day a row was stored, as "Nov 14" (no year).
function uploadDay(created: string): string {
    return new Date(created.replace(' ', 'T')).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    })
}

// A stored row's second line: "1.2 MB · Ana Ruiz, Nov 14", or "1.2 MB · Nov 14" when
// the uploader is gone.
export function attachmentDetailText(row: {
    size: number
    created: string
    uploaderName?: string
}): string {
    const day = uploadDay(row.created)
    const who = row.uploaderName ? `${row.uploaderName}, ${day}` : day
    return `${formatBytes(row.size)} · ${who}`
}

export function pendingDetailText(size: number): string {
    return `${formatBytes(size)} · ${NOT_SAVED_TEXT}`
}

export function uploadingText(percent: number): string {
    return `Uploading… ${percent}%`
}

// The label of a correction's group of the original's files: "From Bill 1003".
export function fromDocumentText(noun: string, number: string): string {
    return `From ${noun} ${number}`
}

// A replaced original's note: its files moved to the correction, which keeps its number.
export function movedText(number: string): string {
    return `Moved to ${number} (edited)`
}

export function removeMessage(name: string, noun: string): { title: string; message: string } {
    return {
        title: `Remove ${name}?`,
        message: `It is deleted from this ${noun.toLowerCase()}.`,
    }
}

// The save notice when files did not upload: the document stays a draft.
export function attachmentsNotSavedText(noun: string, count: number): string {
    const files = count === 1 ? '1 attachment' : `${count} attachments`
    const them = count === 1 ? 'it' : 'them'
    return `The ${noun.toLowerCase()} was saved as a draft. ${files} did not upload. Save draft or Post tries ${them} again.`
}

type StoredFile = Pick<BooksAttachments, 'id' | 'file' | 'name' | 'size'>

// What core's preview, thumbnail and download read of a stored row. PocketBase keeps no
// type, so the type is the name's.
export function attachmentPreviewSource(row: StoredFile): FilePreviewSource {
    return {
        collectionId: ATTACHMENTS_COLLECTION,
        recordId: row.id,
        fileName: row.file,
        displayName: row.name,
        mimeType: attachmentMimeOf(row.name, ''),
        size: row.size,
    }
}

// Who sees add and Remove (spec §3.1, §3.3, §3.5): a writer on a document that is not
// void. While writes are unavailable both stay drawn and disabled, so the layout does
// not jump; add is disabled too while the attachments load, as the count is not known.
export function attachmentControls(state: {
    canWrite: boolean
    isVoid: boolean
    isDisabled: boolean
    isLoading: boolean
}) {
    const isWritable = state.canWrite && !state.isVoid
    return {
        showsAdd: isWritable,
        showsRemove: isWritable,
        isAddDisabled: state.isDisabled || state.isLoading,
        isRemoveDisabled: state.isDisabled,
    }
}

type SplitRow = Pick<BooksAttachments, 'bill' | 'expense' | 'field'>

// One query reads every attachment row of a document and of the one it replaces. The
// section lists only rows of no custom File field (`field` empty): this document's in
// `rows`, the replaced one's in `fromRows`, each in the order given. `allCount` counts
// every row of both, custom File field rows included: the 25-file limit counts them all.
export function splitAttachmentRows<T extends SplitRow>(
    all: readonly T[],
    recordId: string | undefined,
    replaces: string | undefined
): { rows: T[]; fromRows: T[]; allCount: number } {
    const parentOf = (row: T) => row.bill || row.expense
    const isOf = (row: T, id: string | undefined) => Boolean(id) && parentOf(row) === id
    const rows = all.filter(row => row.field === '' && isOf(row, recordId))
    const fromRows = all.filter(row => row.field === '' && isOf(row, replaces))
    const allCount = all.filter(row => isOf(row, recordId) || isOf(row, replaces)).length
    return { rows, fromRows, allCount }
}

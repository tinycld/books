// Shared stub of core `uploadRecordWithFile` for unit tests. A test file mocks
// `@tinycld/core/file-viewer/upload-file` to serve `uploadRecordWithFile` from here (as
// it serves `useStore` from the accounts form harness), so the code under test is the
// real one and only the network request is replaced. Each call is recorded; it answers
// with the stored row the server would return, or rejects with the error a test chose
// for that file name.

import type { PickedFile } from '@tinycld/core/file-viewer/picked-file'
import type { UploadRecordParams } from '@tinycld/core/file-viewer/upload-file'
import { vi } from 'vitest'

// The real module, not the mock that serves this stub: a plain import here waits on the
// mock's own factory, which waits on this module, and the test file never loads.
const { UploadError } = await vi.importActual<
    typeof import('@tinycld/core/file-viewer/upload-file')
>('@tinycld/core/file-viewer/upload-file')

export type UploadCall = {
    collection: string
    fields: Record<string, string>
    fileField: string
    name: string
}

const STORED_AT = '2026-11-14 10:00:00.000Z'

const state = {
    calls: [] as UploadCall[],
    // Refuses every upload of a file of this name with this error.
    refusals: new Map<string, unknown>(),
    // Uploads waiting for `stepUploads().next()`; null when uploads are not stepped.
    steps: null as (() => void)[] | null,
    counter: 0,
}

// Forgets the calls, the refusals and the steps of an earlier test.
export function resetUploads() {
    state.calls = []
    state.refusals = new Map()
    state.steps = null
}

export function uploadCalls(): UploadCall[] {
    return [...state.calls]
}

// Every later upload of a file named `name` rejects with `error`, until liftUploadRefusals.
export function refuseUpload(name: string, error: unknown) {
    state.refusals.set(name, error)
}

export function liftUploadRefusals() {
    state.refusals = new Map()
}

// A 4xx refusal as core's upload rejects it: an UploadError with the server's message.
export function uploadRefusal(message: string, status = 413) {
    return new UploadError(message, status)
}

// Makes every upload wait (after it is recorded) until `next()` lets exactly one answer,
// so a test can look at the world between any two requests.
export function stepUploads() {
    const waiting: (() => void)[] = []
    state.steps = waiting
    return {
        next: () => waiting.shift()?.(),
        stop: () => {
            state.steps = null
            for (const resume of waiting.splice(0)) resume()
        },
    }
}

// A picked file as core's picker gives it: on web the browser's File.
export function pickedFile(name: string, type: string, size: number): PickedFile {
    const file = new File([new Uint8Array(size)], name, { type })
    return { name, type, size, file }
}

function storedId(): string {
    state.counter += 1
    return `attstub${String(state.counter).padStart(8, '0')}`
}

// The row PocketBase answers a stored attachment with.
function storedRow(params: UploadRecordParams) {
    return {
        id: storedId(),
        collectionId: 'books_attachments',
        collectionName: params.collection,
        bill: params.fields.bill ?? '',
        expense: params.fields.expense ?? '',
        field: params.fields.field ?? '',
        file: params.file.name,
        thumbnail: '',
        name: params.file.name,
        size: params.file.size,
        uploaded_by: 'u1',
        created: STORED_AT,
        updated: STORED_AT,
    }
}

export async function uploadRecordWithFileStub(params: UploadRecordParams): Promise<unknown> {
    state.calls.push({
        collection: params.collection,
        fields: { ...params.fields },
        fileField: params.fileField ?? 'file',
        name: params.file.name,
    })
    const steps = state.steps
    if (steps) await new Promise<void>(resume => steps.push(resume))
    const refusal = state.refusals.get(params.file.name)
    if (refusal !== undefined) throw refusal
    params.onProgress?.(params.file.size, params.file.size)
    return storedRow(params)
}

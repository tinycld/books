import { notify } from '@tinycld/core/lib/notify/dispatcher'
import { z } from '@tinycld/core/ui/form'
import { ClientResponseError } from 'pocketbase'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { ColumnsParse } from '../tinycld/books/lib/record-columns'
import {
    applyPatch,
    columnsOrThrow,
    hasRecordChanges,
    insertRow,
    rowRefusalHandler,
    runLocked,
    saveRefusalHandler,
    startFailed,
} from '../tinycld/books/lib/record-save'
import { silenceLog } from './silence-log'

const logs = silenceLog()

// Core's toast dispatcher, not Books code: the spy only records what the handler emits.
function spyEmit() {
    const emit = vi.spyOn(notify, 'emit').mockImplementation(() => {})
    onTestFinished(() => emit.mockRestore())
    return emit
}

// A promise the test settles by hand, so a `start` can be held mid-press.
function deferred<T>() {
    let resolve: (value: T) => void = () => {}
    const promise = new Promise<T>(r => {
        resolve = r
    })
    return { promise, resolve }
}

describe('runLocked', () => {
    it('starts once when pressed twice while the first start is held', async () => {
        const lock = { current: false }
        const held = deferred<boolean>()
        const start = vi.fn(() => held.promise)

        const first = runLocked(lock, start)
        const second = runLocked(lock, start)
        held.resolve(true)
        await Promise.all([first, second])

        expect(start).toHaveBeenCalledTimes(1)
    })

    it('frees the lock when start did not start the mutation, so the next press starts again', async () => {
        const lock = { current: false }
        const start = vi.fn(async () => false)

        await runLocked(lock, start)

        expect(lock.current).toBe(false)
        await runLocked(lock, start)
        expect(start).toHaveBeenCalledTimes(2)
    })

    it('frees the lock when start throws', async () => {
        const lock = { current: false }
        const throwing = vi.fn(async (): Promise<boolean> => {
            throw new Error('validation blew up')
        })

        await runLocked(lock, throwing).catch(() => undefined)

        expect(lock.current).toBe(false)
        const next = vi.fn(async () => false)
        await runLocked(lock, next)
        expect(next).toHaveBeenCalledTimes(1)
    })

    it('keeps the lock taken when start started the mutation', async () => {
        const lock = { current: false }
        const start = vi.fn(async () => true)

        await runLocked(lock, start)

        expect(lock.current).toBe(true)
        await runLocked(lock, start)
        expect(start).toHaveBeenCalledTimes(1)
    })
})

const widgetSchema = z.strictObject({ name: z.string().optional() })
type WidgetColumns = z.infer<typeof widgetSchema>

function widgetParse(columns: Record<string, unknown>): ColumnsParse<WidgetColumns> {
    const parsed = widgetSchema.safeParse(columns)
    if (!parsed.success) return { success: false, error: parsed.error }
    return { success: true, columns: parsed.data }
}

describe('columnsOrThrow', () => {
    it('returns the columns of a passing parse', () => {
        expect(columnsOrThrow(widgetParse, { name: 'Sprocket' })).toEqual({ name: 'Sprocket' })
    })

    it('throws the ZodError of a failing parse', () => {
        const columns = { name: 'Sprocket', color: 'red' }
        const parsed = widgetParse(columns)
        if (parsed.success) throw new Error('the strict schema took an unknown column')

        let thrown: unknown
        try {
            columnsOrThrow(() => parsed, columns)
        } catch (error) {
            thrown = error
        }

        expect(thrown).toBe(parsed.error)
        expect(thrown).toBeInstanceOf(z.ZodError)
    })
})

describe('startFailed', () => {
    it('sets the client root error once and reports that the press did not start', () => {
        const form = { setError: vi.fn() }
        const error = new Error('split failed')

        const started = startFailed(error, form, {
            logContext: 'books.widgets',
            operation: 'create',
            clientSaveFailed: 'Books could not save this widget.',
        })

        expect(started).toBe(false)
        expect(form.setError).toHaveBeenCalledTimes(1)
        expect(form.setError).toHaveBeenCalledWith('root', {
            type: 'client',
            message: 'Books could not save this widget.',
        })
        expect(logs.error).toHaveBeenCalledWith(
            'books.widgets',
            error,
            expect.objectContaining({ operation: 'create' })
        )
    })
})

const RECORDS_URL = 'http://127.0.0.1:7100/api/collections/books_widgets/records'
const WIDGET_NOT_SAVED = 'The widget was not saved.'
const CLOSED = { notSavedTitle: WIDGET_NOT_SAVED, operation: 'books.widgets.save' }

function messageOnly(message: string) {
    return new ClientResponseError({
        url: RECORDS_URL,
        status: 400,
        response: { code: 400, message, data: {} },
    })
}

function fieldRefusal(field: string, message: string) {
    return new ClientResponseError({
        url: RECORDS_URL,
        status: 400,
        response: {
            code: 400,
            message: 'Failed to create record.',
            data: { [field]: { code: 'validation_not_unique', message } },
        },
    })
}

function networkError() {
    return new ClientResponseError({
        url: RECORDS_URL,
        status: 0,
        originalError: new TypeError('Failed to fetch'),
    })
}

function outlets() {
    return { form: { setError: vi.fn() }, hostOnError: vi.fn() }
}

describe('saveRefusalHandler', () => {
    it('puts a message-only refusal on the form root while the user still sees the form', () => {
        const emit = spyEmit()
        const message = 'This widget is locked.'
        const { form, hostOnError } = outlets()

        saveRefusalHandler(form, hostOnError, () => true, CLOSED)(messageOnly(message))

        expect(form.setError).toHaveBeenCalledWith('root', { type: 'server', message })
        expect(emit).not.toHaveBeenCalled()
        expect(hostOnError).not.toHaveBeenCalled()
    })

    it('turns a message-only refusal into one toast when the user left the form', () => {
        const emit = spyEmit()
        const message = 'This widget is locked.'
        const { form, hostOnError } = outlets()

        saveRefusalHandler(form, hostOnError, () => false, CLOSED)(messageOnly(message))

        expect(emit).toHaveBeenCalledTimes(1)
        expect(emit).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'mutation.error',
                title: WIDGET_NOT_SAVED,
                body: message,
                data: expect.objectContaining({ operation: 'books.widgets.save' }),
            })
        )
        expect(form.setError).not.toHaveBeenCalled()
    })

    it("toasts a field refusal's message when the user left the form", () => {
        const emit = spyEmit()
        const fieldMessage = 'A widget named “Acme” already exists.'
        const { form, hostOnError } = outlets()

        saveRefusalHandler(
            form,
            hostOnError,
            () => false,
            CLOSED
        )(fieldRefusal('name', fieldMessage))

        expect(emit).toHaveBeenCalledTimes(1)
        expect(emit).toHaveBeenCalledWith(
            expect.objectContaining({ title: WIDGET_NOT_SAVED, body: fieldMessage })
        )
        expect(form.setError).not.toHaveBeenCalled()
    })

    it('hands a network error to the host handler while the user sees the form', () => {
        const emit = spyEmit()
        const error = networkError()
        const { form, hostOnError } = outlets()

        saveRefusalHandler(form, hostOnError, () => true, CLOSED)(error)

        expect(hostOnError).toHaveBeenCalledTimes(1)
        expect(hostOnError).toHaveBeenCalledWith(error)
        expect(form.setError).not.toHaveBeenCalled()
        expect(emit).not.toHaveBeenCalled()
    })

    it('hands a network error to the host handler after the user left the form', () => {
        const emit = spyEmit()
        const error = networkError()
        const { form, hostOnError } = outlets()

        saveRefusalHandler(form, hostOnError, () => false, CLOSED)(error)

        expect(hostOnError).toHaveBeenCalledTimes(1)
        expect(hostOnError).toHaveBeenCalledWith(error)
        expect(form.setError).not.toHaveBeenCalled()
        expect(emit).not.toHaveBeenCalled()
    })
})

describe('insertRow', () => {
    it('stores the form id and the custom-field JSON, and a column the form left out empty', () => {
        const row = insertRow<{ name?: string; note?: string }>(
            { name: '', note: '', inactive: false },
            { name: 'A' },
            { id: 'abc', formId: 'form1', fields: { color: 'red' } }
        )

        expect(row).toStrictEqual({
            name: 'A',
            note: '',
            inactive: false,
            id: 'abc',
            form: 'form1',
            fields: { color: 'red' },
        })
    })
})

describe('applyPatch', () => {
    it('keeps the stored custom-field JSON when no custom field changed', () => {
        const draft = { name: 'A', note: 'n', fields: { color: 'red' } as unknown }

        applyPatch<{ name?: string; note?: string }>(draft, { name: 'B' }, {})

        expect(draft).toStrictEqual({ name: 'B', note: 'n', fields: { color: 'red' } })
    })

    it('replaces the custom-field JSON when a custom field changed', () => {
        const draft = { name: 'A', note: 'n', fields: { color: 'red' } as unknown }

        applyPatch<{ name?: string; note?: string }>(draft, { name: 'B' }, { color: 'blue' })

        expect(draft).toStrictEqual({ name: 'B', note: 'n', fields: { color: 'blue' } })
    })
})

describe('hasRecordChanges', () => {
    it('is false when no column and no custom field changed', () => {
        expect(hasRecordChanges({}, {})).toBe(false)
    })

    it('is true when a column changed', () => {
        expect(hasRecordChanges({ name: 'A' }, {})).toBe(true)
    })

    it('is true when only a custom field changed', () => {
        expect(hasRecordChanges({}, { color: 'red' })).toBe(true)
    })
})

describe('rowRefusalHandler', () => {
    it("puts a message-only refusal on the root under the row's label, not on the host", () => {
        const { form, hostOnError } = outlets()

        rowRefusalHandler(
            form,
            hostOnError,
            'Item 2'
        )(messageOnly('A bundle holds at most 50 items.'))

        expect(form.setError).toHaveBeenCalledTimes(1)
        expect(form.setError).toHaveBeenCalledWith('root', {
            type: 'server',
            message: 'Item 2: A bundle holds at most 50 items.',
        })
        expect(hostOnError).not.toHaveBeenCalled()
    })

    it("puts a row's field refusal on the root under the row's label, since no form field names one cell", () => {
        const { form, hostOnError } = outlets()

        rowRefusalHandler(
            form,
            hostOnError,
            'Item 2'
        )(fieldRefusal('quantity', 'Enter a quantity above 0 with at most 2 decimals.'))

        expect(form.setError).toHaveBeenCalledTimes(1)
        expect(form.setError).toHaveBeenCalledWith('root', {
            type: 'server',
            message: 'Item 2: Enter a quantity above 0 with at most 2 decimals.',
        })
        expect(hostOnError).not.toHaveBeenCalled()
    })

    it('hands a network error to the host handler and sets no root error', () => {
        const error = networkError()
        const { form, hostOnError } = outlets()

        rowRefusalHandler(form, hostOnError, 'Item 2')(error)

        expect(hostOnError).toHaveBeenCalledTimes(1)
        expect(hostOnError).toHaveBeenCalledWith(error)
        expect(form.setError).not.toHaveBeenCalled()
    })
})

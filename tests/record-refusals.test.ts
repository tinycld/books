import { notify } from '@tinycld/core/lib/notify/dispatcher'
import { ClientResponseError } from 'pocketbase'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
    closedRecordRefusalHandler,
    recordRefusalHandler,
} from '../tinycld/books/lib/record-refusals'

const RECORDS_URL = 'http://127.0.0.1:7100/api/collections/books_widgets/records'

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
            data: { [field]: { code: 'validation_invalid', message } },
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

// The handler's two outlets: the form's setError and the host's field-mapping onError.
function outlets() {
    return { form: { setError: vi.fn() }, hostOnError: vi.fn() }
}

// Core's toast dispatcher, not Books code: the spy only records what the handler emits.
function spyEmit() {
    const emit = vi.spyOn(notify, 'emit').mockImplementation(() => {})
    onTestFinished(() => emit.mockRestore())
    return emit
}

describe('recordRefusalHandler', () => {
    it('puts a refusal with a message and no field on the form root, not on the host', () => {
        const message = 'This widget is locked.'
        const { form, hostOnError } = outlets()

        recordRefusalHandler(form, hostOnError)(messageOnly(message))

        expect(form.setError).toHaveBeenCalledTimes(1)
        expect(form.setError).toHaveBeenCalledWith('root', { type: 'server', message })
        expect(hostOnError).not.toHaveBeenCalled()
    })

    it('hands a field refusal to the host, not to the form root', () => {
        const error = new ClientResponseError({
            url: RECORDS_URL,
            status: 400,
            response: {
                code: 400,
                message: 'Failed to create record.',
                data: {
                    name: {
                        code: 'validation_not_unique',
                        message: 'A widget named “Acme” already exists.',
                    },
                },
            },
        })
        const { form, hostOnError } = outlets()

        recordRefusalHandler(form, hostOnError)(error)

        expect(hostOnError).toHaveBeenCalledTimes(1)
        expect(hostOnError).toHaveBeenCalledWith(error)
        expect(form.setError.mock.calls.filter(([name]) => name === 'root')).toEqual([])
    })

    it('hands a network error with no response to the host', () => {
        const error = networkError()
        const { form, hostOnError } = outlets()

        recordRefusalHandler(form, hostOnError)(error)

        expect(hostOnError).toHaveBeenCalledTimes(1)
        expect(hostOnError).toHaveBeenCalledWith(error)
        expect(form.setError).not.toHaveBeenCalled()
    })

    // A form rule can hide a field whose value is still sent (the vendor form keeps the
    // 1099 details while tracking is off). A refusal on such a field has no cell to show
    // it, and the record form's summary shows root errors only.
    it('puts a field refusal on a rule-hidden field on the form root, not on the host', () => {
        const message = 'A tax ID has 9 digits.'
        const { form, hostOnError } = outlets()
        const hidden = () => new Set(['legal_name', 'tax_id_type', 'tax_id'])

        recordRefusalHandler(form, hostOnError, hidden)(fieldRefusal('tax_id', message))

        expect(form.setError).toHaveBeenCalledWith('root', { type: 'server', message })
        expect(form.setError.mock.calls.filter(([name]) => name === 'tax_id')).toEqual([])
        expect(hostOnError).not.toHaveBeenCalled()
    })

    it('hands the same field refusal to the host while its field is shown', () => {
        const error = fieldRefusal('tax_id', 'A tax ID has 9 digits.')
        const { form, hostOnError } = outlets()

        recordRefusalHandler(form, hostOnError, () => new Set(['notes']))(error)

        expect(hostOnError).toHaveBeenCalledTimes(1)
        expect(hostOnError).toHaveBeenCalledWith(error)
        expect(form.setError.mock.calls.filter(([name]) => name === 'root')).toEqual([])
    })
})

describe('closedRecordRefusalHandler', () => {
    it('toasts a message-only refusal under the title and operation given', () => {
        const emit = spyEmit()
        const message = 'This widget is locked.'
        const hostOnError = vi.fn()

        closedRecordRefusalHandler(
            hostOnError,
            'The widget was not saved.',
            'books.widgets.save'
        )(messageOnly(message))

        expect(emit).toHaveBeenCalledTimes(1)
        expect(emit).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'mutation.error',
                title: 'The widget was not saved.',
                body: message,
                data: expect.objectContaining({ operation: 'books.widgets.save' }),
            })
        )
        expect(hostOnError).not.toHaveBeenCalled()
    })

    it('hands a network error to the host handler', () => {
        const emit = spyEmit()
        const error = networkError()
        const hostOnError = vi.fn()

        closedRecordRefusalHandler(
            hostOnError,
            'The widget was not saved.',
            'books.widgets.save'
        )(error)

        expect(hostOnError).toHaveBeenCalledTimes(1)
        expect(hostOnError).toHaveBeenCalledWith(error)
        expect(emit).not.toHaveBeenCalled()
    })
})

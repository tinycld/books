import { notify } from '@tinycld/core/lib/notify/dispatcher'
import { ClientResponseError } from 'pocketbase'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
    closedRecordRefusalHandler,
    recordRefusalHandler,
    refusalMessage,
} from '../tinycld/books/lib/record-refusals'

const RECORDS_URL = 'http://127.0.0.1:7100/api/collections/books_widgets/records'

function messageOnly(message: string) {
    return new ClientResponseError({
        url: RECORDS_URL,
        status: 400,
        response: { code: 400, message, data: {} },
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

describe('refusalMessage', () => {
    it('is the message of a refusal with no field', () => {
        expect(refusalMessage(messageOnly('This widget is locked.'))).toBe('This widget is locked.')
    })

    it("is a refusal's field messages joined by one space when it names fields", () => {
        const error = new ClientResponseError({
            url: RECORDS_URL,
            status: 400,
            response: {
                code: 400,
                message: 'Failed to create record.',
                data: {
                    product: {
                        code: 'validation_invalid',
                        message: 'A bundle cannot contain another bundle.',
                    },
                    quantity: {
                        code: 'validation_invalid',
                        message: 'Enter a quantity above 0 with at most 2 decimals.',
                    },
                },
            },
        })

        expect(refusalMessage(error)).toBe(
            'A bundle cannot contain another bundle. Enter a quantity above 0 with at most 2 decimals.'
        )
    })

    it('is null for a network error, which has no message to show', () => {
        expect(refusalMessage(networkError())).toBeNull()
    })
})

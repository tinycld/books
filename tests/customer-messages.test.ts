import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ClientResponseError } from 'pocketbase'
import { describe, expect, it, vi } from 'vitest'
import {
    activeSubCustomersMessage,
    customerRefusalHandler,
    duplicateNameMessage,
    PARENT_LOCKED_MESSAGE,
} from '../tinycld/books/lib/customer-messages'

// Read inside the test, so a missing server file fails the drift test only.
function serverSource() {
    return readFileSync(join(__dirname, '..', 'server', 'customers.go'), 'utf8')
}

// Every refusal text of the plan's Decisions section, as the Go source holds
// it (%s / %d in place of the values).
const SERVER_MESSAGES = [
    'A customer named “%s” already exists here.',
    'The parent customer does not exist.',
    'A sub-customer cannot have sub-customers of its own.',
    'A customer cannot be its own parent.',
    'A customer with sub-customers cannot be a sub-customer.',
    'The parent customer is inactive.',
    'An address has only street, street line 2, city, state or region, postal code and country, each at most 200 characters.',
    'This customer has sub-customers, so it cannot be deleted.',
    'This customer has 1 active sub-customer.',
    'This customer has %d active sub-customers.',
    'Make the parent customer active first.',
]

describe('duplicateNameMessage', () => {
    it('names the duplicate', () => {
        expect(duplicateNameMessage('Acme')).toBe('A customer named “Acme” already exists here.')
    })
})

describe('activeSubCustomersMessage', () => {
    it('words one active sub-customer in the singular', () => {
        expect(activeSubCustomersMessage(1)).toBe('This customer has 1 active sub-customer.')
    })

    it('words several active sub-customers in the plural', () => {
        expect(activeSubCustomersMessage(2)).toBe('This customer has 2 active sub-customers.')
    })
})

describe('server drift', () => {
    it('server/customers.go holds every refusal text', () => {
        const source = serverSource()
        for (const message of SERVER_MESSAGES) {
            expect(source).toContain(message)
        }
    })

    it('the parent-locked help text is the server refusal', () => {
        expect(PARENT_LOCKED_MESSAGE).toBe(
            'A customer with sub-customers cannot be a sub-customer.'
        )
        expect(serverSource()).toContain(PARENT_LOCKED_MESSAGE)
    })
})

const RECORDS_URL = 'http://127.0.0.1:7100/api/collections/books_customers/records'

// The handler's two outlets: the form's setError and the host's field-mapping onError.
function outlets() {
    return { form: { setError: vi.fn() }, hostOnError: vi.fn() }
}

describe('customerRefusalHandler', () => {
    it('puts a refusal with a message and no field on the form root, not on the host', () => {
        const message = 'Make the parent customer active first.'
        const error = new ClientResponseError({
            url: RECORDS_URL,
            status: 400,
            response: { code: 400, message, data: {} },
        })
        const { form, hostOnError } = outlets()

        customerRefusalHandler(form, hostOnError)(error)

        expect(form.setError).toHaveBeenCalledTimes(1)
        expect(form.setError).toHaveBeenCalledWith('root', { type: 'server', message })
        expect(hostOnError).not.toHaveBeenCalled()
    })

    it('hands a display_name field refusal to the host, not to the form root', () => {
        const error = new ClientResponseError({
            url: RECORDS_URL,
            status: 400,
            response: {
                code: 400,
                message: 'Failed to create record.',
                data: {
                    display_name: {
                        code: 'validation_not_unique',
                        message: duplicateNameMessage('Acme'),
                    },
                },
            },
        })
        const { form, hostOnError } = outlets()

        customerRefusalHandler(form, hostOnError)(error)

        expect(hostOnError).toHaveBeenCalledTimes(1)
        expect(hostOnError).toHaveBeenCalledWith(error)
        expect(form.setError.mock.calls.filter(([name]) => name === 'root')).toEqual([])
    })

    it('hands a network error with no response to the host', () => {
        const error = new ClientResponseError({
            url: RECORDS_URL,
            status: 0,
            originalError: new TypeError('Failed to fetch'),
        })
        const { form, hostOnError } = outlets()

        customerRefusalHandler(form, hostOnError)(error)

        expect(hostOnError).toHaveBeenCalledTimes(1)
        expect(hostOnError).toHaveBeenCalledWith(error)
        expect(form.setError).not.toHaveBeenCalled()
    })
})

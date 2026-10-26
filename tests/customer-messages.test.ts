import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    activeSubCustomersMessage,
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

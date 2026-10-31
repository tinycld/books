import { errorToString } from '@tinycld/core/lib/errors'
import { describe, expect, it } from 'vitest'
import { SERVER_UNREACHED as RECORD_ACTIONS_UNREACHED } from '../tinycld/books/hooks/useRecordActions'
import { errorStatus, SERVER_UNREACHED, writeRefusalText } from '../tinycld/books/lib/refusal'

const UNREACHED = "Your change wasn't saved: the server could not be reached."

describe('errorStatus', () => {
    it("reads an error's numeric status, and none from an error without one", () => {
        expect(errorStatus({ status: 0 })).toBe(0)
        expect(errorStatus({ status: 400 })).toBe(400)
        expect(errorStatus(new Error('x'))).toBeUndefined()
    })
})

describe('writeRefusalText', () => {
    it('gives one fixed message for a write that got no answer (status 0)', () => {
        expect(writeRefusalText({ status: 0 })).toBe(UNREACHED)
    })

    it("gives a message-only refusal's message", () => {
        const refusal = {
            status: 400,
            response: { message: 'Books cannot change this account right now.', data: {} },
        }
        expect(writeRefusalText(refusal)).toBe('Books cannot change this account right now.')
    })

    it("gives errorToString's text for a refusal that names a field", () => {
        const refusal = {
            status: 400,
            response: {
                message: 'Failed to update record.',
                data: {
                    form_1099_box: { code: 'validation_invalid_value', message: 'Invalid value.' },
                },
            },
        }
        const text = writeRefusalText(refusal)
        expect(text).toBe(errorToString(refusal))
        expect(text).toContain('Invalid value.')
    })
})

describe('SERVER_UNREACHED', () => {
    it('is the fixed text, and useRecordActions re-exports the same string', () => {
        expect(SERVER_UNREACHED).toBe(UNREACHED)
        expect(RECORD_ACTIONS_UNREACHED).toBe(SERVER_UNREACHED)
    })
})

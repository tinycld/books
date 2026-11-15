import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ClientResponseError } from 'pocketbase'
import { describe, expect, it } from 'vitest'
import {
    acceptSchema,
    declineSchema,
    isNetworkFailure,
} from '../tinycld/books/lib/estimate-response-schema'

// Read inside the test, so a missing server file fails the drift test only.
function serverSource() {
    return readFileSync(join(__dirname, '..', 'server', 'estimate_responses.go'), 'utf8')
}

function messagesOf(result: { success: boolean; error?: { issues: { message: string }[] } }) {
    return result.error?.issues.map(issue => issue.message) ?? []
}

describe('acceptSchema', () => {
    it('refuses an empty or blank name with Enter your name.', () => {
        for (const name of ['', '   ']) {
            const result = acceptSchema.safeParse({ name })
            expect(result.success).toBe(false)
            expect(messagesOf(result)).toEqual(['Enter your name.'])
        }
    })

    it('refuses 201 characters and accepts 200', () => {
        const long = acceptSchema.safeParse({ name: 'a'.repeat(201) })
        expect(long.success).toBe(false)
        expect(messagesOf(long)).toEqual(['Use 200 characters or fewer.'])
        expect(acceptSchema.parse({ name: 'a'.repeat(200) })).toEqual({ name: 'a'.repeat(200) })
    })

    it('trims the name', () => {
        expect(acceptSchema.parse({ name: '  Dana  ' })).toEqual({ name: 'Dana' })
    })
})

describe('declineSchema', () => {
    it('parses an empty or blank reason to an empty string', () => {
        expect(declineSchema.parse({ reason: '' })).toEqual({ reason: '' })
        expect(declineSchema.parse({ reason: '   ' })).toEqual({ reason: '' })
    })

    it('keeps inner line breaks', () => {
        expect(declineSchema.parse({ reason: 'a\nb' })).toEqual({ reason: 'a\nb' })
    })

    it('refuses 1001 characters and accepts 1000', () => {
        const long = declineSchema.safeParse({ reason: 'r'.repeat(1001) })
        expect(long.success).toBe(false)
        expect(messagesOf(long)).toEqual(['Use 1000 characters or fewer.'])
        expect(declineSchema.parse({ reason: 'r'.repeat(1000) })).toEqual({
            reason: 'r'.repeat(1000),
        })
    })
})

describe('isNetworkFailure', () => {
    it('is true for a PocketBase error with status 0', () => {
        expect(isNetworkFailure(new ClientResponseError({ status: 0 }))).toBe(true)
    })

    it('is true for a TypeError (a failed fetch)', () => {
        expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true)
    })

    it('is false for a refusal with status 400', () => {
        const refusal = new ClientResponseError({
            status: 400,
            response: { message: 'This estimate is no longer waiting for an answer.', data: {} },
        })
        expect(isNetworkFailure(refusal)).toBe(false)
    })
})

describe('server drift', () => {
    it("the server's msgResponseNameRequired is the schema's name message", () => {
        const match = /msgResponseNameRequired\s*=\s*"([^"]*)"/.exec(serverSource())
        expect(match?.[1]).toBe('Enter your name.')
        const result = acceptSchema.safeParse({ name: '' })
        expect(messagesOf(result)).toEqual([match?.[1]])
    })
})

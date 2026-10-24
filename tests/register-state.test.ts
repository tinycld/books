import { describe, expect, it } from 'vitest'
import { newEntryVisible, registerViewState } from '../tinycld/books/lib/register-state'

const base = {
    isReady: true,
    isError: false,
    hasAccount: true,
    hasRows: true,
    hasAnyActivity: true,
}

describe('registerViewState', () => {
    it('is loading when not ready and there is no error', () => {
        expect(registerViewState({ ...base, isReady: false })).toBe('loading')
    })

    it('is error when isError is set, whatever else is true', () => {
        expect(registerViewState({ ...base, isError: true })).toBe('error')
        expect(registerViewState({ ...base, isError: true, isReady: false })).toBe('error')
        expect(registerViewState({ ...base, isError: true, hasAccount: false })).toBe('error')
        expect(registerViewState({ ...base, isError: true, hasRows: false })).toBe('error')
    })

    it('is not-found when ready without an account, also when rows exist', () => {
        expect(registerViewState({ ...base, hasAccount: false, hasRows: false })).toBe('not-found')
        expect(registerViewState({ ...base, hasAccount: false, hasRows: true })).toBe('not-found')
    })

    it('is empty with an account, no rows and no activity at all', () => {
        expect(registerViewState({ ...base, hasRows: false, hasAnyActivity: false })).toBe('empty')
    })

    it('is empty-range with no rows but activity elsewhere', () => {
        expect(registerViewState({ ...base, hasRows: false, hasAnyActivity: true })).toBe(
            'empty-range'
        )
    })

    it('is ready with rows even when hasAnyActivity is false', () => {
        expect(registerViewState({ ...base, hasRows: true, hasAnyActivity: false })).toBe('ready')
        expect(registerViewState(base)).toBe('ready')
    })
})

describe('newEntryVisible', () => {
    it.each([
        [true, true, true],
        [true, false, false],
        [false, true, false],
        [false, false, false],
    ])('canWrite=%s isAvailable=%s gives %s', (canWrite, isAvailable, expected) => {
        expect(newEntryVisible({ canWrite, isAvailable })).toBe(expected)
    })
})

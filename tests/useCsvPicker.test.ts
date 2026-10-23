// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCsvPicker } from '../tinycld/books/hooks/useCsvPicker'

function setup() {
    const chooseFile = vi.fn(async () => {})
    const hook = renderHook(() => useCsvPicker(chooseFile))
    return { hook, chooseFile }
}

function file(name: string, type: string) {
    return new File(['Name,Type\nCash,Bank'], name, { type })
}

describe('useCsvPicker onDrop', () => {
    it('a drop of two files says Drop one file and chooses nothing', () => {
        const { hook, chooseFile } = setup()
        act(() =>
            hook.result.current.onDrop([file('a.csv', 'text/csv'), file('b.csv', 'text/csv')])
        )
        expect(hook.result.current.pickError).toContain('Drop one file')
        expect(chooseFile).not.toHaveBeenCalled()
    })

    it('a drop of a non-CSV file says only comma-separated files are supported', () => {
        const { hook, chooseFile } = setup()
        act(() => hook.result.current.onDrop([file('notes.txt', 'text/plain')]))
        expect(hook.result.current.pickError).toContain('comma-separated')
        expect(chooseFile).not.toHaveBeenCalled()
    })

    it('a drop of one .csv file chooses it once', () => {
        const { hook, chooseFile } = setup()
        const dropped = file('accounts.csv', 'text/csv')
        act(() => hook.result.current.onDrop([dropped]))
        expect(chooseFile).toHaveBeenCalledTimes(1)
        expect(chooseFile).toHaveBeenCalledWith(dropped)
        expect(hook.result.current.pickError).toBeNull()
    })

    it.each([
        ['upper-case extension, no type', 'ACCOUNTS.CSV', ''],
        ['.csv name with a spreadsheet type', 'accounts.csv', 'application/vnd.ms-excel'],
        ['text/csv type with another name', 'accounts.dat', 'text/csv'],
    ])('accepts %s', (_label, name, type) => {
        const { hook, chooseFile } = setup()
        act(() => hook.result.current.onDrop([file(name, type)]))
        expect(chooseFile).toHaveBeenCalledTimes(1)
        expect(hook.result.current.pickError).toBeNull()
    })

    it('a good drop clears the error of an earlier bad one', () => {
        const { hook, chooseFile } = setup()
        act(() => hook.result.current.onDrop([file('notes.txt', 'text/plain')]))
        expect(hook.result.current.pickError).not.toBeNull()
        act(() => hook.result.current.onDrop([file('accounts.csv', 'text/csv')]))
        expect(hook.result.current.pickError).toBeNull()
        expect(chooseFile).toHaveBeenCalledTimes(1)
    })
})

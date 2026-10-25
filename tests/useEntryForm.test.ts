// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useEntryForm } from '../tinycld/books/hooks/useEntryForm'
import type { EntryFormValues } from '../tinycld/books/lib/entry-schema'

const line = (id: string, memo: string) => ({ id, account: '', debit: '', credit: '', memo })
const initial: EntryFormValues = {
    date: '2026-01-01',
    memo: '',
    autoReverseOn: '',
    lines: [line('saved-a', 'a'), line('saved-b', 'b')],
}

describe('useEntryForm', () => {
    it('keeps saved line ids through a swap, and keys rows apart from ids', () => {
        const hook = renderHook(() => useEntryForm({ initial }))
        expect(hook.result.current.fields.map(f => f.key)).not.toEqual(['saved-a', 'saved-b'])

        act(() => hook.result.current.moveLineDown(0))

        const lines = hook.result.current.form.getValues('lines')
        expect(lines.map(l => l.id)).toEqual(['saved-b', 'saved-a'])
        expect(lines.map(l => l.memo)).toEqual(['b', 'a'])
    })
})

describe('useEntryForm row keys', () => {
    const keys = (hook: { result: { current: { fields: { key: string }[] } } }) =>
        hook.result.current.fields.map(f => f.key)
    const ids = (hook: { result: { current: ReturnType<typeof useEntryForm> } }) =>
        hook.result.current.form.getValues('lines').map(l => l.id)

    it('gives every row a non-empty unique key that is never a saved id', () => {
        const hook = renderHook(() => useEntryForm({ initial }))
        const before = keys(hook)
        expect(before.every(k => typeof k === 'string' && k !== '')).toBe(true)
        expect(new Set(before).size).toBe(before.length)
        expect(before).not.toContain('saved-a')
        expect(before).not.toContain('saved-b')
    })

    it('moves the key with the row across moveLineDown', () => {
        const hook = renderHook(() => useEntryForm({ initial }))
        const [a, b] = keys(hook)
        act(() => hook.result.current.moveLineDown(0))
        expect(keys(hook)).toEqual([b, a])
    })

    it('keeps saved ids and gives appended lines an empty id across remove and add', () => {
        const hook = renderHook(() => useEntryForm({ initial }))
        const [, keyB] = keys(hook)
        act(() => hook.result.current.removeLine(0))
        expect(ids(hook)).toEqual(['saved-b'])
        expect(keys(hook)).toEqual([keyB])

        act(() => hook.result.current.addLine())
        act(() => hook.result.current.addLine())
        expect(ids(hook)).toEqual(['saved-b', '', ''])
        const after = keys(hook)
        expect(after[0]).toBe(keyB)
        expect(new Set(after).size).toBe(3)
        expect(after.every(k => k !== '')).toBe(true)
        expect(after).not.toContain('saved-b')
    })
})

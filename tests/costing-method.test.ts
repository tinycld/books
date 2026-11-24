import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
    COSTING_METHOD_KEYS,
    COSTING_METHOD_LABELS,
    COSTING_METHOD_LOCKED,
    COSTING_METHOD_NOTE,
    COSTING_METHOD_OPTIONS,
    costingMethodOf,
    costingMethodView,
} from '../tinycld/books/lib/costing-method'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('costing method', () => {
    it('offers FIFO first, then average cost', () => {
        expect(COSTING_METHOD_OPTIONS).toEqual([
            { value: 'fifo', label: 'FIFO (first in, first out)' },
            { value: 'average', label: 'Average cost' },
        ])
        expect(Object.keys(COSTING_METHOD_LABELS)).toEqual([...COSTING_METHOD_KEYS])
    })

    it("offers exactly the migration's methods", () => {
        const migration = read('../pb-migrations/2100000038_create_books_inventory.js')
        const values = /name: 'costing_method'[^\n]*values: \[([^\]]*)\]/.exec(migration)?.[1]
        expect(values?.replaceAll("'", '').split(', ')).toEqual([...COSTING_METHOD_KEYS])
    })

    it('reads a row with no method as FIFO', () => {
        expect(costingMethodOf({ costing_method: '' })).toBe('fifo')
        expect(costingMethodOf({ costing_method: 'fifo' })).toBe('fifo')
        expect(costingMethodOf({ costing_method: 'average' })).toBe('average')
    })

    it('says in the note until when the method can change', () => {
        expect(COSTING_METHOD_NOTE).toContain('until the first inventory transaction posts')
    })

    // server drift: the locked text is the server's refusal of a change.
    it("explains a locked method in the server's words", () => {
        const server = read('../server/settings.go')
        const text = /msgCostingMethodLocked\s+=\s+"([^"]+)"/.exec(server)?.[1]
        expect(text).toBe(COSTING_METHOD_LOCKED)
    })
})

describe('costingMethodView', () => {
    it('lets an admin edit the method until it is locked', () => {
        expect(costingMethodView({ costing_locked: false }, true)).toBe('edit')
    })

    it('shows the method alone to everyone else', () => {
        expect(costingMethodView({ costing_locked: false }, false)).toBe('read')
    })

    it('shows a locked method with its reason, to an admin too', () => {
        expect(costingMethodView({ costing_locked: true }, true)).toBe('locked')
        expect(costingMethodView({ costing_locked: true }, false)).toBe('locked')
    })
})

import { describe, expect, it } from 'vitest'
import { accountOptionList } from '../tinycld/books/lib/account-options'

type Row = Parameters<typeof accountOptionList>[0][number]

function row(fields: Partial<Row> & Pick<Row, 'id' | 'number' | 'name'>): Row {
    return { parent: '', inactive: false, type: 'asset', ...fields } as Row
}

describe('accountOptionList', () => {
    it('excludes an inactive account but keeps its name', () => {
        const { options, names } = accountOptionList([
            row({ id: 'a', number: '1000', name: 'Cash' }),
            row({ id: 'b', number: '1100', name: 'Old', inactive: true }),
        ])
        expect(options.map(o => o.value)).toEqual(['a'])
        expect(names.get('b')).toBe('1100 Old')
    })

    it('offers an active child of an inactive parent', () => {
        const { options } = accountOptionList([
            row({ id: 'p', number: '1000', name: 'Parent', inactive: true }),
            row({ id: 'c', number: '1010', name: 'Child', parent: 'p' }),
        ])
        expect(options.map(o => o.value)).toContain('c')
        expect(options.map(o => o.value)).not.toContain('p')
    })

    it('orders by number then name', () => {
        const { options } = accountOptionList([
            row({ id: 'c', number: '2000', name: 'B' }),
            row({ id: 'b', number: '1000', name: 'Z' }),
            row({ id: 'a', number: '1000', name: 'A' }),
        ])
        expect(options.map(o => o.value)).toEqual(['a', 'b', 'c'])
    })

    it('labels each account number name and indents it one level per depth below top', () => {
        const { options } = accountOptionList([
            row({ id: 'p', number: '1000', name: 'Top' }),
            row({ id: 'c', number: '1010', name: 'Mid', parent: 'p' }),
            row({ id: 'g', number: '1011', name: 'Low', parent: 'c' }),
        ])
        expect(options).toEqual([
            { value: 'p', label: '1000 Top', indent: 0 },
            { value: 'c', label: '1010 Mid', indent: 1 },
            { value: 'g', label: '1011 Low', indent: 2 },
        ])
    })

    it('names every account, including inactive ones', () => {
        const { names } = accountOptionList([
            row({ id: 'a', number: '1000', name: 'Cash' }),
            row({ id: 'b', number: '1100', name: 'Old', inactive: true }),
        ])
        expect([...names.keys()].sort()).toEqual(['a', 'b'])
    })
})

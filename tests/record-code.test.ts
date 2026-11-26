import { describe, expect, it } from 'vitest'
import {
    codeFirst,
    codeStem,
    matchesNameOrCode,
    recordCodeSchema,
    suggestedBase,
    suggestedCode,
} from '~/tinycld/books/lib/record-code'

describe('suggestedCode', () => {
    it('derives, falls back to the base, and skips taken codes', () => {
        expect(suggestedCode('Aspen Ridge Dental', 'customer', new Set())).toBe('ARD')
        expect(suggestedCode('Aspen Ridge Dental', 'customer', new Set(['ARD']))).toBe('ARD-2')
        expect(suggestedCode('李明', 'vendor', new Set())).toBe('VEND')
        expect(suggestedCode('', 'product', new Set(['ITEM']))).toBe('ITEM-2')
    })

    it('never suggests NEW', () => {
        expect(suggestedCode('New', 'customer', new Set())).toBe('CUST')
    })
})

describe('suggestedBase', () => {
    it('is the code before any suffix', () => {
        expect(suggestedBase('Aspen Ridge Dental', 'customer')).toBe('ARD')
        expect(suggestedBase('X', 'product')).toBe('ITEM')
    })
})

describe('codeStem', () => {
    it('cuts a long base to the part every suffixed variant keeps', () => {
        expect(codeStem('ARD')).toBe('ARD')
        expect(codeStem('VERYLONGSINGLEW')).toBe('VERYLONGSIN')
    })
})

describe('recordCodeSchema', () => {
    it('trims and uppercases, and accepts empty', () => {
        expect(recordCodeSchema.parse(' ard-2 ')).toBe('ARD-2')
        expect(recordCodeSchema.parse('')).toBe('')
    })

    it('refuses a bad shape and NEW', () => {
        expect(recordCodeSchema.safeParse('A').success).toBe(false)
        expect(recordCodeSchema.safeParse('-AB').success).toBe(false)
        expect(recordCodeSchema.safeParse('A B').success).toBe(false)
        expect(recordCodeSchema.safeParse('new').success).toBe(false)
    })
})

describe('matchesNameOrCode / codeFirst', () => {
    it('matches either, any case', () => {
        expect(matchesNameOrCode('ard', 'Aspen Ridge Dental', 'ARD')).toBe(true)
        expect(matchesNameOrCode('ridge', 'Aspen Ridge Dental', 'ARD')).toBe(true)
        expect(matchesNameOrCode('zzz', 'Aspen Ridge Dental', 'ARD')).toBe(false)
        expect(matchesNameOrCode('', 'Aspen', undefined)).toBe(true)
    })

    it('puts code-prefix matches first, keeping order otherwise', () => {
        const rows = [
            { name: 'Bard Hall', code: 'BH' },
            { name: 'Aspen Ridge Dental', code: 'ARD' },
            { name: 'Cardinal', code: 'CARDINAL' },
        ]
        expect(codeFirst(rows, 'ard', r => r.code).map(r => r.code)).toEqual([
            'ARD',
            'BH',
            'CARDINAL',
        ])
    })
})

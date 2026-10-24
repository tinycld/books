import { describe, expect, it } from 'vitest'
import {
    entryNumberText,
    entryStatusText,
    entryTypeText,
    reversesText,
} from '../tinycld/books/lib/entry-display'

describe('entryNumberText', () => {
    it('shows "Draft" for a draft with no number', () => {
        expect(entryNumberText({ number: '', status: 'draft' })).toBe('Draft')
    })

    it('shows the number of a posted entry', () => {
        expect(entryNumberText({ number: 'JE-1046', status: 'posted' })).toBe('JE-1046')
    })

    it('keeps the number of a void entry', () => {
        expect(entryNumberText({ number: 'JE-1046', status: 'void' })).toBe('JE-1046')
    })
})

describe('entryStatusText', () => {
    it('labels each status', () => {
        expect(entryStatusText('draft')).toBe('Draft')
        expect(entryStatusText('posted')).toBe('Posted')
        expect(entryStatusText('void')).toBe('Void')
    })
})

describe('entryTypeText', () => {
    it('labels the four origins', () => {
        expect(entryTypeText('manual')).toBe('Journal entry')
        expect(entryTypeText('reversal')).toBe('Reversal')
        expect(entryTypeText('void_reversal')).toBe('Void reversal')
        expect(entryTypeText('auto_reversal')).toBe('Auto reversal')
    })
})

describe('reversesText', () => {
    it('names the reversed entry', () => {
        expect(reversesText('JE-1046')).toBe('Reverses JE-1046')
    })

    it('falls back when the original entry is not loaded', () => {
        expect(reversesText(undefined)).toBe('Reverses …')
    })

    it('does not claim a number for an empty one', () => {
        expect(reversesText('')).toBe('Reverses …')
    })
})

import { describe, expect, it } from 'vitest'
import {
    documentKey,
    entryKey,
    hasOwnNumber,
    parseCodeKey,
    parseRecordKey,
} from '../tinycld/books/lib/record-key'

// The URL key of a Books record (lib/record-key.ts): a number for a numbered record that
// owns its number, else the record id.

const ID = 'bkrecord0000001'

describe('parseRecordKey', () => {
    it('reads digits as a sequence', () => {
        expect(parseRecordKey('1005')).toEqual({ kind: 'sequence', sequence: 1005 })
        expect(parseRecordKey('1')).toEqual({ kind: 'sequence', sequence: 1 })
        expect(parseRecordKey('12345678901234')).toEqual({
            kind: 'sequence',
            sequence: 12345678901234,
        })
    })

    it('reads a record id as an id', () => {
        expect(parseRecordKey(ID)).toEqual({ kind: 'id', id: ID })
    })

    it('reads 0, a leading zero and 15 digits as an id, not a sequence', () => {
        expect(parseRecordKey('0')).toEqual({ kind: 'id', id: '0' })
        expect(parseRecordKey('0123')).toEqual({ kind: 'id', id: '0123' })
        expect(parseRecordKey('123456789012345')).toEqual({ kind: 'id', id: '123456789012345' })
    })

    it('reads an empty key and a key with other characters as an id', () => {
        expect(parseRecordKey('')).toEqual({ kind: 'id', id: '' })
        expect(parseRecordKey('INV-1005')).toEqual({ kind: 'id', id: 'INV-1005' })
        expect(parseRecordKey('-5')).toEqual({ kind: 'id', id: '-5' })
    })
})

describe('documentKey', () => {
    it('is the sequence of a numbered document that no correction replaced', () => {
        expect(documentKey({ id: ID, sequence: 1005, replaced_by: '' })).toBe('1005')
        expect(documentKey({ id: ID, sequence: 1005 })).toBe('1005')
    })

    it('is the id of a draft, of a document with no sequence, and of a replaced one', () => {
        expect(documentKey({ id: ID, sequence: 0, replaced_by: '' })).toBe(ID)
        expect(documentKey({ id: ID })).toBe(ID)
        expect(documentKey({ id: ID, sequence: 1005, replaced_by: 'bkrecord0000002' })).toBe(ID)
    })
})

describe('entryKey and hasOwnNumber', () => {
    const posted = {
        id: ID,
        doc_type: 'journal',
        sequence: 12,
        status: 'posted',
        origin: 'manual',
    }

    it('is the sequence of a posted journal entry and of a posted manual transfer', () => {
        expect(hasOwnNumber(posted)).toBe(true)
        expect(entryKey(posted)).toBe('12')
        expect(entryKey({ ...posted, doc_type: 'transfer' })).toBe('12')
    })

    it('is the id of a void, a draft or an unnumbered entry', () => {
        expect(hasOwnNumber({ ...posted, status: 'void' })).toBe(false)
        expect(entryKey({ ...posted, status: 'void' })).toBe(ID)
        expect(entryKey({ ...posted, status: 'draft' })).toBe(ID)
        expect(hasOwnNumber({ ...posted, sequence: 0 })).toBe(false)
        expect(entryKey({ ...posted, sequence: 0 })).toBe(ID)
    })

    it('is the id of a void reversal, as its number is its entry’s', () => {
        expect(hasOwnNumber({ ...posted, origin: 'void_reversal' })).toBe(false)
        expect(entryKey({ ...posted, origin: 'void_reversal' })).toBe(ID)
        expect(entryKey({ ...posted, doc_type: 'transfer', origin: 'void_reversal' })).toBe(ID)
    })

    it('is the id of a transfer that is not manual and of an entry of another doc type', () => {
        expect(entryKey({ ...posted, doc_type: 'transfer', origin: 'reversal' })).toBe(ID)
        expect(entryKey({ ...posted, doc_type: 'inventory_adjustment' })).toBe(ID)
        // A document's entry owns its number, but opens on its document (entryHref).
        expect(hasOwnNumber({ ...posted, doc_type: 'invoice', origin: 'document' })).toBe(true)
        expect(entryKey({ ...posted, doc_type: 'invoice', origin: 'document' })).toBe(ID)
    })
})

describe('parseCodeKey', () => {
    it('reads a record id as an id', () => {
        expect(parseCodeKey('abc123def456ghi')).toEqual({ kind: 'id', id: 'abc123def456ghi' })
    })

    it('reads anything else as a code, upper-cased', () => {
        expect(parseCodeKey('ARD')).toEqual({ kind: 'code', code: 'ARD' })
        expect(parseCodeKey('ard-2')).toEqual({ kind: 'code', code: 'ARD-2' })
        expect(parseCodeKey('VERYLONGSINGLEW')).toEqual({ kind: 'code', code: 'VERYLONGSINGLEW' })
    })
})

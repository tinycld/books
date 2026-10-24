import { describe, expect, it } from 'vitest'
import { checkCsvLimits, csvLimits, parseCsv } from '../tinycld/books/lib/csv'

describe('parseCsv', () => {
    it('splits a header and rows on commas', () => {
        expect(parseCsv('a,b,c\n1,2,3\n4,5,6')).toEqual({
            header: ['a', 'b', 'c'],
            rows: [
                ['1', '2', '3'],
                ['4', '5', '6'],
            ],
            error: null,
        })
    })

    it('keeps commas inside quoted fields', () => {
        expect(parseCsv('name,note\n"Smith, Jo",x').rows).toEqual([['Smith, Jo', 'x']])
    })

    it('turns a doubled quote inside a quoted field into one quote', () => {
        expect(parseCsv('name\n"say ""hi"""').rows).toEqual([['say "hi"']])
    })

    it('reads CRLF and LF line ends the same way', () => {
        const lf = parseCsv('a,b\n1,2\n3,4\n')
        const crlf = parseCsv('a,b\r\n1,2\r\n3,4\r\n')
        expect(crlf).toEqual(lf)
        expect(crlf.rows).toEqual([
            ['1', '2'],
            ['3', '4'],
        ])
    })

    it('strips a leading BOM from the first header cell', () => {
        expect(parseCsv('﻿name,type\nCash,bank').header).toEqual(['name', 'type'])
    })

    it('keeps a newline inside a quoted field in one cell', () => {
        expect(parseCsv('name,note\n"line1\nline2",x\nnext,y').rows).toEqual([
            ['line1\nline2', 'x'],
            ['next', 'y'],
        ])
    })

    it('drops blank trailing lines', () => {
        expect(parseCsv('a,b\n1,2\n\n\n').rows).toEqual([['1', '2']])
        expect(parseCsv('a,b\r\n1,2\r\n\r\n').rows).toEqual([['1', '2']])
    })

    it('uses the first non-empty record as the header', () => {
        expect(parseCsv('\n\na,b\n1,2')).toEqual({
            header: ['a', 'b'],
            rows: [['1', '2']],
            error: null,
        })
    })

    it('keeps empty cells, including a trailing one', () => {
        expect(parseCsv('a,b,c\n1,,3\n4,5,').rows).toEqual([
            ['1', '', '3'],
            ['4', '5', ''],
        ])
    })

    it('reads a last line with no line end', () => {
        expect(parseCsv('a\n1').rows).toEqual([['1']])
    })

    it('returns an empty header for empty text', () => {
        expect(parseCsv('')).toEqual({ header: [], rows: [], error: null })
    })
})

describe('parseCsv: errors and blank records', () => {
    it('reports an unterminated quote and keeps the rows parsed before it', () => {
        const result = parseCsv('a,b\n1,2\n"3,4')
        expect(result.header).toEqual(['a', 'b'])
        expect(result.rows[0]).toEqual(['1', '2'])
        expect(result.error).toEqual(expect.any(String))
        expect(result.error).not.toBe('')
        expect(result.error).toMatch(/quote/i)
    })

    it('has error null for a clean file', () => {
        expect(parseCsv('a,b\n1,2\n').error).toBeNull()
        expect(parseCsv('a\n"x"\n').error).toBeNull()
    })

    it('drops records whose cells are all empty after trim and none quoted, anywhere', () => {
        const result = parseCsv('a,b,c\n1,2,3\n,,,\n4,5,6\n  ,  ,\n7,8,9\n  ,  ')
        expect(result.rows).toEqual([
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
        ])
        expect(result.error).toBeNull()
    })

    it('does not count dropped records toward the row limit', () => {
        const lines = ['a,b']
        for (let i = 0; i < 2000; i++) lines.push(`${i},x`)
        for (let i = 0; i < 50; i++) lines.push(',')
        const { rows } = parseCsv(lines.join('\n'))
        expect(rows).toHaveLength(2000)
        expect(checkCsvLimits(undefined, rows.length)).toBeNull()
    })

    it('keeps a record that is a lone quoted empty cell', () => {
        expect(parseCsv('a\n""\n').rows).toEqual([['']])
    })

    it('keeps a record with a quoted empty cell among empty ones', () => {
        expect(parseCsv('a,b\n"",\n').rows).toEqual([['', '']])
    })
})

describe('checkCsvLimits', () => {
    it('exposes the limits', () => {
        expect(csvLimits).toEqual({ maxRows: 2000, maxBytes: 1048576 })
    })

    it('returns a message when the file is too large', () => {
        expect(checkCsvLimits(1048577, 1)).toEqual(expect.any(String))
        expect(checkCsvLimits(1048577, 1)).not.toBe('')
    })

    it('returns a message when there are too many rows', () => {
        expect(checkCsvLimits(10, 2001)).toEqual(expect.any(String))
        expect(checkCsvLimits(10, 2001)).not.toBe('')
    })

    it('returns null at the exact limits', () => {
        expect(checkCsvLimits(1048576, 2000)).toBeNull()
    })

    it('skips the byte check when the size is unknown', () => {
        expect(checkCsvLimits(undefined, 5)).toBeNull()
        expect(checkCsvLimits(undefined, 2001)).toEqual(expect.any(String))
    })
})

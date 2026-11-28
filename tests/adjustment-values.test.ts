import { describe, expect, it } from 'vitest'
import {
    adjustmentStartValues,
    adjustmentValuesFrom,
    changeFromNew,
    dropBlankLines,
    emptyAdjustmentLine,
    goesBelowZero,
    newFromChange,
    valueMode,
} from '../tinycld/books/lib/adjustment-values'

// The adjustment form's values and its quantity arithmetic (inventory-adjust spec §3.3):
// New quantity and Change are linked (Change = New quantity − On hand, New quantity = On
// hand + Change), all in hundredths so a decimal sum is exact; Value change takes its
// meaning from Change; a reopened draft's New quantity is the current On hand + the stored
// Change. The form keeps every line field as the text its input shows.

describe('changeFromNew and newFromChange', () => {
    it('gives Change = New quantity − On hand', () => {
        expect(changeFromNew(10, 7)).toBe(-3)
        expect(changeFromNew(10, 12.5)).toBe(2.5)
    })

    it('gives New quantity = On hand + Change, exact in hundredths', () => {
        expect(newFromChange(0.1, 0.2)).toBe(0.3)
        expect(newFromChange(10, -3)).toBe(7)
    })

    it('gives the change of 0.3 − 0.1 exactly', () => {
        expect(changeFromNew(0.1, 0.3)).toBe(0.2)
    })
})

describe('valueMode', () => {
    it('is the cost of the added quantity for an increase', () => {
        expect(valueMode(1)).toBe('cost')
    })

    it('is at cost for a decrease', () => {
        expect(valueMode(-1)).toBe('at-cost')
    })

    it('is a revaluation when the quantity does not change', () => {
        expect(valueMode(0)).toBe('revalue')
    })
})

describe('goesBelowZero', () => {
    it('is true when the change takes the quantity below zero', () => {
        expect(goesBelowZero(10, -11)).toBe(true)
    })

    it('is false when the change takes the quantity to zero', () => {
        expect(goesBelowZero(10, -10)).toBe(false)
    })
})

describe('emptyAdjustmentLine', () => {
    it('is a line with its own row id and no item, bin, quantity or value', () => {
        const line = emptyAdjustmentLine()
        expect(line).toMatchObject({ product: '', bin: '', newQuantity: '', change: '', value: '' })
        expect(line.id).toHaveLength(15)
        expect(emptyAdjustmentLine().id).not.toBe(line.id)
    })
})

describe('adjustmentValuesFrom', () => {
    const record = { date: '2026-11-20 00:00:00.000Z', account: 'acctshrink00001', memo: 'Count' }

    it('gives a reopened draft the current On hand + the stored Change as New quantity', () => {
        const onHandOf = (product: string, bin: string) =>
            product === 'prodlabels00001' && bin === 'binaisle300001'
                ? { quantity: 10, total: 40 }
                : { quantity: 0, total: 0 }
        const values = adjustmentValuesFrom(
            record,
            [
                {
                    id: 'ialnline0000001',
                    product: 'prodlabels00001',
                    bin: 'binaisle300001',
                    quantity: 2,
                    value: 1_200,
                    value_given: true,
                    position: 0,
                },
            ],
            onHandOf
        )
        expect(values.date).toBe('2026-11-20')
        expect(values.account).toBe('acctshrink00001')
        expect(values.memo).toBe('Count')
        expect(values.lines).toEqual([
            {
                id: 'ialnline0000001',
                product: 'prodlabels00001',
                bin: 'binaisle300001',
                newQuantity: '12',
                change: '2',
                value: '12.00',
            },
        ])
    })

    it('reads the New quantity from the On hand now, not from when the draft was saved', () => {
        const line = {
            id: 'ialnline0000001',
            product: 'prodlabels00001',
            bin: '',
            quantity: -0.25,
            value: 0,
            value_given: false,
            position: 0,
        }
        const values = adjustmentValuesFrom(record, [line], () => ({ quantity: 0.4, total: 0.4 }))
        expect(values.lines[0]?.newQuantity).toBe('0.15')
        expect(values.lines[0]?.change).toBe('-0.25')
    })

    it('keeps the stored lines in position order', () => {
        const stored = { bin: '', quantity: 1, value: 0, value_given: false }
        const lines = [
            { id: 'ialnline0000002', product: 'p2', position: 1, ...stored },
            { id: 'ialnline0000001', product: 'p1', position: 0, ...stored },
        ]
        const values = adjustmentValuesFrom(record, lines, () => ({ quantity: 0, total: 0 }))
        expect(values.lines.map(line => line.id)).toEqual(['ialnline0000001', 'ialnline0000002'])
    })

    // Spec §3.3: an increase's Value change is "the cost of the added quantity, 0 or more.
    // Empty takes the last known cost". The stored line keeps which one was typed.
    it('shows a typed Value change of 0 as 0.00, and an empty one as empty', () => {
        const increase = { product: 'p1', bin: '', quantity: 5, value: 0, position: 0 }
        const onHand = () => ({ quantity: 10, total: 10 })
        const given = adjustmentValuesFrom(
            record,
            [{ id: 'ialnline0000001', ...increase, value_given: true }],
            onHand
        )
        const empty = adjustmentValuesFrom(
            record,
            [{ id: 'ialnline0000001', ...increase, value_given: false }],
            onHand
        )
        expect(given.lines[0]?.value).toBe('0.00')
        expect(empty.lines[0]?.value).toBe('')
    })
})

// Spec §3.1: "`?copy=<id>` starts it from another adjustment: account, memo and lines
// (item, bin, change, value change); today's date." A correction (`?replaces=<id>`) keeps
// the date too. Both are new adjustments (§4 Writes: "A correction inserts with
// `replaces`."), so no line keeps the source's row id: the line plan inserts every line.
describe('adjustmentStartValues', () => {
    const source = { date: '2026-11-20 00:00:00.000Z', account: 'acctshrink00001', memo: 'Count' }
    const today = '2026-11-27'
    const storedLines = [
        {
            id: 'ialnline0000002',
            product: 'prodtape000001',
            bin: '',
            quantity: 1,
            value: 500,
            value_given: true,
            position: 1,
        },
        {
            id: 'ialnline0000001',
            product: 'prodlabels00001',
            bin: 'binaisle300001',
            quantity: -2,
            value: 0,
            value_given: false,
            position: 0,
        },
    ]
    const onHandOf = (product: string, bin: string) =>
        product === 'prodlabels00001' && bin === 'binaisle300001'
            ? { quantity: 10, total: 10 }
            : { quantity: 4, total: 4 }
    const keptLines = [
        {
            product: 'prodlabels00001',
            bin: 'binaisle300001',
            newQuantity: '8',
            change: '-2',
            value: '',
        },
        { product: 'prodtape000001', bin: '', newQuantity: '5', change: '1', value: '5.00' },
    ]

    it('keeps the stored date, account, memo and lines for a correction', () => {
        const values = adjustmentStartValues('replaces', source, storedLines, onHandOf, today)
        expect(values.date).toBe('2026-11-20')
        expect(values.account).toBe('acctshrink00001')
        expect(values.memo).toBe('Count')
        expect(values.lines).toMatchObject(keptLines)
        expect(values.lines).toHaveLength(2)
    })

    it('dates a copy today and keeps the account, memo and lines', () => {
        const values = adjustmentStartValues('copy', source, storedLines, onHandOf, today)
        expect(values.date).toBe('2026-11-27')
        expect(values.account).toBe('acctshrink00001')
        expect(values.memo).toBe('Count')
        expect(values.lines).toMatchObject(keptLines)
        expect(values.lines).toHaveLength(2)
    })

    it.each(['copy', 'replaces'] as const)('gives a %s new line ids, not the stored ones', mode => {
        const values = adjustmentStartValues(mode, source, storedLines, onHandOf, today)
        const storedIds = storedLines.map(line => line.id)
        const ids = values.lines.map(line => line.id)
        for (const id of ids) {
            expect(storedIds).not.toContain(id)
            expect(id).toHaveLength(15)
        }
        expect(new Set(ids).size).toBe(ids.length)
    })
})

describe('dropBlankLines', () => {
    const blank = {
        id: 'ialnblank000001',
        product: '',
        bin: '',
        newQuantity: '',
        change: '',
        value: '',
    }

    it('drops a line with no item, no change and no value', () => {
        expect(dropBlankLines([blank, { ...blank, id: 'ialnblank000002' }])).toEqual([])
    })

    it('keeps a line that has an item, a change or a value', () => {
        const item = { ...blank, id: 'ialnitem0000001', product: 'prodlabels00001' }
        const change = { ...blank, id: 'ialnchange00001', change: '-2' }
        const value = { ...blank, id: 'ialnvalue000001', value: '5.00' }
        expect(dropBlankLines([blank, item, change, value])).toEqual([item, change, value])
    })
})

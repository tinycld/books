import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    DEPOSIT_IDS,
    depositItemsOf,
    UNDEPOSITED_ITEMS,
    UNDEPOSITED_LINE_IDS,
} from '../tinycld/books/lib/bank-deposit-fixture'
import {
    canAddLine,
    clearSelection,
    depositEntryOf,
    depositedOffer,
    depositFigureText,
    depositLineCents,
    depositReadItems,
    depositTotals,
    inDepositText,
    isEveryItemTicked,
    itemAmountText,
    itemLabel,
    itemLineOfRefusal,
    itemPaymentText,
    itemsCountText,
    lineRefusalPath,
    mergeItems,
    partyNameOf,
    selectAll,
    showsItemAccount,
    sortItems,
    staleItemText,
    toggleItem,
    undepositedListState,
} from '../tinycld/books/lib/deposit'
import { DOC_TYPES } from '../tinycld/books/lib/doc-types'
import { maxStoredAmount } from '../tinycld/books/lib/money-text'

// The deposit's pure read helpers (bank deposit spec §3.4, §3.6, §3.8): the three totals in
// integer cents, the item's Transaction label and Payment text, an amount with money out as
// "−$20.00" (U+2212), and the Received from name. The noun cases are shared with the Go
// entry nouns (server/testdata/deposit_cases.json).

type NounCase = { docType: string; number: string; label: string }

const CASES: { nouns: NounCase[] } = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'deposit_cases.json'), 'utf8')
)

const MINUS = '−'

function payment(fields: {
    doc_type: string
    payment_method?: string
    reference_no?: string
    memo?: string
}) {
    return { payment_method: '', reference_no: '', ...fields }
}

describe('depositTotals', () => {
    it('adds the items with money in and money out, and the other funds lines with a negative fee', () => {
        const items = [{ amount: 51_250 }, { amount: 8_640 }, { amount: -2_000 }]
        const lines = [{ amount: 1_240 }, { amount: -1_500 }]
        expect(depositTotals(items, lines)).toEqual({
            itemsTotal: 57_890,
            linesTotal: -260,
            total: 57_630,
        })
    })

    it('is zero for each total with no item and no line', () => {
        expect(depositTotals([], [])).toEqual({ itemsTotal: 0, linesTotal: 0, total: 0 })
    })

    it('totals lines alone, and items alone', () => {
        expect(depositTotals([], [{ amount: 1_240 }])).toEqual({
            itemsTotal: 0,
            linesTotal: 1_240,
            total: 1_240,
        })
        expect(depositTotals([{ amount: 18_000 }], [])).toEqual({
            itemsTotal: 18_000,
            linesTotal: 0,
            total: 18_000,
        })
    })
})

describe('itemLabel', () => {
    it.each(CASES.nouns)('labels a $docType $number as "$label" (the shared noun cases)', row => {
        expect(itemLabel({ doc_type: row.docType, number: row.number })).toBe(row.label)
    })

    it('labels a journal entry "Journal entry <n>", not with its "entry" noun', () => {
        expect(itemLabel({ doc_type: 'journal', number: '12' })).toBe('Journal entry 12')
    })

    it.each(
        Object.entries(DOC_TYPES).filter(([docType]) => docType !== 'journal')
    )('labels a %s with its noun, capitalised', (docType, { noun }) => {
        const capital = `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`
        expect(itemLabel({ doc_type: docType, number: '7' })).toBe(`${capital} 7`)
    })
})

describe('itemPaymentText', () => {
    it('reads the method label and the reference no.', () => {
        expect(
            itemPaymentText(
                payment({ doc_type: 'payment', payment_method: 'check', reference_no: '98765' })
            )
        ).toBe('Check · 98765')
    })

    it('reads the method alone, and the reference alone', () => {
        expect(
            itemPaymentText(payment({ doc_type: 'sales_receipt', payment_method: 'cash' }))
        ).toBe('Cash')
        expect(itemPaymentText(payment({ doc_type: 'vendor_refund', reference_no: '7741' }))).toBe(
            '7741'
        )
    })

    it("reads a journal entry's and a transfer's line memo", () => {
        const memo = 'Cash count correction for the October farmers market float'
        expect(itemPaymentText(payment({ doc_type: 'journal', memo }))).toBe(memo)
        expect(itemPaymentText(payment({ doc_type: 'transfer', memo: 'To the float' }))).toBe(
            'To the float'
        )
    })

    it('reads nothing when the document names no method and no reference', () => {
        expect(itemPaymentText(payment({ doc_type: 'payment' }))).toBe('')
        expect(itemPaymentText(payment({ doc_type: 'journal' }))).toBe('')
    })
})

// The read view's display rows (spec §3.4, §3.8; cp2 fix round 1, item 2). An item row has
// no memo copy field: a journal entry's or a transfer's Payment text is the memo of the
// item's journal line, read through the row's `line` relation as `lineMemo`.
function readItemRow(fields: {
    id: string
    doc_type: string
    document?: string
    payment_method?: string
    reference_no?: string
    lineMemo?: string
}) {
    return {
        line: `line${fields.id}`,
        position: 0,
        entry: `entry${fields.id}`,
        amount: 18_000,
        date: '2026-11-03 00:00:00.000Z',
        number: '12',
        document: '',
        payment_method: '',
        reference_no: '',
        account: 'undepfunds00001',
        customer: '',
        vendor: '',
        customerRow: undefined,
        vendorRow: undefined,
        accountRow: undefined,
        lineMemo: undefined,
        ...fields,
    }
}

describe('depositReadItems', () => {
    it("shows a deposited journal entry's line memo as its Payment text", () => {
        const rows = depositReadItems(
            [readItemRow({ id: 'item1', doc_type: 'journal', lineMemo: 'Cash from the fair' })],
            'USD'
        )
        expect(rows.find(row => row.id === 'item1')?.payment).toBe('Cash from the fair')
    })

    it('keeps "Check · 98765" for a payment item with a method and a reference', () => {
        const rows = depositReadItems(
            [
                readItemRow({
                    id: 'item2',
                    doc_type: 'payment',
                    document: 'payment00000001',
                    payment_method: 'check',
                    reference_no: '98765',
                }),
            ],
            'USD'
        )
        expect(rows.find(row => row.id === 'item2')?.payment).toBe('Check · 98765')
    })
})

describe('itemAmountText', () => {
    it('reads money in as plain money', () => {
        expect(itemAmountText(18_000, 'USD')).toBe('$180.00')
    })

    it('reads money out with the minus sign U+2212, not a hyphen', () => {
        const text = itemAmountText(-2_000, 'USD')
        expect(text).toBe(`${MINUS}$20.00`)
        expect(text).not.toContain('-')
    })

    it('reads zero as $0.00 with no sign', () => {
        expect(itemAmountText(0, 'USD')).toBe('$0.00')
    })
})

describe('partyNameOf', () => {
    const none = { customer: '', vendor: '' }

    it("names the customer's row", () => {
        expect(
            partyNameOf({
                ...none,
                customer: 'cust_harbor_001',
                customerRow: { display_name: 'Harborview Cafe' },
            })
        ).toBe('Harborview Cafe')
    })

    it("names the vendor's row", () => {
        expect(
            partyNameOf({
                ...none,
                vendor: 'vend_office_001',
                vendorRow: { display_name: 'Office Supply Co' },
            })
        ).toBe('Office Supply Co')
    })

    it('reads "—" when the row names no party', () => {
        expect(partyNameOf(none)).toBe('—')
    })

    it('reads "—" when the party id names a row that is gone', () => {
        expect(partyNameOf({ ...none, customer: 'cust_gone_00001' })).toBe('—')
        expect(partyNameOf({ ...none, vendor: 'vend_gone_00001' })).toBe('—')
    })
})

// The form's selection (spec §3.4): the ticked set is the form's `items` array, one
// `{ line }` per ticked journal line, in the order the rows were ticked.
const LINE = UNDEPOSITED_LINE_IDS
const LISTED = UNDEPOSITED_ITEMS
const ticks = (...lines: string[]) => lines.map(line => ({ line }))
const linesOf = (items: readonly { line: string }[]) => items.map(item => item.line)

describe('toggleItem', () => {
    it('ticks a row that is clear, after the rows already ticked', () => {
        expect(linesOf(toggleItem(ticks(LINE.payment), LINE.journal))).toEqual([
            LINE.payment,
            LINE.journal,
        ])
    })

    it('clears a ticked row and keeps the others in their order', () => {
        const ticked = ticks(LINE.payment, LINE.vendorRefund, LINE.journal)
        expect(linesOf(toggleItem(ticked, LINE.vendorRefund))).toEqual([LINE.payment, LINE.journal])
    })

    it('does not change the array it is given', () => {
        const ticked = ticks(LINE.payment)
        toggleItem(ticked, LINE.journal)
        expect(linesOf(ticked)).toEqual([LINE.payment])
    })
})

describe('selectAll and isEveryItemTicked', () => {
    it('ticks every listed item, then clears them all once every one is ticked', () => {
        const some = ticks(LINE.vendorRefund)
        expect(isEveryItemTicked(some, LISTED)).toBe(false)
        const all = selectAll(some, LISTED)
        expect([...linesOf(all)].sort()).toEqual(LISTED.map(row => row.line).sort())
        expect(isEveryItemTicked(all, LISTED)).toBe(true)
        expect(selectAll(all, LISTED)).toEqual([])
    })

    it('ticks every listed item from none ticked', () => {
        const all = selectAll([], LISTED)
        expect([...linesOf(all)].sort()).toEqual(LISTED.map(row => row.line).sort())
    })

    it('reads not every item ticked for an empty list or one row clear', () => {
        expect(isEveryItemTicked([], [])).toBe(false)
        const allButOne = ticks(...LISTED.slice(1).map(row => row.line))
        expect(isEveryItemTicked(allButOne, LISTED)).toBe(false)
    })
})

describe('clearSelection', () => {
    it('clears every tick', () => {
        expect(clearSelection(ticks(LINE.payment, LINE.journal))).toEqual([])
    })
})

// A draft's stored items merged with the listed ones by line id (spec §3.4, Do step 2).
describe('mergeItems', () => {
    const stored = depositItemsOf(DEPOSIT_IDS.draft)

    it('keeps a stored item the view no longer lists, flagged as not depositable', () => {
        const merged = mergeItems(LISTED, stored)
        const taken = merged.filter(row => row.line === LINE.taken)
        expect(taken).toHaveLength(1)
        expect(taken[0]?.depositable).toBe(false)
    })

    it('flags every listed item as depositable', () => {
        const merged = mergeItems(LISTED, stored)
        for (const row of merged.filter(candidate => candidate.line !== LINE.taken)) {
            expect(row.depositable).toBe(true)
        }
    })

    it('lists no line id twice when a stored item is listed too', () => {
        const lines = linesOf(mergeItems(LISTED, stored))
        expect(new Set(lines).size).toBe(lines.length)
        expect(lines.filter(line => line === LINE.payment)).toHaveLength(1)
        expect(lines.filter(line => line === LINE.vendorRefund)).toHaveLength(1)
    })

    it('keeps the listed order of the listed items', () => {
        const listedLines = new Set(LISTED.map(row => row.line))
        const merged = linesOf(mergeItems(LISTED, stored)).filter(line => listedLines.has(line))
        expect(merged).toEqual(LISTED.map(row => row.line))
    })

    it('is the listed items alone for a new form', () => {
        expect(linesOf(mergeItems(LISTED, []))).toEqual(LISTED.map(row => row.line))
    })
})

describe('staleItemText', () => {
    it('reads "<item> is void." for an entry that is void', () => {
        expect(staleItemText({ doc_type: 'payment', number: '1004' }, 'void', null)).toBe(
            'Payment 1004 is void.'
        )
    })

    it('reads "<item> is already in Deposit <n>." for a line another posted deposit holds', () => {
        expect(
            staleItemText({ doc_type: 'payment', number: '1004' }, 'posted', { number: '1002' })
        ).toBe('Payment 1004 is already in Deposit 1002.')
        expect(
            staleItemText({ doc_type: 'sales_receipt', number: '1012' }, 'posted', {
                number: '1007',
            })
        ).toBe('Sales receipt 1012 is already in Deposit 1007.')
    })
})

// `items.<n>` is the row's rank among the deposit's rows in position order: stored items
// by position, then new ticks (Decisions, Refusal keys).
describe('itemLineOfRefusal', () => {
    const rows = [
        { line: LINE.payment, position: 1 },
        { line: LINE.vendorRefund, position: 2 },
        { line: LINE.journal, position: 3 },
    ]

    it('maps items.1 of stored positions 1 and 2 plus one new tick to the second row', () => {
        expect(itemLineOfRefusal('items.1', rows)).toBe(LINE.vendorRefund)
    })

    it('maps items.0 to the first row and items.2 to the new tick', () => {
        expect(itemLineOfRefusal('items.0', rows)).toBe(LINE.payment)
        expect(itemLineOfRefusal('items.2', rows)).toBe(LINE.journal)
    })

    it('maps no line for a key past the rows or a key that names no item', () => {
        expect(itemLineOfRefusal('items.3', rows)).toBeFalsy()
        expect(itemLineOfRefusal('deposit_to', rows)).toBeFalsy()
    })
})

describe('depositFigureText', () => {
    it('reads the Deposit total', () => {
        const totals = depositTotals([{ amount: 150_000 }], [{ amount: 25_000 }])
        expect(depositFigureText(totals, false, 'USD')).toBe('$1,750.00')
    })

    it('reads "—" while an other funds amount is invalid', () => {
        const totals = depositTotals([{ amount: 150_000 }], [])
        expect(depositFigureText(totals, true, 'USD')).toBe('—')
    })

    it('reads "Too large" over the stored-amount limit', () => {
        const totals = depositTotals([{ amount: maxStoredAmount }], [{ amount: 100 }])
        expect(depositFigureText(totals, false, 'USD')).toBe('Too large')
    })
})

// The other funds amounts as the form reads them from the Amount cells' text: cents, an
// invalid text as 0, and whether any text is invalid (the figure then reads "—").
describe('depositLineCents', () => {
    const lines = (...texts: string[]) => texts.map(amount => ({ amount }))

    it('reads valid amounts as cents', () => {
        expect(depositLineCents(lines('12.40', '1,250.00'), 'USD')).toEqual({
            amounts: [1_240, 125_000],
            hasInvalidAmount: false,
        })
    })

    it('reads a negative amount as negative cents', () => {
        expect(depositLineCents(lines('-20.00'), 'USD')).toEqual({
            amounts: [-2_000],
            hasInvalidAmount: false,
        })
    })

    it('reads malformed text as 0 and flags it', () => {
        expect(depositLineCents(lines('12.40', '1.2.3'), 'USD')).toEqual({
            amounts: [1_240, 0],
            hasInvalidAmount: true,
        })
    })

    it('reads an empty cell as 0 and does not flag it', () => {
        expect(depositLineCents(lines(''), 'USD')).toEqual({
            amounts: [0],
            hasInvalidAmount: false,
        })
    })

    it('reads text over the stored-amount limit as 0 and flags it', () => {
        expect(depositLineCents(lines('90071992547409.92'), 'USD')).toEqual({
            amounts: [0],
            hasInvalidAmount: true,
        })
    })

    it('gives depositFigureText "—" while one line amount is malformed', () => {
        const { amounts, hasInvalidAmount } = depositLineCents(lines('12.40', '1.2.3'), 'USD')
        const totals = depositTotals(
            [{ amount: 150_000 }],
            amounts.map(amount => ({ amount }))
        )
        expect(depositFigureText(totals, hasInvalidAmount, 'USD')).toBe('—')
    })
})

// At most 100 other funds lines (spec §3.5): "Add line" disables at the limit.
describe('canAddLine', () => {
    it('allows a line while the deposit holds fewer than 100', () => {
        expect(canAddLine(0)).toBe(true)
        expect(canAddLine(99)).toBe(true)
    })

    it('refuses a line at 100 and above', () => {
        expect(canAddLine(100)).toBe(false)
        expect(canAddLine(101)).toBe(false)
    })
})

// A line refusal `lines.<n>.<field>` shows under that line's field (Decisions, Refusal
// keys): `n` is the line's rank, which is its index in the form's `lines` array.
describe('lineRefusalPath', () => {
    it('maps lines.1.account to the second line’s Account', () => {
        expect(lineRefusalPath('lines.1.account')).toBe('lines.1.account')
    })

    it('maps each line field the server keys', () => {
        for (const field of ['account', 'amount', 'description', 'customer', 'vendor']) {
            expect(lineRefusalPath(`lines.0.${field}`)).toBe(`lines.0.${field}`)
        }
        expect(lineRefusalPath('lines.12.amount')).toBe('lines.12.amount')
    })

    it('maps no path for a key that names no line field', () => {
        expect(lineRefusalPath('lines.1.position')).toBeNull()
        expect(lineRefusalPath('lines.x.account')).toBeNull()
        expect(lineRefusalPath('lines.1')).toBeNull()
        expect(lineRefusalPath('items.0')).toBeNull()
        expect(lineRefusalPath('deposit_to')).toBeNull()
    })
})

describe('itemsCountText', () => {
    it('counts no item', () => {
        expect(itemsCountText([], 'USD')).toBe('0 items · $0.00')
    })

    it('counts one item in the singular', () => {
        expect(itemsCountText([{ amount: 6_400 }], 'USD')).toBe('1 item · $64.00')
    })

    it('counts three items and sums them, money out included', () => {
        expect(
            itemsCountText([{ amount: 100_000 }, { amount: 77_000 }, { amount: -2_000 }], 'USD')
        ).toBe('3 items · $1,750.00')
    })
})

describe('undepositedListState', () => {
    it('is loading while the read loads', () => {
        expect(undepositedListState({ isLoading: true, isError: false, count: 0 })).toBe('loading')
    })

    it('is error for zero rows after a failed read, never empty', () => {
        expect(undepositedListState({ isLoading: false, isError: true, count: 0 })).toBe('error')
    })

    it('is empty for zero rows', () => {
        expect(undepositedListState({ isLoading: false, isError: false, count: 0 })).toBe('empty')
    })

    it('is list with rows', () => {
        expect(undepositedListState({ isLoading: false, isError: false, count: 3 })).toBe('list')
    })
})

describe('showsItemAccount', () => {
    it('is false when every item is on one Undeposited funds account', () => {
        expect(
            showsItemAccount([{ account: 'acctundep000001' }, { account: 'acctundep000001' }])
        ).toBe(false)
    })

    it('is true when the items are on two accounts', () => {
        expect(
            showsItemAccount([{ account: 'acctundep000001' }, { account: 'acctundep000002' }])
        ).toBe(true)
    })
})

// Rows as useUndepositedItems lists them: view rows with their party rows.
function sortRow(id: string, date: string, number: string, party: string | null) {
    const base = LISTED[0]
    if (!base) throw new Error('the fixture lists no item')
    return {
        ...base,
        id,
        line: id,
        date,
        number,
        customer: party === null ? '' : `cust${id}`,
        vendor: '',
        customerRow: party === null ? undefined : { display_name: party },
        vendorRow: undefined,
    }
}

// The notice on the read view of a deposited document (spec §3.10): the reason names the
// document's own noun.
describe('inDepositText', () => {
    it.each([
        ['payment', 'To edit or void this payment, remove it from the deposit first.'],
        ['sales receipt', 'To edit or void this sales receipt, remove it from the deposit first.'],
        ['vendor refund', 'To edit or void this vendor refund, remove it from the deposit first.'],
        [
            'refund receipt',
            'To edit or void this refund receipt, remove it from the deposit first.',
        ],
    ])('reads the reason for a %s', (noun, text) => {
        expect(inDepositText(noun)).toBe(text)
    })
})

// Whether a read view hides Edit and Void (spec §3.10, checkpoint 5 Do step 3): hidden while
// a posted deposit holds the document, and while that read is not ready (no flash of buttons
// that then go away); offered after a failed read (the server guard refuses) and for a
// document with no entry (no deposit can hold it).
describe('depositedOffer', () => {
    const deposit = { id: 'deposit00000001', number: '1002' }

    it('is true when a posted deposit holds the document', () => {
        expect(depositedOffer({ hasEntry: true, isReady: true, isError: false, deposit })).toBe(
            true
        )
    })

    it('is true while the read is not ready', () => {
        expect(
            depositedOffer({ hasEntry: true, isReady: false, isError: false, deposit: null })
        ).toBe(true)
    })

    it('is false once the read is ready and no deposit holds the document', () => {
        expect(
            depositedOffer({ hasEntry: true, isReady: true, isError: false, deposit: null })
        ).toBe(false)
    })

    it('is false after a failed read', () => {
        expect(
            depositedOffer({ hasEntry: true, isReady: false, isError: true, deposit: null })
        ).toBe(false)
        expect(
            depositedOffer({ hasEntry: true, isReady: true, isError: true, deposit: null })
        ).toBe(false)
    })

    it('is false for a document with no entry', () => {
        expect(
            depositedOffer({ hasEntry: false, isReady: false, isError: false, deposit: null })
        ).toBe(false)
        expect(
            depositedOffer({ hasEntry: false, isReady: true, isError: false, deposit: null })
        ).toBe(false)
    })
})

// The entry whose deposit a document read view reads (spec §3.10, checkpoint 5 Do step 2):
// a sales receipt's and a refund receipt's own entry, which post to a deposit account such as
// Undeposited funds; '' for every other kind, so its deposit read is off.
describe('depositEntryOf', () => {
    const ENTRY = 'entrydeposit001'

    it.each(['sales_receipt', 'refund_receipt'] as const)("gives a %s's own entry", kind => {
        expect(depositEntryOf({ kindFields: { kind }, entry: ENTRY })).toBe(ENTRY)
    })

    it.each([
        'invoice',
        'estimate',
        'bill',
        'expense',
        'credit_memo',
        'vendor_credit',
    ] as const)('gives the kind %s no entry, so its read is off', kind => {
        expect(depositEntryOf({ kindFields: { kind }, entry: ENTRY })).toBe('')
    })
})

describe('sortItems', () => {
    const rows = [
        sortRow('lineb', '2026-11-03', '1012', 'Northwind Traders'),
        sortRow('linea', '2026-11-03', '1009', 'Aspen Dental'),
        sortRow('linec', '2026-10-02', '1020', null),
        sortRow('lined', '2026-11-10', '1001', 'Harborview Cafe'),
    ]
    const ids = (sorted: readonly { id: string }[]) => sorted.map(row => row.id)

    it('sorts by date, then by number', () => {
        expect(ids(sortItems(rows, 'date', 'asc'))).toEqual(['linec', 'linea', 'lineb', 'lined'])
    })

    it('reverses the date order', () => {
        expect(ids(sortItems(rows, 'date', 'desc'))).toEqual(['lined', 'lineb', 'linea', 'linec'])
    })

    it('sorts by the Received from name, a row with no party last', () => {
        expect(ids(sortItems(rows, 'party', 'asc'))).toEqual(['linea', 'lined', 'lineb', 'linec'])
    })

    it('reverses the Received from order', () => {
        const reversed = ids(sortItems(rows, 'party', 'desc'))
        const named = reversed.filter(id => id !== 'linec')
        expect(named).toEqual(['lineb', 'lined', 'linea'])
    })

    it('does not change the array it is given', () => {
        sortItems(rows, 'party', 'asc')
        expect(ids(rows)).toEqual(['lineb', 'linea', 'linec', 'lined'])
    })
})

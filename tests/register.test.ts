import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    BALANCES,
    ENTRIES,
    LINES,
    REGISTER_ACCOUNT_ID,
    REGISTER_TODAY,
} from '../tinycld/books/lib/account-register-fixture'
import { balanceTone, maxStoredAmount } from '../tinycld/books/lib/money'
import {
    buildRegister,
    DOC_TYPE_LABELS,
    defaultOrder,
    entryDetail,
    entryNumberLabel,
    entryTypeLabel,
    originLabels,
    type RegisterEntry,
    type RegisterSourceLine,
    reversalOrigins,
    toggleOrder,
} from '../tinycld/books/lib/register'
import { rangeForPreset } from '../tinycld/books/lib/register-range'

const ME = REGISTER_ACCOUNT_ID

function fixtureLines(): RegisterSourceLine[] {
    return LINES.filter(l => l.account === ME).map(l => {
        const entryRecord = ENTRIES.find(e => e.id === l.entry)
        const reversed = ENTRIES.find(e => e.id === entryRecord?.reverses)
        return {
            ...l,
            entryRecord,
            entryLines: LINES.filter(x => x.entry === l.entry),
            reversesNumber: reversed?.number ?? '',
        }
    })
}

const octoberLines = fixtureLines().filter(l => l.date >= '2026-10-01' || !l.posted)

const priorTotals = BALANCES.filter(b => b.period < '2026-10').reduce(
    (sum, b) => ({ debit: sum.debit + b.debit_total, credit: sum.credit + b.credit_total }),
    { debit: 0, credit: 0 }
)

const thisMonth = rangeForPreset('this-month', REGISTER_TODAY, 1)

function build(order: 'newest' | 'oldest' = 'oldest') {
    return buildRegister({
        accountType: 'bank',
        lines: octoberLines,
        priorTotals,
        range: thisMonth,
        order,
    })
}

function entryOf(id: string, posted_at: string): RegisterEntry {
    return {
        id,
        number: id,
        memo: `memo ${id}`,
        status: 'posted',
        origin: 'manual',
        doc_type: 'journal',
        posted_at,
        reverses: '',
        date: '2026-10-05',
        document: '',
    }
}

function synthetic(
    id: string,
    fields: Partial<RegisterSourceLine> & { posted_at?: string } = {}
): RegisterSourceLine {
    const { posted_at = '2026-10-05 09:00:00.000Z', ...rest } = fields
    return {
        id,
        entry: `e_${id}`,
        account: ME,
        debit: 0,
        credit: 0,
        memo: '',
        position: 0,
        date: '2026-10-05',
        posted: true,
        entryRecord: entryOf(`e_${id}`, posted_at),
        entryLines: [],
        reversesNumber: '',
        ...rest,
    }
}

const emptyPrior = { debit: 0, credit: 0 }
const wholeMonth = { start: '2026-10-01', end: '2026-10-31' }

function ids(lines: RegisterSourceLine[], order: 'newest' | 'oldest' = 'oldest') {
    return buildRegister({
        accountType: 'bank',
        lines,
        priorTotals: emptyPrior,
        range: wholeMonth,
        order,
    }).rows.map(r => r.id)
}

function permutations<T>(items: T[]): T[][] {
    if (items.length <= 1) return [items]
    return items.flatMap((item, i) =>
        permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest])
    )
}

describe('buildRegister balances from the fixture', () => {
    it('gives opening, ending and 17 rows for this month', () => {
        const register = build()
        expect(register.openingBalance).toBe(1_426_250)
        expect(register.endingBalance).toBe(1_594_031)
        expect(register.rows).toHaveLength(17)
        expect(register.showOpeningRow).toBe(true)
    })

    it('computes the running balance oldest to newest', () => {
        const { rows } = build()
        const first = rows[0]
        expect(first.number).toBe('JE-1040')
        expect(first.balance).toBe(1_426_250 - 1_200_000)
        expect(first.balance).toBe(226_250)
        rows.slice(1).forEach((row, i) => {
            const previous = rows[i].balance as number
            expect(row.balance).toBe(previous + row.debit - row.credit)
        })
    })

    it('shows the same balances in either order', () => {
        const oldest = build('oldest').rows
        const newest = build('newest').rows
        expect(newest.map(r => r.id)).toEqual(oldest.map(r => r.id).reverse())
        expect(newest.map(r => r.balance)).toEqual(oldest.map(r => r.balance).reverse())
        expect(newest[0].balance).toBe(1_594_031)
    })

    it('starts from a mid-month range start', () => {
        const register = buildRegister({
            accountType: 'bank',
            lines: octoberLines,
            priorTotals,
            range: { start: '2026-10-10', end: '2026-10-23' },
            order: 'oldest',
        })
        expect(register.rows.every(r => r.date >= '2026-10-10')).toBe(true)
        expect(register.rows).toHaveLength(9)
        // October lines before the 10th: -1_200_000 - 28_000 - 410_000 - 95_500 + 500_000
        // + 750_000 - 750_000 + 705_000 = -528_500
        expect(register.openingBalance).toBe(1_426_250 - 528_500)
        expect(register.endingBalance).toBe(1_594_031)
    })

    it('cancels the void pair', () => {
        const { rows } = build()
        const index = rows.findIndex(r => r.entryId === 'je_1046')
        const original = rows[index]
        const reversal = rows[index + 1]
        expect(original.isVoid).toBe(true)
        expect(original.typeLabel).toBe('Journal entry')
        expect(reversal.entryId).toBe('je_1046v')
        expect(reversal.typeLabel).toBe('Void reversal of JE-1046')
        expect(reversal.balance).toBe(rows[index - 1].balance)
    })

    it('never lists the draft line or changes a balance for it', () => {
        const { rows } = build()
        expect(rows.some(r => r.entryId === 'je_1060')).toBe(false)
    })

    it('marks a split entry and names the other account of a two-line entry', () => {
        const { rows } = build()
        const payroll = rows.find(r => r.entryId === 'je_1050')
        const rent = rows.find(r => r.entryId === 'je_1040')
        expect(payroll?.isSplit).toBe(true)
        expect(payroll?.otherAccountId).toBeNull()
        expect(rent?.isSplit).toBe(false)
        expect(rent?.otherAccountId).toBe('acct_exp_0007')
    })

    it('uses the line memo, else the entry memo', () => {
        const { rows } = build()
        expect(rows.find(r => r.entryId === 'je_1040')?.memo).toBe('October rent')
        expect(rows.find(r => r.entryId === 'je_1052')?.memo).toBe(
            'Registration, lodging and flights booked together through the conference travel desk'
        )
    })
})

describe('buildRegister rules', () => {
    it('gives null opening, ending and row balances when the prior totals overflow', () => {
        const register = buildRegister({
            accountType: 'bank',
            lines: [synthetic('a', { debit: 1 })],
            priorTotals: { debit: maxStoredAmount + 1_000, credit: 0 },
            range: wholeMonth,
            order: 'oldest',
        })
        expect(register.openingBalance).toBeNull()
        expect(register.endingBalance).toBeNull()
        expect(register.rows.map(r => r.balance)).toEqual([null])
    })

    it('gives null opening and ending when a folded line causes the overflow', () => {
        const register = buildRegister({
            accountType: 'bank',
            lines: [
                synthetic('before', { debit: 2_000, date: '2026-09-30' }),
                synthetic('in', { debit: 1, date: '2026-10-05' }),
            ],
            priorTotals: { debit: maxStoredAmount - 1_000, credit: 0 },
            range: wholeMonth,
            order: 'oldest',
        })
        expect(register.openingBalance).toBeNull()
        expect(register.endingBalance).toBeNull()
    })

    it('ignores an unposted line dated before the range start', () => {
        const register = buildRegister({
            accountType: 'bank',
            lines: [
                synthetic('draft', { debit: 5_000, date: '2026-09-30', posted: false }),
                synthetic('in', { debit: 100, date: '2026-10-05' }),
            ],
            priorTotals: { debit: 800, credit: 0 },
            range: wholeMonth,
            order: 'oldest',
        })
        expect(register.openingBalance).toBe(800)
        expect(register.endingBalance).toBe(900)
    })

    it('orders equal-date positions numerically', () => {
        const lines = [synthetic('l1', { position: 10 }), synthetic('l2', { position: 2 })]
        for (const input of permutations(lines)) {
            expect(ids(input)).toEqual(['l2', 'l1'])
        }
    })

    it('gives an empty memo when the line and the entry have none', () => {
        const bare = synthetic('a', { debit: 100 })
        const line = { ...bare, entryRecord: bare.entryRecord && { ...bare.entryRecord, memo: '' } }
        const { rows } = buildRegister({
            accountType: 'bank',
            lines: [line],
            priorTotals: emptyPrior,
            range: wholeMonth,
            order: 'oldest',
        })
        expect(rows[0].memo).toBe('')
    })

    it('credit-normal accounts add credits and subtract debits', () => {
        const lines = [
            synthetic('a', { credit: 500, position: 0 }),
            synthetic('b', { debit: 200, position: 1 }),
        ]
        const { rows } = buildRegister({
            accountType: 'income',
            lines,
            priorTotals: emptyPrior,
            range: wholeMonth,
            order: 'oldest',
        })
        expect(rows.map(r => r.balance)).toEqual([500, 300])
    })

    it('keeps a negative balance', () => {
        const lines = [
            synthetic('a', { debit: 100, position: 0 }),
            synthetic('b', { credit: 300, position: 1 }),
        ]
        const { rows, endingBalance } = buildRegister({
            accountType: 'bank',
            lines,
            priorTotals: emptyPrior,
            range: wholeMonth,
            order: 'oldest',
        })
        expect(rows.map(r => r.balance)).toEqual([100, -200])
        expect(endingBalance).toBe(-200)
    })

    it('orders equal dates by posted_at first', () => {
        const lines = [
            synthetic('l3', { posted_at: '2026-10-05 09:00:00.000Z', position: 2 }),
            synthetic('l2', { posted_at: '2026-10-05 10:00:00.000Z', position: 1 }),
            synthetic('l1', { posted_at: '2026-10-05 11:00:00.000Z', position: 0 }),
        ]
        for (const input of permutations(lines)) {
            expect(ids(input)).toEqual(['l3', 'l2', 'l1'])
        }
    })

    it('orders equal dates and posted_at by position', () => {
        const lines = [
            synthetic('l3', { position: 0 }),
            synthetic('l2', { position: 1 }),
            synthetic('l1', { position: 2 }),
        ]
        for (const input of permutations(lines)) {
            expect(ids(input)).toEqual(['l3', 'l2', 'l1'])
        }
    })

    it('orders equal dates, posted_at and position by id', () => {
        const lines = [synthetic('l2'), synthetic('l3'), synthetic('l1')]
        for (const input of permutations(lines)) {
            expect(ids(input)).toEqual(['l1', 'l2', 'l3'])
        }
    })

    it('ignores an unposted line dated inside the range', () => {
        const lines = [
            synthetic('a', { debit: 100, position: 0 }),
            synthetic('draft', { debit: 9_999, posted: false, position: 1 }),
        ]
        const register = buildRegister({
            accountType: 'bank',
            lines,
            priorTotals: emptyPrior,
            range: wholeMonth,
            order: 'oldest',
        })
        expect(register.rows.map(r => r.id)).toEqual(['a'])
        expect(register.endingBalance).toBe(100)
    })

    it('decides showOpeningRow from the opening balance and the rows', () => {
        const base = { accountType: 'bank', range: wholeMonth, order: 'oldest' } as const
        expect(
            buildRegister({ ...base, lines: [], priorTotals: { debit: 500, credit: 0 } })
                .showOpeningRow
        ).toBe(true)
        expect(
            buildRegister({
                ...base,
                lines: [synthetic('a', { debit: 1 })],
                priorTotals: emptyPrior,
            }).showOpeningRow
        ).toBe(true)
        expect(buildRegister({ ...base, lines: [], priorTotals: emptyPrior }).showOpeningRow).toBe(
            false
        )
    })

    it('ends equal to the opening balance for an empty range', () => {
        const register = buildRegister({
            accountType: 'bank',
            lines: [],
            priorTotals: { debit: 800, credit: 300 },
            range: wholeMonth,
            order: 'newest',
        })
        expect(register.rows).toEqual([])
        expect(register.openingBalance).toBe(500)
        expect(register.endingBalance).toBe(500)
    })

    it('gives a null balance from the first overflow onward', () => {
        const lines = [
            synthetic('a', { debit: maxStoredAmount - 1_000, position: 0 }),
            synthetic('b', { debit: 2_000, position: 1 }),
            synthetic('c', { credit: 2_000, position: 2 }),
        ]
        const register = buildRegister({
            accountType: 'bank',
            lines,
            priorTotals: emptyPrior,
            range: wholeMonth,
            order: 'oldest',
        })
        expect(register.rows.map(r => r.balance)).toEqual([maxStoredAmount - 1_000, null, null])
        expect(register.endingBalance).toBeNull()
    })
})

describe('entryDetail', () => {
    const payrollLine = fixtureLines().find(l => l.entry === 'je_1050') as RegisterSourceLine

    it('lists the entry lines and marks this account', () => {
        const detail = entryDetail(payrollLine, ME)
        expect(detail?.number).toBe('JE-1050')
        expect(detail?.lines).toHaveLength(3)
        expect(detail?.lines.filter(l => l.isThisAccount).map(l => l.accountId)).toEqual([ME])
        expect(detail?.statusLabel).toBe('Posted')
    })

    it('labels a void entry', () => {
        const voided = fixtureLines().find(l => l.entry === 'je_1046') as RegisterSourceLine
        expect(entryDetail(voided, ME)?.statusLabel).toBe('Void')
    })

    it('returns null without an entry record', () => {
        expect(entryDetail({ ...payrollLine, entryRecord: undefined }, ME)).toBeNull()
    })
})

describe('entryDetail fields', () => {
    it('describes a draft reversal with its lines sorted by position', () => {
        const base = synthetic('a')
        const line = {
            ...base,
            reversesNumber: 'JE-1',
            entryRecord: {
                ...entryOf('e_a', ''),
                number: 'JE-9',
                memo: 'Entry memo',
                status: 'draft',
                origin: 'reversal',
                date: '2026-10-07',
            },
            entryLines: [
                { id: 'x3', account: 'acct_c', debit: 0, credit: 30, memo: 'third', position: 2 },
                { id: 'x1', account: ME, debit: 10, credit: 0, memo: 'first', position: 0 },
                { id: 'x2', account: 'acct_b', debit: 20, credit: 0, memo: 'second', position: 1 },
            ],
        } satisfies RegisterSourceLine
        expect(entryDetail(line, ME)).toEqual({
            date: '2026-10-07',
            number: 'JE-9',
            typeLabel: 'Reversal of JE-1',
            statusLabel: 'Draft',
            memo: 'Entry memo',
            docType: 'journal',
            origin: 'reversal',
            document: '',
            lines: [
                {
                    id: 'x1',
                    accountId: ME,
                    debit: 10,
                    credit: 0,
                    memo: 'first',
                    partyName: '',
                    isThisAccount: true,
                },
                {
                    id: 'x2',
                    accountId: 'acct_b',
                    debit: 20,
                    credit: 0,
                    memo: 'second',
                    partyName: '',
                    isThisAccount: false,
                },
                {
                    id: 'x3',
                    accountId: 'acct_c',
                    debit: 0,
                    credit: 30,
                    memo: 'third',
                    partyName: '',
                    isThisAccount: false,
                },
            ],
        })
    })
})

describe('entryTypeLabel', () => {
    it('treats an unknown origin as a plain entry without the suffix', () => {
        expect(entryTypeLabel('imported', 'JE-7')).toBe('Journal entry')
    })

    it('labels each origin', () => {
        expect(entryTypeLabel('manual', '')).toBe('Journal entry')
        expect(entryTypeLabel('reversal', 'JE-7')).toBe('Reversal of JE-7')
        expect(entryTypeLabel('void_reversal', 'JE-7')).toBe('Void reversal of JE-7')
        expect(entryTypeLabel('auto_reversal', 'JE-7')).toBe('Auto reversal of JE-7')
    })

    it('drops the number when there is none', () => {
        expect(entryTypeLabel('reversal', '')).toBe('Reversal')
        expect(entryTypeLabel('void_reversal', '')).toBe('Void reversal')
        expect(entryTypeLabel('auto_reversal', '')).toBe('Auto reversal')
    })
})

describe('order', () => {
    it('defaults to newest and toggles', () => {
        expect(defaultOrder).toBe('newest')
        expect(toggleOrder('newest')).toBe('oldest')
        expect(toggleOrder('oldest')).toBe('newest')
    })
})

describe('entryNumberLabel', () => {
    it('shows a dash for an entry with no number and the number otherwise', () => {
        expect(entryNumberLabel('')).toBe('\u2014')
        expect(entryNumberLabel('JE-1040')).toBe('JE-1040')
    })
})

describe('balanceTone', () => {
    it('marks an unavailable balance as an error and a number as normal text', () => {
        expect(balanceTone(null)).toBe('text-danger')
        expect(balanceTone(12345)).toBe('text-foreground')
    })
})

describe('entryTypeLabel for transfers', () => {
    it('labels a manual transfer "Transfer"', () => {
        expect(entryTypeLabel('manual', '', 'transfer')).toBe('Transfer')
    })

    it("keeps the reversal suffix on a transfer's void reversal", () => {
        expect(entryTypeLabel('void_reversal', 'TR-3', 'transfer')).toBe('Void reversal of TR-3')
    })

    it('labels a transfer line "Transfer" in the register and in the drawer detail', () => {
        const base = synthetic('t', { credit: 150_000 })
        const line = {
            ...base,
            entryRecord: { ...entryOf('e_t', '2026-10-05 09:00:00.000Z'), doc_type: 'transfer' },
        } satisfies RegisterSourceLine
        const { rows } = buildRegister({
            accountType: 'bank',
            lines: [line],
            priorTotals: emptyPrior,
            range: wholeMonth,
            order: 'oldest',
        })
        expect(rows.map(r => r.typeLabel)).toEqual(['Transfer'])
        const detail = entryDetail(line, ME)
        expect(detail?.typeLabel).toBe('Transfer')
        expect(detail?.docType).toBe('transfer')
        expect(detail?.origin).toBe('manual')
    })

    it('gives a two-argument call the journal label', () => {
        for (const origin of ['manual', 'reversal', 'void_reversal', 'opening_balance']) {
            expect(entryTypeLabel(origin, 'JE-7'), origin).toBe(
                entryTypeLabel(origin, 'JE-7', 'journal')
            )
        }
    })
})

// The Go General Ledger reads the same table, so the two must not drift.
describe('entry type labels match server/entry_type_labels.json', () => {
    const server = JSON.parse(
        readFileSync(join(__dirname, '..', 'server', 'entry_type_labels.json'), 'utf8')
    ) as {
        origins: Record<string, string>
        docTypes: Record<string, string>
        reversalOrigins: string[]
    }

    it('holds the same origin labels, doc type labels and reversal origins', () => {
        expect({
            origins: originLabels,
            docTypes: DOC_TYPE_LABELS,
            reversalOrigins: Array.from(reversalOrigins ?? []),
        }).toEqual(server)
        expect(DOC_TYPE_LABELS).toEqual({
            transfer: 'Transfer',
            invoice: 'Invoice',
            sales_receipt: 'Sales receipt',
            bill: 'Bill',
        })
    })

    it('labels a non-reversal entry by its doc type from the table', () => {
        const docTypes = Object.entries(server.docTypes ?? {})
        expect(docTypes.map(([docType]) => docType).sort()).toEqual([
            'bill',
            'invoice',
            'sales_receipt',
            'transfer',
        ])
        for (const [docType, label] of docTypes) {
            expect(entryTypeLabel('manual', '', docType), docType).toBe(label)
        }
    })

    it('labels every origin of the table as before', () => {
        const origins = Object.entries(server.origins ?? {})
        expect(origins.map(([origin]) => origin).sort()).toEqual(
            ['auto_reversal', 'manual', 'opening_balance', 'reversal', 'void_reversal'].sort()
        )
        for (const [origin, label] of origins) {
            expect(entryTypeLabel(origin, ''), origin).toBe(label)
        }
        expect(entryTypeLabel('manual', '', 'transfer')).toBe(server.docTypes?.transfer)
        expect(entryTypeLabel('void_reversal', 'TR-3', 'transfer')).toBe('Void reversal of TR-3')
    })
})

describe('entryTypeLabel for invoices', () => {
    it('labels an invoice entry "Invoice"', () => {
        expect(entryTypeLabel('document', '', 'invoice')).toBe('Invoice')
    })

    it("keeps the reversal suffix on an invoice's void reversal", () => {
        expect(entryTypeLabel('void_reversal', '1001', 'invoice')).toBe('Void reversal of 1001')
    })

    it('leaves a transfer and a journal entry as they were', () => {
        expect(entryTypeLabel('manual', '', 'transfer')).toBe('Transfer')
        expect(entryTypeLabel('manual', '', 'journal')).toBe('Journal entry')
    })

    it("gives the drawer detail of an invoice entry the invoice's id", () => {
        const base = synthetic('i', { debit: 45_000 })
        const line = {
            ...base,
            entryRecord: {
                ...entryOf('e_i', '2026-10-05 09:00:00.000Z'),
                number: '1001',
                doc_type: 'invoice',
                origin: 'document',
                document: 'invc1',
            },
        } satisfies RegisterSourceLine
        const detail = entryDetail(line, ME)
        expect(detail?.typeLabel).toBe('Invoice')
        expect(detail?.document).toBe('invc1')
    })
})

describe('entryTypeLabel for opening balances', () => {
    it('names an opening entry and leaves a manual entry unchanged', () => {
        expect(entryTypeLabel('opening_balance', '')).toBe('Opening balances')
        expect(entryTypeLabel('manual', '')).toBe('Journal entry')
    })
})

describe('buildRegister with prior sums past the exact range', () => {
    it('shows no opening balance and no running balance, even when the sums net to zero', () => {
        const register = buildRegister({
            accountType: 'bank',
            lines: [],
            priorTotals: { debit: 2 ** 53, credit: 2 ** 53 },
            range: { start: '2026-01-01', end: '2026-12-31' },
            order: 'oldest',
        })
        expect(register.openingBalance).toBeNull()
        expect(register.endingBalance).toBeNull()
        expect(register.showOpeningRow).toBe(true)
    })
})

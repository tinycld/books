import { describe, expect, it } from 'vitest'
import { maxStoredAmount } from '../tinycld/books/lib/money'
import {
    amountCents,
    amountError,
    amountsFromLines,
    buildOpening,
    centsFromAmounts,
    centsToText,
    dayLabel,
    diffLines,
    effectiveMemo,
    findOpeningEquityAccount,
    maxLineAmount,
    memoFor,
    type OpeningAccount,
    type OpeningEntryRow,
    openingScreenState,
    pickOpeningBands,
    presetDate,
    previewFor,
    type SavedLine,
    viewEntryHref,
} from '../tinycld/books/lib/opening-balances'
import { ACCOUNTS, DRAFT_AMOUNTS } from '../tinycld/books/lib/opening-balances-fixture'
import { isIsoDay } from '../tinycld/books/lib/register-range'

function fixtureAccount(id: string): OpeningAccount {
    const found = ACCOUNTS.find(account => account.id === id)
    if (!found) throw new Error(`fixture account ${id} missing`)
    return found
}

const openingEquity: OpeningAccount = {
    ...fixtureAccount('acct_eq_00001'),
    id: 'acct_obe_0001',
    number: '3900',
    name: 'Opening Balance Equity',
    detail_type: 'opening_balance_equity',
}
const chart: OpeningAccount[] = [...ACCOUNTS, openingEquity]

function manyAssets(count: number): OpeningAccount[] {
    return Array.from({ length: count }, (_, i) => ({
        ...fixtureAccount('acct_bank_0001'),
        id: `many_${i}`,
        number: String(1000 + i),
        parent: '',
    }))
}

function manyLiabilities(count: number): OpeningAccount[] {
    return Array.from({ length: count }, (_, i) => ({
        ...fixtureAccount('acct_ap_00001'),
        id: `liab_${i}`,
        number: String(2000 + i),
        parent: '',
    }))
}

function debitsAndCredits(build: ReturnType<typeof buildOpening>) {
    let debits = build.lines.reduce((sum, line) => sum + line.debit, 0)
    let credits = build.lines.reduce((sum, line) => sum + line.credit, 0)
    if (build.balancing?.side === 'debit') debits += build.balancing.amount
    if (build.balancing?.side === 'credit') credits += build.balancing.amount
    return { debits, credits }
}

describe('pickOpeningBands', () => {
    const bands = pickOpeningBands(chart, new Set())
    const band = (group: string) => bands.find(b => b.group === group)?.rows ?? []

    it('returns Assets, Liabilities, Equity bands in order', () => {
        expect(bands.map(b => b.group)).toEqual(['asset', 'liability', 'equity'])
        expect(bands.map(b => b.title)).toEqual(['Assets', 'Liabilities', 'Equity'])
    })

    it('orders siblings by number with blank numbers last, children under their parent at depth 2', () => {
        expect(band('asset').map(row => [row.account.id, row.depth])).toEqual([
            ['acct_bank_0001', 1],
            ['acct_bank_0002', 2],
            ['acct_bank_0003', 2],
            ['acct_bank_0004', 2],
            ['acct_ar_00001', 1],
            ['acct_oca_0001', 1],
            ['acct_fa_00001', 1],
            ['acct_fa_00002', 2],
            ['acct_fa_00003', 2],
            ['acct_oca_0002', 1],
        ])
        expect(band('liability').map(row => [row.account.id, row.depth])).toEqual([
            ['acct_ap_00001', 1],
            ['acct_cc_00001', 1],
            ['acct_ocl_0001', 1],
            ['acct_ltl_0001', 1],
            ['acct_ltl_0002', 2],
        ])
    })

    it('holds only balance-sheet accounts and leaves out Opening Balance Equity', () => {
        expect(band('equity').map(row => row.account.id)).toEqual([
            'acct_eq_00001',
            'acct_eq_00002',
        ])
    })

    it('shows an inactive account only when it is saved, marked inactive', () => {
        const withSaved = pickOpeningBands(chart, new Set(['acct_bank_0005']))
        const rows = withSaved[0].rows
        expect(rows.find(row => row.account.id === 'acct_bank_0005')).toMatchObject({
            isInactive: true,
            depth: 2,
        })
        expect(bands[0].rows.some(row => row.account.id === 'acct_bank_0005')).toBe(false)
        expect(rows.filter(row => row.isInactive).length).toBe(1)
    })

    it('words the helper on receivable and payable rows only', () => {
        const all = bands.flatMap(b => b.rows)
        const helpers = all
            .filter(row => row.helper !== '')
            .map(row => [row.account.id, row.helper])
        expect(helpers).toEqual([
            ['acct_ar_00001', 'No customer or vendor detail'],
            ['acct_ap_00001', 'No customer or vendor detail'],
        ])
    })
})

describe('findOpeningEquityAccount', () => {
    it('finds the active opening balance equity account', () => {
        expect(findOpeningEquityAccount(chart)?.id).toBe('acct_obe_0001')
    })

    it('ignores an inactive one and returns undefined without one', () => {
        expect(findOpeningEquityAccount([{ ...openingEquity, inactive: true }])).toBeUndefined()
        expect(findOpeningEquityAccount(ACCOUNTS)).toBeUndefined()
    })
})

describe('buildOpening', () => {
    it('derives debit and credit from the normal side and sign, and balances exactly', () => {
        const amounts = { ...DRAFT_AMOUNTS, acct_ap_00001: -5000 }
        const build = buildOpening(ACCOUNTS, amounts)
        const line = (id: string) => build.lines.find(l => l.account === id)
        expect(line('acct_bank_0002')).toEqual({
            account: 'acct_bank_0002',
            debit: 4825000,
            credit: 0,
        })
        expect(line('acct_fa_00003')).toEqual({
            account: 'acct_fa_00003',
            debit: 0,
            credit: 422500,
        })
        expect(line('acct_cc_00001')).toEqual({
            account: 'acct_cc_00001',
            debit: 0,
            credit: 318045,
        })
        expect(line('acct_ap_00001')).toEqual({ account: 'acct_ap_00001', debit: 5000, credit: 0 })
        const lineTotals = {
            debits: build.lines.reduce((sum, l) => sum + l.debit, 0),
            credits: build.lines.reduce((sum, l) => sum + l.credit, 0),
        }
        expect(build.balancing).toEqual({
            side: lineTotals.debits > lineTotals.credits ? 'credit' : 'debit',
            amount: Math.abs(lineTotals.debits - lineTotals.credits),
        })
        const { debits, credits } = debitsAndCredits(build)
        expect(debits).toBe(credits)
    })

    it('gives a credit-side balancing line when credits exceed debits', () => {
        const build = buildOpening(ACCOUNTS, { acct_cc_00001: 10000, acct_bank_0002: 4000 })
        expect(build.balancing).toEqual({ side: 'debit', amount: 6000 })
    })

    it('makes no line for an empty or zero amount', () => {
        expect(buildOpening(ACCOUNTS, {}).lines).toEqual([])
        expect(buildOpening(ACCOUNTS, {}).balancing).toBeNull()
        const zero = buildOpening(ACCOUNTS, { acct_bank_0002: 0, acct_ar_00001: 700 })
        expect(zero.lines.map(l => l.account)).toEqual(['acct_ar_00001'])
    })

    it.each([
        ['draft amounts', DRAFT_AMOUNTS],
        [
            'a liability heavy input',
            { acct_bank_0002: 1000, acct_ap_00001: 99999, acct_cc_00001: -300 },
        ],
        [
            'a negative equity amount',
            { acct_bank_0002: 5000, acct_eq_00001: -1234, acct_eq_00002: 77 },
        ],
    ])('keeps assets - liabilities - equityWithBalancing at 0 for %s', (_name, amounts) => {
        const { totals } = buildOpening(ACCOUNTS, amounts)
        expect(totals.assets - totals.liabilities - totals.equityWithBalancing).toBe(0)
        expect(totals.equityWithBalancing).toBe(totals.equity + totals.balancing)
    })

    it('reports totals in each band sign', () => {
        const { totals } = buildOpening(ACCOUNTS, {
            acct_bank_0002: 1000,
            acct_fa_00003: -200,
            acct_ap_00001: 300,
        })
        expect(totals.assets).toBe(800)
        expect(totals.liabilities).toBe(300)
        expect(totals.balancing).toBe(500)
    })

    it('flags a line above maxLineAmount as too-large', () => {
        expect(buildOpening(ACCOUNTS, { acct_bank_0002: maxLineAmount + 1 }).problem).toBe(
            'too-large'
        )
        expect(buildOpening(ACCOUNTS, { acct_bank_0002: maxLineAmount }).problem).toBeNull()
    })

    it('flags a sum above maxStoredAmount as too-large from the overflow guard', () => {
        const accounts = manyAssets(11)
        const cents = Object.fromEntries(accounts.map(a => [a.id, maxLineAmount]))
        expect(buildOpening(accounts, cents).problem).toBe('too-large')
        // Nine such debits make a 9 * 10^15 credit balancing line, which is above the line limit.
        const nine = Object.fromEntries(accounts.slice(0, 9).map(a => [a.id, maxLineAmount]))
        expect(buildOpening(accounts, nine).problem).toBe('too-large')
    })

    it('allows nine maxLineAmount accounts when debits and credits leave a legal balancing line', () => {
        const assets = manyAssets(5)
        const liabilities = manyLiabilities(4)
        const cents = Object.fromEntries(
            [...assets, ...liabilities].map(a => [a.id, maxLineAmount])
        )
        const build = buildOpening([...assets, ...liabilities], cents)
        expect(build.balancing).toEqual({ side: 'credit', amount: maxLineAmount })
        expect(build.problem).toBeNull()
    })

    it('limits the balancing line to maxLineAmount, exact and one over', () => {
        const exact = buildOpening(ACCOUNTS, { acct_bank_0002: maxLineAmount })
        expect(exact.balancing?.amount).toBe(maxLineAmount)
        expect(exact.problem).toBeNull()
        const over = buildOpening(ACCOUNTS, { acct_bank_0002: maxLineAmount, acct_bank_0003: 1 })
        expect(over.balancing?.amount).toBe(maxLineAmount + 1)
        expect(over.problem).toBe('too-large')
    })

    it('ignores a cents id that is not in accounts', () => {
        // The caller filters amounts to the accounts it shows; an unknown id must add no line and no total.
        const build = buildOpening(ACCOUNTS, { acct_bank_0002: 1000, not_an_account: 5000 })
        expect(build.lines.map(l => l.account)).toEqual(['acct_bank_0002'])
        expect(build.balancing).toEqual({ side: 'credit', amount: 1000 })
        expect(build.totals.assets).toBe(1000)
    })

    it('counts non-zero amounts for the line cap: 999 pass, 1000 block even when balanced', () => {
        const assets = manyAssets(500)
        const liabilities = manyLiabilities(500)
        const accounts = [...assets, ...liabilities]
        // 500 asset cents against 498 liability cents of 1 plus one of 2: 999 amounts, balanced.
        const balanced999 = {
            ...Object.fromEntries(assets.map(a => [a.id, 1])),
            ...Object.fromEntries(liabilities.slice(0, 499).map(a => [a.id, 1])),
            [liabilities[0].id]: 2,
        }
        const ok = buildOpening(accounts, balanced999)
        expect(ok.balancing).toBeNull()
        expect(ok.problem).toBeNull()
        const balanced1000 = Object.fromEntries(accounts.map(a => [a.id, 2]))
        const blocked = buildOpening(accounts, balanced1000)
        expect(blocked.balancing).toBeNull()
        expect(blocked.problem).toBe('too-many-lines')
    })

    it('blocks 1000 amounts and allows 999 plus the balancing line', () => {
        const accounts = manyAssets(1000)
        const cents = (count: number) =>
            Object.fromEntries(accounts.slice(0, count).map(a => [a.id, 1]))
        expect(buildOpening(accounts, cents(1000)).problem).toBe('too-many-lines')
        const ok = buildOpening(accounts, cents(999))
        expect(ok.problem).toBeNull()
        expect(ok.lines.length).toBe(999)
        expect(ok.balancing).not.toBeNull()
    })
})

describe('amountCents and amountError', () => {
    it.each([
        ['1,234.50', 123450],
        ['$1,234.5', 123450],
        ['-250', -25000],
        ['', 0],
        ['0', 0],
        ['12.345', null],
        ['abc', null],
    ])('amountCents(%j) is %j', (text, expected) => {
        expect(amountCents(text)).toBe(expected)
    })

    it('amountCents is null above the maximum', () => {
        expect(amountCents('99,999,999,999,999,999')).toBeNull()
    })

    it.each([
        ['', null],
        ['1,234.50', null],
        ['abc', 'Enter an amount like 1,234.50'],
        ['12.345', 'Enter an amount like 1,234.50'],
        ['99,999,999,999,999,999', 'Amount is too large'],
        ['-99,999,999,999,999,999', 'Amount is too large'],
        ['$99999999999999999.99', 'Amount is too large'],
        ['1,2', 'Enter an amount like 1,234.50'],
        ['12,34', 'Enter an amount like 1,234.50'],
        [',5', 'Enter an amount like 1,234.50'],
        ['1,23,4', 'Enter an amount like 1,234.50'],
        ['1,,2', 'Enter an amount like 1,234.50'],
        ['0,500', 'Enter an amount like 1,234.50'],
    ])('amountError(%j) is %j', (text, expected) => {
        expect(amountError(text)).toBe(expected)
    })
})

describe('previewFor', () => {
    const preview = previewFor(chart, DRAFT_AMOUNTS)
    const section = (group: string) => preview.sections.find(s => s.group === group)

    it('lists only non-zero accounts', () => {
        const listed = preview.sections.flatMap(s => s.rows.map(r => r.id))
        const expected = Object.keys(DRAFT_AMOUNTS)
        const accountRows = listed.filter(id => id !== preview.balancingRow?.id)
        expect(accountRows.sort()).toEqual(expected.sort())
        const withZero = previewFor(chart, { acct_bank_0002: 0, acct_ar_00001: 5 })
        expect(withZero.sections.flatMap(s => s.rows.map(r => r.id))).not.toContain(
            'acct_bank_0002'
        )
    })

    it('puts the balancing row inside Equity and balances the totals', () => {
        expect(preview.balancingRow).not.toBeNull()
        expect(section('equity')?.rows.map(r => r.id)).toContain(preview.balancingRow?.id)
        expect(preview.totalLiabilitiesAndEquity).toBe(preview.totalAssets)
        expect(section('asset')?.total).toBe(preview.totalAssets)
    })

    it('shows a negative asset as a negative figure in Assets', () => {
        const row = section('asset')?.rows.find(r => r.id === 'acct_fa_00003')
        expect(row?.cents).toBe(-422500)
    })

    it('is empty with no amounts and has no balancing row', () => {
        const empty = previewFor(chart, {})
        expect(empty.isEmpty).toBe(true)
        expect(empty.balancingRow).toBeNull()
        expect(preview.isEmpty).toBe(false)
    })
})

describe('diffLines', () => {
    const saved: SavedLine[] = [
        { id: 'l1', account: 'a', debit: 100, credit: 0, position: 0 },
        { id: 'l2', account: 'b', debit: 0, credit: 50, position: 1 },
        { id: 'l3', account: 'obe', debit: 0, credit: 50, position: 2 },
    ]

    it('returns nothing for unchanged lines', () => {
        const next = [
            { account: 'a', debit: 100, credit: 0 },
            { account: 'b', debit: 0, credit: 50 },
            { account: 'obe', debit: 0, credit: 50 },
        ]
        expect(diffLines(saved, next)).toEqual({ insert: [], update: [], remove: [] })
    })

    it('updates a changed amount', () => {
        const next = [
            { account: 'a', debit: 150, credit: 0 },
            { account: 'b', debit: 0, credit: 50 },
            { account: 'obe', debit: 0, credit: 50 },
        ]
        expect(diffLines(saved, next)).toEqual({
            insert: [],
            update: [{ id: 'l1', debit: 150, credit: 0, position: 0 }],
            remove: [],
        })
    })

    it('inserts a new account', () => {
        const next = [
            { account: 'a', debit: 100, credit: 0 },
            { account: 'b', debit: 0, credit: 50 },
            { account: 'c', debit: 20, credit: 0 },
            { account: 'obe', debit: 0, credit: 50 },
        ]
        const diff = diffLines(saved, next)
        expect(diff.insert).toEqual([{ account: 'c', debit: 20, credit: 0 }])
        expect(diff.update).toEqual([{ id: 'l3', debit: 0, credit: 50, position: 3 }])
        expect(diff.remove).toEqual([])
    })

    it('removes a removed account', () => {
        const next = [
            { account: 'a', debit: 100, credit: 0 },
            { account: 'obe', debit: 0, credit: 100 },
        ]
        const diff = diffLines(saved, next)
        expect(diff.remove).toEqual(['l2'])
    })

    it('removes the balancing line when the entry becomes balanced', () => {
        const next = [
            { account: 'a', debit: 100, credit: 0 },
            { account: 'b', debit: 0, credit: 100 },
        ]
        const diff = diffLines(saved, next)
        expect(diff.remove).toEqual(['l3'])
        expect(diff.update).toEqual([{ id: 'l2', debit: 0, credit: 100, position: 1 }])
        expect(diff.insert).toEqual([])
    })
})

describe('amountsFromLines with duplicate lines', () => {
    it('takes the first line by position, as diffLines keeps it', () => {
        const lines: SavedLine[] = [
            { id: 'l1', account: 'acct_bank_0002', debit: 5, credit: 0, position: 0 },
            { id: 'l2', account: 'acct_bank_0002', debit: 7, credit: 0, position: 1 },
        ]
        expect(amountsFromLines(chart, lines, 'acct_obe_0001')).toEqual({
            acct_bank_0002: '0.05',
        })
        const diff = diffLines(lines, [{ account: 'acct_bank_0002', debit: 5, credit: 0 }])
        expect(diff.remove).toEqual(['l2'])
        expect(diff.update).toEqual([])
    })
})

describe('text round trips', () => {
    it.each([0, 5, 100, 123450, -250, maxStoredAmount])('round-trips %d cents', cents => {
        expect(amountCents(centsToText(cents))).toBe(cents)
    })

    it('formats cents with grouping and keeps the sign', () => {
        expect(centsToText(1234050)).toBe('12,340.50')
        expect(centsToText(-250)).toBe('-2.50')
    })

    it('shows a non-normal side line as negative and skips the balancing line', () => {
        const lines: SavedLine[] = [
            { id: 'l1', account: 'acct_bank_0002', debit: 482500, credit: 0, position: 0 },
            { id: 'l2', account: 'acct_fa_00003', debit: 0, credit: 42250, position: 1 },
            { id: 'l3', account: 'acct_ap_00001', debit: 0, credit: 59200, position: 2 },
            { id: 'l4', account: 'acct_cc_00001', debit: 1000, credit: 0, position: 3 },
            { id: 'l5', account: 'acct_obe_0001', debit: 0, credit: 9999, position: 4 },
        ]
        expect(amountsFromLines(chart, lines, 'acct_obe_0001')).toEqual({
            acct_bank_0002: '4,825.00',
            acct_fa_00003: '-422.50',
            acct_ap_00001: '592.00',
            acct_cc_00001: '-10.00',
        })
    })

    it('centsFromAmounts drops empty, zero and unparsable text', () => {
        expect(centsFromAmounts({ a: '1,234.50', b: '', c: '0', d: 'abc', e: '-250' })).toEqual({
            a: 123450,
            e: -25000,
        })
    })
})

describe('dates and memo', () => {
    it('words the memo from the date', () => {
        expect(memoFor('2025-12-31')).toBe('Opening balances as of Dec 31, 2025')
        expect(memoFor('2025-1')).toBe('Opening balances')
        expect(memoFor('')).toBe('Opening balances')
    })

    it('labels only real days', () => {
        expect(dayLabel('2025-02-30')).toBe('')
        expect(dayLabel('2025-12-31')).toBe('Dec 31, 2025')
    })

    it('applies the leap year rule', () => {
        expect(isIsoDay('2024-02-29')).toBe(true)
        expect(isIsoDay('2025-02-29')).toBe(false)
        expect(isIsoDay('31/12/2025')).toBe(false)
        expect(isIsoDay('2000-02-29')).toBe(true)
        expect(isIsoDay('2100-02-29')).toBe(false)
        expect(isIsoDay('2025-13-01')).toBe(false)
        expect(isIsoDay('2025-12-00')).toBe(false)
    })

    it('treats a blank memo as untouched', () => {
        expect(effectiveMemo('', '2025-12-31')).toBe(memoFor('2025-12-31'))
        expect(effectiveMemo('My memo', '2025-12-31')).toBe('My memo')
    })

    it('computes preset dates', () => {
        expect(presetDate('last-fiscal-year', '2026-10-24', 1)).toBe('2025-12-31')
        expect(presetDate('last-fiscal-year', '2026-10-24', 4)).toBe('2026-03-31')
        expect(presetDate('last-month', '2026-10-24', 1)).toBe('2026-09-30')
    })
})

describe('openingScreenState', () => {
    const entry = (status: string): OpeningEntryRow => ({
        id: `e_${status}`,
        date: '2025-12-31',
        memo: '',
        status,
        number: status === 'posted' ? 'JE-1046' : '',
        replaces: '',
    })
    const base = {
        isReady: true,
        isError: false,
        canRead: true,
        hasBalanceSheetAccounts: true,
        entries: [] as OpeningEntryRow[],
        isEditing: false,
    }
    const kind = (over: Partial<typeof base>) => openingScreenState({ ...base, ...over }).kind

    it('orders the early states', () => {
        expect(kind({ isReady: false })).toBe('loading')
        expect(kind({ isReady: false, isError: true })).toBe('error')
        expect(kind({ canRead: false })).toBe('no-access')
        expect(kind({ hasBalanceSheetAccounts: false })).toBe('empty-chart')
    })

    it('lets error win over no-access, and no-access win over an empty chart', () => {
        expect(kind({ isError: true, canRead: false })).toBe('error')
        expect(kind({ canRead: false, hasBalanceSheetAccounts: false })).toBe('no-access')
    })

    it('is new when the only entry is void or another status', () => {
        // The screen queries non-void rows only; a void original never blocks a new opening.
        expect(kind({ entries: [entry('void')] })).toBe('new')
    })

    it('is new with no entries', () => {
        expect(kind({})).toBe('new')
    })

    it('shows a draft, a posted entry, and a replacement', () => {
        expect(openingScreenState({ ...base, entries: [entry('draft')] })).toEqual({
            kind: 'draft',
            entry: entry('draft'),
        })
        expect(kind({ entries: [entry('posted')] })).toBe('posted')
        expect(kind({ entries: [entry('posted')], isEditing: true })).toBe('replace')
    })

    it('lets a draft win over a posted entry', () => {
        const entries = [entry('posted'), entry('draft')]
        expect(kind({ entries })).toBe('draft')
        expect(kind({ entries, isEditing: true })).toBe('draft')
    })
})

describe('viewEntryHref', () => {
    it('is null without an available entries item', () => {
        expect(viewEntryHref([{ id: 'entries', available: false }], 'e1')).toBeNull()
        expect(viewEntryHref([], 'e1')).toBeNull()
    })

    it('links to the entry when entries is available', () => {
        expect(viewEntryHref([{ id: 'entries', available: true }], 'e1')).toBe('books/entries/e1')
    })
})

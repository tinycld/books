import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { rangeWords } from '@tinycld/core/reports/lib/dates'
import { DESKTOP } from './account-register-helpers'
import {
    browserToday,
    choosePeriod,
    dayWords,
    openReportAccount,
    openSalesTaxLiability,
    type ReportSnapshot,
    reportLinesUnder,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import { uniqueMemo } from './invoice-helpers'
import {
    customerWithInvoices,
    openNewPayment,
    PAYMENT_URL,
    pickPaymentCustomer,
    rowAmount,
} from './receive-payment-helpers'

// The Method param on the Sales Tax Liability (pay-bills spec §3.10, Q3): a taxable invoice
// of 800.00 (under 1,000: fillInvoice reads the amount back without a thousands
// separator) dated in August 2026, 540.00 of it received today. On Accrual August shows the
// invoice's tax; on Cash August shows none of it (taken out at the invoice date) and a
// period of today shows the payment's share (tax × paid ÷ total, within a cent).
//
// The month: 2026-08. `command grep -rln "2026-08" tests/e2e` names only
// books-report-helpers.ts (GL_DAY_1 / GL_DAY_2), whose General Ledger spec posts journal
// entries on its own accounts: no other spec or seed posts a taxed sale in August, so its
// Sales Tax Liability holds only this spec's invoices (one per run). Other workers post
// taxable invoices today, so the test reads only the drill rows of its own invoice number,
// never an agency total. Which rate taxes the invoice is customerWithInvoices' choice: the
// test opens every rate row of August and keeps the rates that list its invoice.
//
// The table is a FlashList: only the rows near its view are mounted, and on the today period
// a rate lists every other worker's taxed documents too. So every read scrolls the list from
// its top to its Total, screen by screen, and keeps each row it saw (readTable), and each
// wait holds until the invoice's own row shows under every rate.

const MONTH_FROM = '2026-08-01'
const MONTH_TO = '2026-08-31'
const INVOICE_DAY = '2026-08-25'

// 800.00 invoiced, 540.00 received (cents).
const SALE = 80_000
const PAID = 54_000

type Row = ReportSnapshot['rows'][number]

// A figure cell's text in cents: "$1,200.00" and "1,200.00" → 120000, "-12.00" and
// "(12.00)" negative; 0 for a blank cell.
function cents(text: string | undefined): number {
    const value = (text ?? '').trim()
    if (value === '') return 0
    const isNegative = /^[-−(]/.test(value) || value.endsWith(')')
    const digits = value.replace(/[^0-9.]/g, '')
    if (!/^\d+(\.\d{1,2})?$/.test(digits)) throw new Error(`not an amount: "${text}"`)
    const [whole, fraction = ''] = digits.split('.')
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
    return isNegative ? -amount : amount
}

function rateRows(snapshot: ReportSnapshot): Row[] {
    return snapshot.rows.filter(row => row.kind === 'group' && row.depth === 1)
}

// Every row of the report table, top to its Total, in ONE page.evaluate: read the rows in
// view (label, outline depth and cells, as reportSnapshot reads them), scroll a screen, wait
// two frames, repeat. Each row is kept with its place in the list's content and the rows are
// returned in that order. A live re-run can land between two screens (other workers post
// taxed documents today): a kept row that shows other text or cells or moved starts the read
// again from the top, so the rows returned are one run's. Ends with the list at its top, so
// the rate rows can be pressed.
function readRows(page: Page): Promise<Row[]> {
    return page.evaluate(async () => {
        type Read = {
            id: string
            kind: Row['kind']
            depth: number
            label: string
            cells: Record<string, string>
            at: number
        }
        const frames = () =>
            new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const kindOf = (id: string): Row['kind'] | null => {
            if (id.startsWith('g:')) return 'group'
            if (id.startsWith('d:')) return 'detail'
            if (id.startsWith('s:')) return 'subtotal'
            if (id.startsWith('c:')) return 'computed'
            if (id.startsWith('total')) return 'total'
            return null
        }
        const table = () => document.querySelector('[data-testid="report-table"]')
        const listOf = (): HTMLElement | null => {
            let list = table()?.querySelector('[data-testid^="report-row-"]')?.parentElement ?? null
            while (list && getComputedStyle(list).overflowY !== 'auto') list = list.parentElement
            return list
        }
        const screen = (list: HTMLElement | null): Read[] => {
            const cells = new Map<string, Record<string, string>>()
            for (const cell of table()?.querySelectorAll('[data-testid^="report-cell-"]') ?? []) {
                const rest = (cell.getAttribute('data-testid') ?? '').slice('report-cell-'.length)
                const dash = rest.indexOf('-')
                const id = rest.slice(dash + 1)
                const row = cells.get(id) ?? {}
                row[rest.slice(0, dash)] = (cell as HTMLElement).innerText.trim()
                cells.set(id, row)
            }
            const view = list?.getBoundingClientRect()
            const origin = view ? view.top - (list?.scrollTop ?? 0) : 0
            const out: Read[] = []
            for (const element of table()?.querySelectorAll('[data-testid^="report-row-"]') ?? []) {
                const rect = element.getBoundingClientRect()
                // Only the rows in view: the list keeps rows of an earlier run mounted away
                // from its view.
                if (view && (rect.bottom <= view.top || rect.top >= view.bottom)) continue
                const id = (element.getAttribute('data-testid') ?? '').slice('report-row-'.length)
                const kind = kindOf(id)
                if (!kind) continue
                const padding = Number.parseFloat(getComputedStyle(element).paddingLeft)
                out.push({
                    id,
                    kind,
                    depth: Math.round((padding - 16) / 16),
                    label: (element as HTMLElement).innerText.trim(),
                    cells: cells.get(id) ?? {},
                    at: Math.round(rect.top - origin),
                })
            }
            return out
        }
        const same = (a: Read, b: Read) =>
            a.label === b.label &&
            Math.abs(a.at - b.at) <= 1 &&
            JSON.stringify(a.cells) === JSON.stringify(b.cells)

        let kept = new Map<string, Read>()
        const restart = async () => {
            kept = new Map()
            const list = listOf()
            if (list) list.scrollTop = 0
            await frames()
        }
        await restart()
        for (let step = 0, restarts = 0; step < 500 && restarts < 10; step++) {
            const list = listOf()
            const rows = screen(list)
            if (!rows.every(row => !kept.has(row.id) || same(kept.get(row.id) as Read, row))) {
                restarts++
                await restart()
                continue
            }
            for (const row of rows) kept.set(row.id, row)
            if (!list || rows.some(row => row.kind === 'total')) break
            const before = list.scrollTop
            const atEnd = () => list.scrollTop + list.clientHeight >= list.scrollHeight - 1
            // While the list measures its new rows it can pull the scroll back: set it
            // again until it moves or the list's end is reached.
            for (let tries = 0; tries < 30 && list.scrollTop === before && !atEnd(); tries++) {
                list.scrollTop = before + list.clientHeight * 0.8
                await frames()
            }
            if (list.scrollTop === before) break
        }
        const list = listOf()
        if (list) list.scrollTop = 0
        await frames()
        return [...kept.values()]
            .sort((a, b) => a.at - b.at)
            .map(({ id, kind, depth, label, cells }) => ({ id, kind, depth, label, cells }))
    })
}

// The whole table as reportSnapshot reads its head, with every row from readRows.
async function readTable(page: Page): Promise<ReportSnapshot> {
    const rows = await readRows(page)
    return { ...(await reportSnapshot(page)), rows }
}

// The tax of each of the invoice's own document rows under each rate, in cents, top to
// bottom: rates that list no row of it are left out.
function invoiceTaxRows(snapshot: ReportSnapshot, number: string): Map<string, number[]> {
    const label = new RegExp(`· Invoice ${number}(?: ·|$)`)
    const out = new Map<string, number[]>()
    for (const rate of rateRows(snapshot)) {
        const rows = reportLinesUnder(snapshot, rate.label).filter(row => label.test(row.label))
        if (rows.length > 0)
            out.set(
                rate.label,
                rows.map(row => cents(row.cells.tax))
            )
    }
    return out
}

function sum(values: readonly number[] | undefined): number {
    return (values ?? []).reduce((total, value) => total + value, 0)
}

// Opens each rate row of the run (or only `rates`) that is not open yet, and returns the
// whole table once every one of them shows its document rows and the invoice's own row
// shows under each (`rates`) or under one at least (every rate).
async function openRates(
    page: Page,
    number: string,
    rates?: readonly string[]
): Promise<ReportSnapshot> {
    await expect(page.getByTestId('report-table')).toBeVisible()
    const shown = await snapshotWhen(
        page,
        readTable,
        s => s.rows.some(row => row.kind === 'total'),
        'the report down to its Total'
    )
    const wanted = rates ?? rateRows(shown).map(row => row.label)
    for (const rate of wanted) {
        if (reportLinesUnder(shown, rate).length === 0) await openReportAccount(page, rate)
    }
    return snapshotWhen(
        page,
        readTable,
        s => {
            const listed = invoiceTaxRows(s, number)
            const isOpen = wanted.every(rate => reportLinesUnder(s, rate).length > 0)
            if (rates === undefined) return isOpen && listed.size > 0
            return isOpen && rates.every(rate => listed.has(rate))
        },
        `Invoice ${number}'s rows under ${wanted.join(', ')}`
    )
}

test.describe('pay-bills: sales tax liability on cash', () => {
    test('an invoice part-paid today counts its tax on Cash only as far as it is paid', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)

        const { name, invoices } = await customerWithInvoices(page, [
            { rate: '800.00', dueDate: INVOICE_DAY, date: INVOICE_DAY, taxable: true },
        ])
        const [invoice] = invoices

        // 540.00 of the invoice received today.
        await openNewPayment(page)
        await pickPaymentCustomer(page, name)
        await rowAmount(page, invoice.id).fill('540.00')
        await page.getByTestId('payment-memo').fill(uniqueMemo('Cash tax payment'))
        await page.getByTestId('payment-post').click()
        await expect(page).toHaveURL(PAYMENT_URL)
        await expect(page.getByTestId('payment-read-only')).toBeVisible()

        // Accrual, August: the invoice's tax, on its own date.
        await openSalesTaxLiability(page)
        await choosePeriod(page, { from: MONTH_FROM, to: MONTH_TO })
        await expect(page.getByTestId('report-document-period')).toHaveText(
            rangeWords(MONTH_FROM, MONTH_TO)
        )
        const basis = page.getByTestId('report-header-param-method')
        await expect(basis).toHaveText('Accrual basis')
        const accrual = invoiceTaxRows(await openRates(page, invoice.number), invoice.number)
        const rates = [...accrual.keys()]
        expect(
            rates.length,
            `the rates that list Invoice ${invoice.number} in August`
        ).toBeGreaterThan(0)
        const tax = sum([...accrual.values()].flat())
        expect(tax, `Invoice ${invoice.number}'s tax on Accrual (cents)`).toBeGreaterThan(0)
        expect(tax, 'the tax of 800.00 at a rate under 100% (cents)').toBeLessThan(SALE)

        // Cash, August: none of it; the header says so. Under each rate the invoice shows
        // twice: its tax line (+X) and the cash row that takes it out at the invoice date (−X).
        await page.getByTestId('report-param-method').click()
        await page.getByTestId('report-filter-option-cash').click()
        await expect(basis).toHaveText('Cash basis')
        await expect(page.getByTestId('report-param-method')).toContainText('Cash')
        const cashMonth = invoiceTaxRows(
            await openRates(page, invoice.number, rates),
            invoice.number
        )
        for (const rate of rates) {
            const whole = sum(accrual.get(rate))
            expect(
                [...(cashMonth.get(rate) ?? [])].sort((a, b) => b - a),
                `Invoice ${invoice.number}'s rows under ${rate} in August on Cash: its tax and the tax taken out (cents)`
            ).toEqual([whole, -whole])
            expect(
                sum(cashMonth.get(rate)),
                `Invoice ${invoice.number}'s tax under ${rate} in August on Cash (cents)`
            ).toBe(0)
        }

        // Cash, today: the payment's share of each rate's tax, tax × paid ÷ total.
        const today = await browserToday(page)
        await choosePeriod(page, { from: today, to: today })
        await expect(page.getByTestId('report-document-period')).toHaveText(dayWords(today))
        await expect(basis).toHaveText('Cash basis')
        const cashToday = invoiceTaxRows(
            await openRates(page, invoice.number, rates),
            invoice.number
        )
        const total = SALE + tax
        for (const rate of rates) {
            const share = sum(cashToday.get(rate))
            const whole = sum(accrual.get(rate))
            expect(share, `the payment's share under ${rate} (cents)`).toBeGreaterThan(0)
            expect(
                Math.abs(share * total - whole * PAID),
                `the payment's share under ${rate}: ${share} within a cent of ${whole} × ${PAID} ÷ ${total}`
            ).toBeLessThan(total)
        }
    })
})

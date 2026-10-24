import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    accountItem,
    DESKTOP,
    openChart,
    openRegister,
    REGISTER_SEED,
} from './account-register-helpers'

// Journal entry creation has no UI until `p1-journal-entries`, so the register
// has nothing it can create through the UI. The entries it reads are posted by
// `seed.ts` through the server's posting hook (dated relative to today, so the
// spec never depends on the calendar). That is the seeded-fixture exception:
// the interaction under test (reading and sorting the register table) is
// driven through the UI; only the pre-existing ledger state is seeded. The
// spec writes nothing. It does not cover the phone layout or keyboard
// activation of a row (checkpoint 5), a blank Ref no. (every seeded entry has
// a number) or a negative running balance (the seeded Business Checking
// balance never goes below zero). All data is read through the UI.

const MONEY = /\$[\d,]+\.\d{2}/
const ROWS = '[data-testid^="register-row-"]'
const HEADINGS = ['Date', 'Ref no.', 'Type', 'Memo', 'Account', 'Debit', 'Credit', 'Balance']

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
    const box = await locator.boundingBox()
    if (!box) throw new Error('element has no layout box')
    return box
}

function cents(text: string): number {
    const match = text.match(/\$([\d,]+)\.(\d{2})/)
    if (!match) return 0
    const value = Number(match[1].replace(/,/g, '')) * 100 + Number(match[2])
    return /[-−]/.test(text) ? -value : value
}

async function openChecking(page: Page, preset: string) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
    await openRegister(page, 'Business Checking')
    await page.getByTestId('register-range').click()
    await page.getByRole('menuitem', { name: preset, exact: true }).click()
    await expect(page.getByTestId('register-range')).toContainText(preset)
    await expect(page.getByTestId('register-table')).toBeVisible()
}

function rows(page: Page) {
    return page.locator(ROWS)
}

function rowByMemo(page: Page, memo: string) {
    return rows(page).filter({ hasText: memo })
}

async function rowIds(page: Page): Promise<string[]> {
    return rows(page).evaluateAll(els => els.map(el => el.getAttribute('data-testid') ?? ''))
}

async function cell(page: Page, column: string, rowTestId: string) {
    const lineId = rowTestId.replace('register-row-', '')
    return page.getByTestId(`register-cell-${column}-${lineId}`)
}

async function cellText(page: Page, column: string, rowTestId: string) {
    return (await (await cell(page, column, rowTestId)).innerText()).trim()
}

async function hasScrollingAncestor(locator: Locator) {
    return locator.evaluate(el => {
        for (let node = el.parentElement; node; node = node.parentElement) {
            const overflowY = getComputedStyle(node).overflowY
            if (overflowY === 'auto' || overflowY === 'scroll') return true
        }
        return false
    })
}

// The heading row has no test id of its own except the Date button, so each
// heading is the text element that shares the Date button's row.
async function headingBoxes(page: Page): Promise<Record<string, Box>> {
    const date = await boxOf(page.getByTestId('register-sort-date'))
    const found: Record<string, Box> = { Date: date }
    for (const label of HEADINGS.slice(1)) {
        const candidates = page.getByText(label, { exact: true })
        const count = await candidates.count()
        for (let i = 0; i < count; i++) {
            const box = await candidates.nth(i).boundingBox()
            if (box && box.y < date.y + date.height && box.y + box.height > date.y) {
                found[label] = box
                break
            }
        }
    }
    return found
}

test.describe('account-register: wide table', () => {
    test('columns and seeded rows', async ({ page }) => {
        await openChecking(page, 'This month')

        const boxes = await headingBoxes(page)
        expect(Object.keys(boxes)).toEqual(HEADINGS)
        const xs = HEADINGS.map(label => boxes[label].x)
        expect(xs).toEqual([...xs].sort((a, b) => a - b))

        for (const memo of [
            REGISTER_SEED.sale,
            REGISTER_SEED.split,
            REGISTER_SEED.voidOriginal,
            REGISTER_SEED.corrected,
        ]) {
            await expect(rowByMemo(page, memo)).toHaveCount(1)
        }

        const sale = (await rowIds(page)).filter(Boolean)
        expect(sale.length).toBeGreaterThanOrEqual(4)
        const saleId = (await rowByMemo(page, REGISTER_SEED.sale).getAttribute('data-testid')) ?? ''
        expect(await cellText(page, 'ref', saleId)).toMatch(/\S/)
        expect(await cellText(page, 'type', saleId)).toBe('Journal entry')
        expect(await cellText(page, 'account', saleId)).toBe('Accounts receivable')
        expect(await cellText(page, 'debit', saleId)).toMatch(MONEY)
        expect(await cellText(page, 'credit', saleId)).toBe('')
    })

    test('split, void and corrected rows', async ({ page }) => {
        await openChecking(page, 'This month')

        const splitId =
            (await rowByMemo(page, REGISTER_SEED.split).getAttribute('data-testid')) ?? ''
        expect(await cellText(page, 'account', splitId)).toBe('-Split-')
        expect(await cellText(page, 'credit', splitId)).toMatch(MONEY)

        const voidId =
            (await rowByMemo(page, REGISTER_SEED.voidOriginal).getAttribute('data-testid')) ?? ''
        expect(await cellText(page, 'type', voidId)).toContain('Void')

        await expect(
            page.locator('[data-testid^="register-cell-type-"]').filter({
                hasText: /^Void reversal of /,
            })
        ).not.toHaveCount(0)

        const correctedId =
            (await rowByMemo(page, REGISTER_SEED.corrected).getAttribute('data-testid')) ?? ''
        expect(await cellText(page, 'type', correctedId)).toBe('Journal entry')
    })

    test('sort order and the opening balance row', async ({ page }) => {
        await openChecking(page, 'This fiscal year')

        const newestFirst = await rowIds(page)
        expect(newestFirst.length).toBeGreaterThan(1)
        const first = await cellText(page, 'date', newestFirst[0])
        const last = await cellText(page, 'date', newestFirst[newestFirst.length - 1])
        expect(Date.parse(first)).toBeGreaterThanOrEqual(Date.parse(last))

        const opening = page.getByTestId('register-opening-row')
        await expect(opening).toBeVisible()
        const openingText = await opening.innerText()
        expect((await boxOf(opening)).y).toBeGreaterThan((await boxOf(rows(page).last())).y)
        const lastId = newestFirst[newestFirst.length - 1]
        const lastDebit = cents(await cellText(page, 'debit', lastId))
        const lastCredit = cents(await cellText(page, 'credit', lastId))
        expect(cents(await cellText(page, 'balance', lastId))).toBe(
            cents(openingText) + lastDebit - lastCredit
        )

        await page.getByTestId('register-sort-date').click()
        await expect.poll(() => rowIds(page)).toEqual([...newestFirst].reverse())
        expect((await boxOf(opening)).y).toBeLessThan((await boxOf(rows(page).first())).y)
        const oldestId = [...newestFirst].reverse()[0]
        const oldestDebit = cents(await cellText(page, 'debit', oldestId))
        const oldestCredit = cents(await cellText(page, 'credit', oldestId))
        expect(cents(await cellText(page, 'balance', oldestId))).toBe(
            cents(openingText) + oldestDebit - oldestCredit
        )

        await page.getByTestId('register-sort-date').click()
        await expect.poll(() => rowIds(page)).toEqual(newestFirst)
    })

    test('running balance', async ({ page }) => {
        await openChecking(page, 'This month')

        const ids = await rowIds(page)
        expect(ids.length).toBeGreaterThan(1)
        for (let i = 0; i < ids.length - 1; i++) {
            const newer = ids[i]
            const older = ids[i + 1]
            const delta =
                cents(await cellText(page, 'debit', newer)) -
                cents(await cellText(page, 'credit', newer))
            const diff =
                cents(await cellText(page, 'balance', newer)) -
                cents(await cellText(page, 'balance', older))
            expect(diff).toBe(delta)
        }
        const ending = await page.getByTestId('register-ending-balance').innerText()
        expect(cents(await cellText(page, 'balance', ids[0]))).toBe(cents(ending))

        await page.getByTestId('register-sort-date').click()
        await expect.poll(() => rowIds(page)).toEqual([...ids].reverse())
        const oldestFirst = await rowIds(page)
        for (let i = 0; i < oldestFirst.length - 1; i++) {
            const older = oldestFirst[i]
            const newer = oldestFirst[i + 1]
            const delta =
                cents(await cellText(page, 'debit', newer)) -
                cents(await cellText(page, 'credit', newer))
            const diff =
                cents(await cellText(page, 'balance', newer)) -
                cents(await cellText(page, 'balance', older))
            expect(diff).toBe(delta)
        }
    })

    test('layout by bounding boxes', async ({ page }) => {
        await openChecking(page, 'This month')

        const table = page.getByTestId('register-table')
        await expect(table.locator('a')).toHaveCount(0)

        for (const column of ['debit', 'credit', 'balance']) {
            const boxes = await page
                .locator(`[data-testid^="register-cell-${column}-"]`)
                .evaluateAll(els =>
                    els.map(el => {
                        const r = el.getBoundingClientRect()
                        return { width: Math.round(r.width), right: Math.round(r.right) }
                    })
                )
            expect(boxes.length).toBeGreaterThan(1)
            expect(new Set(boxes.map(b => b.width)).size).toBe(1)
            expect(new Set(boxes.map(b => b.right)).size).toBe(1)
        }

        const heights = await rows(page).evaluateAll(els =>
            els.map(el => el.getBoundingClientRect().height)
        )
        for (const height of heights) expect(height).toBeGreaterThanOrEqual(44)

        const sort = await boxOf(page.getByTestId('register-sort-date'))
        const firstRow = await boxOf(rows(page).first())
        expect(sort.y + sort.height).toBeLessThanOrEqual(firstRow.y)

        expect(await hasScrollingAncestor(page.getByTestId('register-title'))).toBe(false)
        expect(await hasScrollingAncestor(page.getByTestId('register-sort-date'))).toBe(false)
        expect(await hasScrollingAncestor(rows(page).first())).toBe(true)
    })

    test('at 1280 the table fits without sideways scroll and Balance is not clipped', async ({
        page,
    }) => {
        await openChecking(page, 'This fiscal year')
        const table = page.getByTestId('register-table')
        const fits = await table.evaluate(el => {
            for (let node: HTMLElement | null = el; node; node = node.parentElement) {
                const overflowX = getComputedStyle(node).overflowX
                if (
                    (overflowX === 'auto' || overflowX === 'scroll') &&
                    node.scrollWidth > node.clientWidth
                )
                    return false
            }
            return true
        })
        expect(fits).toBe(true)

        const limit = Math.min(
            (await boxOf(table)).x + (await boxOf(table)).width,
            await page.evaluate(() => window.innerWidth)
        )
        const edges = async (locator: Locator) =>
            locator.evaluateAll(els => els.map(el => el.getBoundingClientRect().right))
        const balanceCells = page.locator('[data-testid^="register-cell-balance-"]')
        const rights = await edges(balanceCells)
        expect(rights.length).toBeGreaterThan(1)
        for (const right of rights) expect(right).toBeLessThanOrEqual(limit + 0.5)
        const heading = (await headingBoxes(page)).Balance
        expect(heading.x + heading.width).toBeLessThanOrEqual(limit + 0.5)
        const openingBalance = page.getByTestId('register-opening-row').locator('text=/\\$/').last()
        const openingBox = await boxOf(openingBalance)
        expect(openingBox.x + openingBox.width).toBeLessThanOrEqual(limit + 0.5)

        const texts = await balanceCells.evaluateAll(els =>
            els.map(el => (el as HTMLElement).innerText.trim())
        )
        for (const text of texts) expect(text).toMatch(/^-?\$[\d,]+\.\d{2}$/)
        expect((await openingBalance.innerText()).trim()).toMatch(/^-?\$[\d,]+\.\d{2}$/)
    })

    test('headings share the right edge of their cells', async ({ page }) => {
        await openChecking(page, 'This month')
        const boxes = await headingBoxes(page)
        const id = (await rowByMemo(page, REGISTER_SEED.sale).getAttribute('data-testid')) ?? ''
        for (const [label, column] of [
            ['Debit', 'debit'],
            ['Credit', 'credit'],
            ['Balance', 'balance'],
        ] as const) {
            const cellBox = await boxOf(await cell(page, column, id))
            expect(Math.round(boxes[label].x + boxes[label].width)).toBe(
                Math.round(cellBox.x + cellBox.width)
            )
        }
    })

    test('headings stay aligned with cells when scrollbars take layout space', async ({ page }) => {
        await openChecking(page, 'This fiscal year')
        await page.addStyleTag({
            content:
                '*::-webkit-scrollbar { width: 15px; height: 15px; } *::-webkit-scrollbar-thumb { background: #888 }',
        })
        await page.setViewportSize({ width: 1280, height: 520 })
        const scroller = await rows(page)
            .first()
            .evaluate(el => {
                for (let node = el.parentElement; node; node = node.parentElement) {
                    const overflowY = getComputedStyle(node).overflowY
                    if (overflowY === 'auto' || overflowY === 'scroll') {
                        return {
                            overflows: node.scrollHeight > node.clientHeight,
                            gutter: node.offsetWidth - node.clientWidth,
                        }
                    }
                }
                return { overflows: false, gutter: 0 }
            })
        expect(scroller.overflows).toBe(true)
        expect(scroller.gutter).toBeGreaterThan(0)
        const boxes = await headingBoxes(page)
        const id = (await rowByMemo(page, REGISTER_SEED.sale).getAttribute('data-testid')) ?? ''
        for (const [label, column] of [
            ['Debit', 'debit'],
            ['Credit', 'credit'],
            ['Balance', 'balance'],
        ] as const) {
            const cellBox = await boxOf(await cell(page, column, id))
            expect(Math.round(boxes[label].x + boxes[label].width)).toBe(
                Math.round(cellBox.x + cellBox.width)
            )
        }
        for (const [label, column] of [
            ['Memo', 'memo'],
            ['Account', 'account'],
        ] as const) {
            const cellBox = await boxOf(await cell(page, column, id))
            expect(Math.round(boxes[label].x)).toBe(Math.round(cellBox.x))
        }
    })

    test('narrow desktop keeps the amount columns and the Memo and Account minimums', async ({
        page,
    }) => {
        await openChecking(page, 'This month')
        const id = (await rowByMemo(page, REGISTER_SEED.sale).getAttribute('data-testid')) ?? ''
        const amounts = ['debit', 'credit', 'balance']
        const wide: number[] = []
        for (const column of amounts) wide.push((await boxOf(await cell(page, column, id))).width)

        await page.setViewportSize({ width: 1024, height: 800 })
        await expect(page.getByTestId('register-table')).toBeVisible()

        for (const [i, column] of amounts.entries()) {
            const width = (await boxOf(await cell(page, column, id))).width
            expect(Math.round(width)).toBe(Math.round(wide[i]))
        }
        expect(await cellText(page, 'memo', id)).not.toBe('')
        expect(await cellText(page, 'account', id)).not.toBe('')
        expect((await boxOf(await cell(page, 'memo', id))).width).toBeGreaterThanOrEqual(100)
        expect((await boxOf(await cell(page, 'account', id))).width).toBeGreaterThanOrEqual(90)
    })

    test('ending balance and the Chart of Accounts both show money', async ({ page }) => {
        await openChecking(page, 'This fiscal year')
        await expect(page.getByTestId('register-ending-balance')).toHaveText(MONEY)

        await openChart(page)
        await expect(accountItem(page, 'Business Checking')).toContainText(MONEY)
    })
})

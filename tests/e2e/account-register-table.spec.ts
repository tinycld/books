import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP, openRegister, REGISTER_SEED } from './account-register-helpers'

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

test.describe('account-register: wide table', () => {
    test("the table shows each seeded entry's cells: plain, split, void, reversal and corrected", async ({
        page,
    }) => {
        await openChecking(page, 'This month')

        for (const memo of [
            REGISTER_SEED.sale,
            REGISTER_SEED.split,
            REGISTER_SEED.voidOriginal,
            REGISTER_SEED.corrected,
        ]) {
            await expect(rowByMemo(page, memo)).toHaveCount(1)
        }

        const saleId = (await rowByMemo(page, REGISTER_SEED.sale).getAttribute('data-testid')) ?? ''
        expect(await cellText(page, 'ref', saleId)).toMatch(/\S/)
        expect(await cellText(page, 'type', saleId)).toBe('Journal entry')
        expect(await cellText(page, 'account', saleId)).toBe('Accounts receivable')
        expect(await cellText(page, 'debit', saleId)).toMatch(MONEY)
        expect(await cellText(page, 'credit', saleId)).toBe('')

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

    test('sorting by date reverses rows and moves the opening row, and running balances chain from opening to ending', async ({
        page,
    }) => {
        await openChecking(page, 'This fiscal year')

        const newestFirst = await rowIds(page)
        expect(newestFirst.length).toBeGreaterThan(1)
        const first = await cellText(page, 'date', newestFirst[0])
        const oldestId = newestFirst[newestFirst.length - 1]
        const last = await cellText(page, 'date', oldestId)
        expect(Date.parse(first)).toBeGreaterThanOrEqual(Date.parse(last))

        const opening = page.getByTestId('register-opening-row')
        await expect(opening).toBeVisible()
        const openingText = await opening.innerText()
        expect((await boxOf(opening)).y).toBeGreaterThan((await boxOf(rows(page).last())).y)

        for (let i = 0; i < newestFirst.length - 1; i++) {
            const newer = newestFirst[i]
            const older = newestFirst[i + 1]
            const delta =
                cents(await cellText(page, 'debit', newer)) -
                cents(await cellText(page, 'credit', newer))
            const diff =
                cents(await cellText(page, 'balance', newer)) -
                cents(await cellText(page, 'balance', older))
            expect(diff).toBe(delta)
        }
        const ending = await page.getByTestId('register-ending-balance').innerText()
        expect(cents(await cellText(page, 'balance', newestFirst[0]))).toBe(cents(ending))
        const oldestDebit = cents(await cellText(page, 'debit', oldestId))
        const oldestCredit = cents(await cellText(page, 'credit', oldestId))
        expect(cents(await cellText(page, 'balance', oldestId))).toBe(
            cents(openingText) + oldestDebit - oldestCredit
        )

        await page.getByTestId('register-sort-date').click()
        await expect.poll(() => rowIds(page)).toEqual([...newestFirst].reverse())
        expect((await boxOf(opening)).y).toBeLessThan((await boxOf(rows(page).first())).y)

        await page.getByTestId('register-sort-date').click()
        await expect.poll(() => rowIds(page)).toEqual(newestFirst)
    })
})

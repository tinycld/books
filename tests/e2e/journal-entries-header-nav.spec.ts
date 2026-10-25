import { expect, type Locator, type Page, type Request, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { ENTRIES_SEED } from '../../tinycld/books/lib/journal-entries-fixture'
import {
    ACCOUNT_LABELS,
    createDraftEntry,
    DESKTOP,
    fillLine,
    holdRequests,
    isPhone,
    openEntriesList,
    PHONE,
    settleFrames,
} from './journal-entries-helpers'

// Entry header geometry at a phone and a desktop width, the leave-without-asking rule
// after a held save, and the Books sidebar's entries item (it replaces the current
// route instead of stacking a second entries list). The seeded posted entry is only
// opened; every draft is made through the new-entry form.

const ENTRY_RECORDS = '**/api/collections/books_journal_entries/records/*'
const NEAR_MAX = '$10,000,000,000,000.00'
const ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'
const CARDS = '[data-testid^="entries-card-"]'
const GUTTER = 16

function isDraftSave(request: Request) {
    return request.method() === 'PATCH' && !(request.postData() ?? '').includes('"status":"posted"')
}

async function start(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
}

function uniqueMemo(label: string) {
    return `${label} ${Date.now()}`
}

async function openFromList(page: Page, memo: string) {
    await openEntriesList(page)
    await page.getByTestId('entries-search').fill(memo)
    const item = page
        .locator(isPhone(page) ? CARDS : ROWS)
        .filter({ hasText: memo })
        .filter({ hasNotText: 'Reversal of' })
        .first()
    await item.click()
}

async function makeDraft(page: Page, memo: string, amount = '$10.00') {
    await createDraftEntry(page, {
        memo,
        amount,
        debitAccount: ACCOUNT_LABELS.checking,
        creditAccount: ACCOUNT_LABELS.equity,
    })
}

async function box(locator: Locator) {
    const found = await locator.boundingBox()
    if (!found) throw new Error('element has no box')
    return found
}

async function expectPhoneHeaderFits(page: Page) {
    const total = await box(page.getByTestId('entry-big-total'))
    expect(total.x + total.width).toBeLessThanOrEqual(PHONE.width - GUTTER)
    expect(total.x).toBeGreaterThanOrEqual(0)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(PHONE.width)
    const fits = await page
        .getByTestId('entry-title')
        .evaluate(el => el.scrollWidth <= el.clientWidth)
    expect(fits).toBe(true)
}

// Edits the saved draft so each side holds the near-maximum amount; the amount fields must
// accept it, so a rejected amount fails here instead of at the header.
async function enterNearMax(page: Page) {
    await fillLine(page, 0, { debit: NEAR_MAX })
    await fillLine(page, 1, { credit: NEAR_MAX })
    await expect(page.getByTestId('entry-big-total')).toContainText('10,000,000,000,000.00')
}

test.describe('journal-entries: header fits a phone with a near-maximum total', () => {
    test('a numbered posted entry', async ({ page }) => {
        await start(page, PHONE)
        await openFromList(page, ENTRIES_SEED.posted)
        await expect(page.getByTestId('entry-read-only')).toBeVisible()
        await expect(page.getByTestId('entry-title')).toHaveText(/^Journal entry JE-\d+$/)
        await expectPhoneHeaderFits(page)
    })

    test('a draft with $10,000,000,000,000.00 on each side', async ({ page }) => {
        await start(page, PHONE)
        await makeDraft(page, uniqueMemo('Near max header'))
        await enterNearMax(page)
        await expectPhoneHeaderFits(page)
    })

    test('a numbered entry posted with a near-maximum total', async ({ page }) => {
        await start(page, PHONE)
        await makeDraft(page, uniqueMemo('Near max posted'))
        await enterNearMax(page)
        await page.getByTestId('entry-post').click()
        await expect(page.getByTestId('entry-read-only')).toBeVisible()
        await expect(page.getByTestId('entry-title')).toHaveText(/^Journal entry JE-\d+$/)
        await expectPhoneHeaderFits(page)
    })
})

test.describe('journal-entries: desktop draft header is one row', () => {
    test('title, badge, total and More share a row without overlap', async ({ page }) => {
        await start(page, DESKTOP)
        await makeDraft(page, uniqueMemo('Desktop header row'))

        const boxes = [
            await box(page.getByTestId('entry-title')),
            await box(page.getByTestId('entry-badge')),
            await box(page.getByTestId('entry-big-total')),
            await box(page.getByTestId('entry-header-more')),
        ]
        const centers = boxes.map(b => b.y + b.height / 2)
        expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(12)
        const byX = [...boxes].sort((a, b) => a.x - b.x)
        for (let i = 1; i < byX.length; i += 1) {
            expect(byX[i].x).toBeGreaterThanOrEqual(byX[i - 1].x + byX[i - 1].width)
        }
    })
})

for (const [sizeName, size] of [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const) {
    test(`journal-entries: the header More button is a 44pt target (${sizeName})`, async ({
        page,
    }) => {
        await start(page, size)
        await makeDraft(page, uniqueMemo(`More target ${sizeName}`))
        const more = await box(page.getByTestId('entry-header-more'))
        expect(more.width).toBeGreaterThanOrEqual(44)
        expect(more.height).toBeGreaterThanOrEqual(44)
    })
}

test.describe('journal-entries: leaving after a held save', () => {
    test('back with no edits since Save draft leaves without the discard dialog', async ({
        page,
    }) => {
        await start(page, DESKTOP)
        const memo = uniqueMemo('Held save leave')
        await makeDraft(page, memo)
        const held = await holdRequests(page, ENTRY_RECORDS, isDraftSave)

        await page.getByTestId('entry-memo').fill(`${memo} edited`)
        await page.getByTestId('entry-save-draft').click()
        await held.firstHeld
        await page.getByTestId('entry-back').click()

        await expect(page.getByTestId('entries-screen')).toBeVisible()
        await settleFrames(page)
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        held.release()
    })
})

test.describe('journal-entries: sidebar entries item replaces, never stacks (desktop)', () => {
    test('from the list, one list stays and back leaves it', async ({ page }) => {
        await start(page, DESKTOP)
        await openEntriesList(page)
        const entries = page.getByTestId('entries-screen')

        await page.getByTestId('books-nav-entries').click()
        await settleFrames(page)
        await expect(entries).toHaveCount(1)

        await page.goBack()
        await expect(entries).toHaveCount(0)
    })
})

test.describe('journal-entries: reopening Books at an entry (desktop)', () => {
    test('openEntriesList leaves exactly one list, five times', async ({ page }) => {
        await start(page, DESKTOP)
        for (let i = 0; i < 5; i += 1) {
            await openFromList(page, ENTRIES_SEED.draft)
            await expect(page.getByTestId('entry-title')).toBeVisible()

            const fresh = await page.context().newPage()
            await login(fresh)
            await navigateToPackage(fresh, 'books')
            await fresh.setViewportSize(DESKTOP)
            await openEntriesList(fresh)
            await settleFrames(fresh)
            await expect(fresh.getByTestId('entries-screen')).toHaveCount(1)
            await fresh.close()
        }
    })
})

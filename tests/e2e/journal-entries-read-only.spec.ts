import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { ENTRIES_SEED } from '../../tinycld/books/lib/journal-entries-fixture'
import {
    DESKTOP,
    isPhone,
    openRegister,
    PHONE,
    REGISTER_SEED,
    revealRegisterItem,
} from './account-register-helpers'
import { searchEntries } from './journal-entries-helpers'

// Journal entries are created by the form in a later checkpoint, so this spec
// reads the one entry per lifecycle state that `seed.ts` posts through the
// server (dated today). That is the seeded-fixture exception: the interaction
// under test (opening an entry, reading its details, lines and links) is driven
// through the UI; only the pre-existing ledger state is seeded. The spec writes
// nothing. The posted entry and the register drawer run at both sizes because
// phones render the lines as cards and the drawer as an overlay.
//
// It does not cover: a read-only user (the seed has no read-only Books member,
// so "no actions for a reader" is covered by the pure `entryActions` tests); the
// "Replaces JE-n" link (`entry-link-replaces`) and the settled "Reversed on
// <date> by JE-n" auto-reverse text, because both need an entry made through the
// form, reversed or corrected (checkpoint 8 asserts them); a draft entry in this
// view (the editable form owns drafts from checkpoint 7). The void badge and the
// reversal links are asserted by `journal-entries-actions.spec.ts`.

const MONEY = /^\$[\d,]+\.\d{2}$/
const TITLE = /^Journal entry JE-\d+$/
const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

async function start(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
}

async function openEntries(page: Page) {
    if (isPhone(page)) {
        await page.getByTestId('books-list-card-entries').click()
    } else {
        const item = page.getByTestId('books-nav-entries')
        const toggle = page.getByTestId('books-nav-accounting-toggle')
        await toggle.waitFor({ state: 'attached' })
        if (!(await item.isVisible())) await toggle.click()
        await item.click()
    }
    await expect(page.getByTestId('entries-screen')).toBeVisible()
}

function entryRow(page: Page, memo: string): Locator {
    const prefix = isPhone(page) ? 'entries-card-' : 'entries-row-'
    const selector = `[data-testid^="${prefix}"]:not([data-testid^="entries-row-menu-"])`
    return page
        .locator(selector)
        .filter({ hasText: memo })
        .filter({ hasNotText: 'Reversal of' })
        .first()
}

// The list is windowed and newest first, so once other specs have created many
// entries a seeded one may sit outside the rendered rows; search finds it.
async function clickEntryRow(page: Page, memo: string) {
    await searchEntries(page, memo)
    await entryRow(page, memo).click()
}

async function openEntry(page: Page, memo: string) {
    await openEntries(page)
    await clickEntryRow(page, memo)
    await expect(page.getByTestId('entry-read-only')).toBeVisible()
}

// Seeded accounts as the register and chart label them: 'number name'.
const ACCOUNT_LABELS = { checking: '1000 Business Checking', equity: "3000 Owner's Equity" }
const SEED_POSTER = 'Test User'

for (const [sizeName, size] of SIZES) {
    test.describe(`journal-entries: read-only view (${sizeName})`, () => {
        test('posted entry: header, details, lines and balanced totals', async ({ page }) => {
            await start(page, size)
            await openEntry(page, ENTRIES_SEED.posted)

            const view = page.getByTestId('entry-read-only')
            await expect(page.getByTestId('entry-title')).toHaveText(TITLE)
            await expect(page.getByTestId('entry-badge')).toHaveText('Posted')
            await expect(page.getByTestId('entry-big-total')).toHaveText(MONEY)
            await expect(view).toContainText(ENTRIES_SEED.posted)
            await expect(view.getByText(/posted by/i).first()).toContainText(
                new RegExp(`${SEED_POSTER}, [A-Z][a-z]{2} \\d{1,2}, \\d{4}, \\d{1,2}:\\d{2}`)
            )

            await expect(
                page.locator(
                    '[data-testid^="entry-line-"]:not([data-testid^="entry-line-a"]):not([data-testid^="entry-line-d"]):not([data-testid^="entry-line-c"]):not([data-testid^="entry-line-m"])'
                )
            ).toHaveCount(2)
            await expect(page.getByTestId('entry-line-account-0')).toHaveText(
                ACCOUNT_LABELS.checking
            )
            await expect(page.getByTestId('entry-line-account-1')).toHaveText(ACCOUNT_LABELS.equity)

            const debits = [
                await page.getByTestId('entry-line-debit-0').innerText(),
                await page.getByTestId('entry-line-debit-1').innerText(),
            ]
            const credits = [
                await page.getByTestId('entry-line-credit-0').innerText(),
                await page.getByTestId('entry-line-credit-1').innerText(),
            ]
            expect(debits.filter(text => MONEY.test(text.trim()))).toHaveLength(1)
            expect(credits.filter(text => MONEY.test(text.trim()))).toHaveLength(1)
            expect(MONEY.test(debits[0].trim())).not.toBe(MONEY.test(credits[0].trim()))

            const totalDebits = (await page.getByTestId('entry-total-debits').innerText()).trim()
            const totalCredits = (await page.getByTestId('entry-total-credits').innerText()).trim()
            expect(totalDebits).toMatch(/\$[\d,]+\.\d{2}/)
            expect(totalDebits).toBe(totalCredits)
            await expect(page.getByTestId('entry-balance-status')).toHaveText('In balance')
        })

        test('register: the drawer links to the entry', async ({ page }) => {
            await start(page, size)
            await openRegister(page, 'Accounts receivable')
            await page.getByTestId('register-range').click()
            // This month holds the sale (dated today) and does not reload when another spec
            // changes the fiscal start month on the shared DB.
            await page.getByRole('menuitem', { name: 'This month', exact: true }).click()
            await expect(page.getByTestId('register-range')).toContainText('This month')

            // Other specs can post entries dated today on this account too, and those sort
            // above the sale, so the list scrolls until the sale mounts.
            const prefix = isPhone(page) ? 'register-card-' : 'register-row-'
            const sale = page
                .locator(`[data-testid^="${prefix}"]`)
                .filter({ hasText: REGISTER_SEED.sale })
            await revealRegisterItem(page, sale)
            await sale.click()
            await page.getByTestId('register-drawer-open-entry').click()
            await expect(page.getByTestId('entry-read-only')).toBeVisible()

            // Back returns to the register the entry was opened from, labelled for it.
            const entryUrl = page.url()
            await expect(page.getByTestId('entry-back')).toHaveText('Register')
            await page.getByTestId('entry-back').click()
            await expect(page.getByTestId('register-title')).toBeVisible()
            await expect(page.getByTestId('entry-read-only')).toHaveCount(0)
            await expect(page.getByTestId('entries-screen')).toHaveCount(0)

            // Back pops the entry off history; it must not reopen on goBack.
            await page.goBack()
            await expect(page).not.toHaveURL(entryUrl)
            await expect(page.getByTestId('entry-read-only')).toHaveCount(0)
        })
    })
}

test.describe('journal-entries: read-only view (desktop)', () => {
    test('opening: never a premature body, total or not-found flash', async ({ page }) => {
        await start(page, DESKTOP)
        await openEntries(page)

        // A MutationObserver sees every intermediate render, which polling would miss.
        await page.evaluate(poster => {
            const seen = {
                notFound: false,
                zeroTotal: false,
                balanceWithoutLines: false,
                bodyWithoutLines: false,
                blankOrUnknownAccount: false,
                stampWithoutName: false,
            }
            const text = (id: string) =>
                document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim()
            const check = () => {
                const has = (id: string) => !!document.querySelector(`[data-testid="${id}"]`)
                if (has('entry-not-found')) seen.notFound = true
                if (text('entry-total-debits') === '$0.00' || text('entry-big-total') === '$0.00')
                    seen.zeroTotal = true
                if (has('entry-balance-status') && !has('entry-line-0'))
                    seen.balanceWithoutLines = true
                if (has('entry-read-only') && !has('entry-line-0')) seen.bodyWithoutLines = true
                for (const el of document.querySelectorAll(
                    '[data-testid^="entry-line-account-"]'
                )) {
                    const label = el.textContent?.trim() ?? ''
                    if (label === '' || label === 'Unknown account')
                        seen.blankOrUnknownAccount = true
                }
                const stamp = text('entry-detail-posted-by')
                if (stamp && !stamp.includes(poster)) seen.stampWithoutName = true
            }
            new MutationObserver(check).observe(document.body, {
                subtree: true,
                childList: true,
                characterData: true,
                attributes: true,
            })
            Object.assign(window, { __entrySeen: seen })
        }, SEED_POSTER)

        await clickEntryRow(page, ENTRIES_SEED.posted)
        await expect(page.getByTestId('entry-not-found')).toHaveCount(0)
        await expect(page.getByTestId('entry-read-only')).toBeVisible()
        await expect(page.getByTestId('entry-line-0')).toBeVisible()
        await expect(page.getByTestId('entry-balance-status')).toHaveText('In balance')

        const bigTotal = page.getByTestId('entry-big-total')
        await expect(bigTotal).toHaveText(MONEY)
        await expect(page.getByTestId('entry-total-debits')).toHaveText(
            (await bigTotal.innerText()).trim()
        )
        await expect(bigTotal).not.toHaveText('$0.00')

        const seen = await page.evaluate(
            () => (window as unknown as { __entrySeen: Record<string, boolean> }).__entrySeen
        )
        expect(seen).toEqual({
            notFound: false,
            zeroTotal: false,
            balanceWithoutLines: false,
            bodyWithoutLines: false,
            blankOrUnknownAccount: false,
            stampWithoutName: false,
        })
    })

    test('opening a reversed entry: the reversed-by link is never missing early', async ({
        page,
    }) => {
        await start(page, DESKTOP)
        await openEntries(page)
        await page.evaluate(() => {
            const seen = { bodyWithoutReversedLink: false }
            new MutationObserver(() => {
                const has = (id: string) => !!document.querySelector(`[data-testid="${id}"]`)
                if (has('entry-read-only') && !has('entry-link-reversed-by'))
                    seen.bodyWithoutReversedLink = true
            }).observe(document.body, { subtree: true, childList: true, attributes: true })
            Object.assign(window, { __entrySeen: seen })
        })
        await clickEntryRow(page, ENTRIES_SEED.reversed)
        await expect(page.getByTestId('entry-link-reversed-by')).toBeVisible()
        const seen = await page.evaluate(
            () => (window as unknown as { __entrySeen: Record<string, boolean> }).__entrySeen
        )
        expect(seen).toEqual({ bodyWithoutReversedLink: false })
    })

    test('opening an auto-reverse entry: the date reads "Will reverse on <date>" from the first render', async ({
        page,
    }) => {
        await start(page, DESKTOP)
        await openEntries(page)
        await page.evaluate(() => {
            const seen = { notWillReverse: false }
            new MutationObserver(() => {
                const value = document
                    .querySelector('[data-testid="entry-auto-reverse"]')
                    ?.textContent?.trim()
                if (value !== undefined && !value.startsWith('Will reverse on'))
                    seen.notWillReverse = true
            }).observe(document.body, {
                subtree: true,
                childList: true,
                characterData: true,
            })
            Object.assign(window, { __entrySeen: seen })
        })
        await clickEntryRow(page, ENTRIES_SEED.auto)
        await expect(page.getByTestId('entry-auto-reverse')).toHaveText(
            /^Will reverse on [A-Z][a-z]{2} \d{1,2}, \d{4}$/
        )
        const seen = await page.evaluate(
            () => (window as unknown as { __entrySeen: Record<string, boolean> }).__entrySeen
        )
        expect(seen).toEqual({ notWillReverse: false })
    })

    test('back: returns to the list and pops browser history', async ({ page }) => {
        await start(page, DESKTOP)
        await openEntry(page, ENTRIES_SEED.posted)
        const entryUrl = page.url()

        await page.getByTestId('entry-back').click()
        await expect(page.getByTestId('entries-screen')).toBeVisible()
        await expect(page.getByTestId('entry-read-only')).toHaveCount(0)

        // Back must pop the entry off history, not push the list on top of it.
        await page.goBack()
        await expect(page).not.toHaveURL(entryUrl)
        await expect(page.getByTestId('entry-read-only')).toHaveCount(0)
    })

    test('void details: voided by carries a date-time', async ({ page }) => {
        await start(page, DESKTOP)
        await openEntry(page, ENTRIES_SEED.voided)

        const voided = page.getByTestId('entry-read-only').getByText(/voided by/i)
        await expect(voided.first()).toContainText(/\d{1,2}:\d{2}/)
    })

    test('not found: an unknown id shows the message and a way back', async ({ page }) => {
        await start(page, DESKTOP)
        await openEntries(page)

        await page.evaluate(url => {
            window.history.pushState({}, '', url)
            window.dispatchEvent(new PopStateEvent('popstate'))
        }, '/a/books/entries/doesnotexist0000')

        await expect(page.getByTestId('entry-not-found')).toContainText('This entry does not exist')
        await page.getByTestId('entry-back').click()
        await expect(page.getByTestId('entries-screen')).toBeVisible()
    })
})

test.describe('journal-entries: read-only view (phone New button)', () => {
    test('the New button hides on an entry and shows again on the list', async ({ page }) => {
        await start(page, PHONE)
        await openEntry(page, ENTRIES_SEED.posted)
        await expect(page.getByLabel('New', { exact: true })).toHaveCount(0)

        await page.getByTestId('entry-back').click()
        await expect(page.getByTestId('entries-screen')).toBeVisible()
        await expect(page.getByLabel('New', { exact: true })).toBeVisible()
    })
})

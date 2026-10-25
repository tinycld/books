import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { ENTRIES_SEED } from '../../tinycld/books/lib/journal-entries-fixture'
import {
    DESKTOP,
    isPhone,
    openRegister,
    PHONE,
    REGISTER_SEED,
    settledBox,
} from './account-register-helpers'

// Journal entries are created by the form in a later checkpoint, so this spec
// reads the one entry per lifecycle state that `seed.ts` posts through the
// server (dated today). That is the seeded-fixture exception: the interaction
// under test (opening an entry, reading its details, lines and links) is driven
// through the UI; only the pre-existing ledger state is seeded. The spec writes
// nothing.
//
// It does not cover: a read-only user (the seed has no read-only Books member,
// so "no actions for a reader" is covered by the pure `entryActions` tests); the
// "Replaces JE-n" link (`entry-link-replaces`) and the settled "Reversed on
// <date> by JE-n" auto-reverse text, because both need an entry made through the
// form, reversed or corrected (checkpoint 8 asserts them); a draft entry in this
// view (the editable form owns drafts from checkpoint 7).

const MONEY = /^\$[\d,]+\.\d{2}$/
const TITLE = /^Journal entry JE-\d+$/
const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
    const box = await settledBox(locator)
    if (!box) throw new Error('element has no layout box')
    return box
}

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

async function openEntry(page: Page, memo: string) {
    await openEntries(page)
    await entryRow(page, memo).click()
    await expect(page.getByTestId('entry-read-only')).toBeVisible()
}

// Seeded accounts as the register and chart label them: 'number name'.
const ACCOUNT_LABELS = { checking: '1000 Business Checking', equity: "3000 Owner's Equity" }
const SEED_POSTER = 'Test User'

function hasScrollableAncestor(locator: Locator): Promise<boolean> {
    return locator.evaluate(el => {
        for (let node = el.parentElement; node; node = node.parentElement) {
            const style = getComputedStyle(node)
            const scrolls = style.overflowY === 'auto' || style.overflowY === 'scroll'
            const isHorizontal = style.overflowX === 'auto' || style.overflowX === 'scroll'
            if (scrolls || isHorizontal) return true
        }
        return false
    })
}

for (const [sizeName, size] of SIZES) {
    test.describe(`journal-entries: read-only view (${sizeName})`, () => {
        test('posted: header, badge, total, details and back link', async ({ page }) => {
            await start(page, size)
            await openEntry(page, ENTRIES_SEED.posted)

            const view = page.getByTestId('entry-read-only')
            await expect(page.getByTestId('entry-title')).toHaveText(TITLE)
            await expect(page.getByTestId('entry-badge')).toHaveText('Posted')
            await expect(page.getByTestId('entry-big-total')).toHaveText(MONEY)
            await expect(page.getByTestId('entry-back')).toHaveText('Journal entries')
            await expect(view).toContainText('Date')
            await expect(view).toContainText('Memo')
            await expect(view).toContainText(ENTRIES_SEED.posted)
            await expect(view).toContainText(/posted by/i)

            await page.getByTestId('entry-back').click()
            await expect(page.getByTestId('entries-screen')).toBeVisible()
        })

        test('opening: never a premature body, total or not-found flash', async ({ page }) => {
            await start(page, size)
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
                    if (
                        text('entry-total-debits') === '$0.00' ||
                        text('entry-big-total') === '$0.00'
                    )
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

            await entryRow(page, ENTRIES_SEED.posted).click()
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
            await start(page, size)
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
            await entryRow(page, ENTRIES_SEED.reversed).click()
            await expect(page.getByTestId('entry-link-reversed-by')).toBeVisible()
            const seen = await page.evaluate(
                () => (window as unknown as { __entrySeen: Record<string, boolean> }).__entrySeen
            )
            expect(seen).toEqual({ bodyWithoutReversedLink: false })
        })

        test('opening an auto-reverse entry: the date never reads "None" first', async ({
            page,
        }) => {
            await start(page, size)
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
            await entryRow(page, ENTRIES_SEED.auto).click()
            await expect(page.getByTestId('entry-auto-reverse')).toContainText('Will reverse on')
            const seen = await page.evaluate(
                () => (window as unknown as { __entrySeen: Record<string, boolean> }).__entrySeen
            )
            expect(seen).toEqual({ notWillReverse: false })
        })

        test('back: returns to the list and pops browser history', async ({ page }) => {
            await start(page, size)
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

        test('lines: two lines, balanced totals, fixed header and totals', async ({ page }) => {
            await start(page, size)
            await openEntry(page, ENTRIES_SEED.posted)

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

            expect(await hasScrollableAncestor(page.getByTestId('entry-totals'))).toBe(false)
            expect(await hasScrollableAncestor(page.getByTestId('entry-title'))).toBe(false)
        })

        test('void: badge, voided by, and the reversal link goes there and back', async ({
            page,
        }) => {
            await start(page, size)
            await openEntry(page, ENTRIES_SEED.voided)

            const view = page.getByTestId('entry-read-only')
            await expect(page.getByTestId('entry-badge')).toHaveText('Void')
            await expect(view).toContainText(/voided by/i)
            await expect(view).toContainText(/posted by/i)

            const reversedBy = page.getByTestId('entry-link-reversed-by')
            await expect(reversedBy).toHaveText(/^Reversed by JE-\d+$/)
            await reversedBy.click()
            await expect(page.getByTestId('entry-title')).toHaveText(TITLE)
            const reverses = page.getByTestId('entry-link-reverses')
            await expect(reverses).toHaveText(/^Reverses JE-\d+$/)

            await reverses.click()
            await expect(page.getByTestId('entry-badge')).toHaveText('Void')
            await expect(page.getByTestId('entry-link-reversed-by')).toBeVisible()
        })

        test('reversed: the seeded reversed entry links to its reversal', async ({ page }) => {
            await start(page, size)
            await openEntry(page, ENTRIES_SEED.reversed)

            await expect(page.getByTestId('entry-link-reversed-by')).toHaveText(
                /^Reversed by JE-\d+$/
            )
        })

        test('auto-reverse: an unsettled date reads "Will reverse on"', async ({ page }) => {
            await start(page, size)
            await openEntry(page, ENTRIES_SEED.auto)

            await expect(page.getByTestId('entry-auto-reverse')).toHaveText(
                /^Will reverse on [A-Z][a-z]{2} \d{1,2}, \d{4}$/
            )
        })

        test('details: posted by carries a date-time', async ({ page }) => {
            await start(page, size)
            await openEntry(page, ENTRIES_SEED.posted)

            const posted = page.getByTestId('entry-read-only').getByText(/posted by/i)
            await expect(posted.first()).toContainText(
                new RegExp(`${SEED_POSTER}, [A-Z][a-z]{2} \\d{1,2}, \\d{4}, \\d{1,2}:\\d{2}`)
            )
        })

        test('void details: voided by carries a date-time', async ({ page }) => {
            await start(page, size)
            await openEntry(page, ENTRIES_SEED.voided)

            const voided = page.getByTestId('entry-read-only').getByText(/voided by/i)
            await expect(voided.first()).toContainText(/\d{1,2}:\d{2}/)
        })

        test('not found: an unknown id shows the message and a way back', async ({ page }) => {
            await start(page, size)
            await openEntries(page)

            await page.evaluate(url => {
                window.history.pushState({}, '', url)
                window.dispatchEvent(new PopStateEvent('popstate'))
            }, '/a/books/entries/doesnotexist0000')

            await expect(page.getByTestId('entry-not-found')).toContainText(
                'This entry does not exist'
            )
            await page.getByTestId('entry-back').click()
            await expect(page.getByTestId('entries-screen')).toBeVisible()
        })

        test('register: the drawer links to the entry', async ({ page }) => {
            await start(page, size)
            await openRegister(page, 'Business Checking')
            await page.getByTestId('register-range').click()
            await page.getByRole('menuitem', { name: 'This fiscal year', exact: true }).click()

            const prefix = isPhone(page) ? 'register-card-' : 'register-row-'
            await page
                .locator(`[data-testid^="${prefix}"]`)
                .filter({ hasText: REGISTER_SEED.sale })
                .click()
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

test.describe('journal-entries: read-only view (desktop line table)', () => {
    test('columns read #, Account, Debit, Credit, Memo; Debit and Credit align', async ({
        page,
    }) => {
        await start(page, DESKTOP)
        await openEntry(page, ENTRIES_SEED.posted)

        const view = page.getByTestId('entry-read-only')
        const boxes: Box[] = []
        for (const heading of ['#', 'Account', 'Debit', 'Credit', 'Memo']) {
            const label = view.getByText(heading, { exact: true }).last()
            await expect(label).toBeVisible()
            boxes.push(await boxOf(label))
        }
        for (let i = 1; i < boxes.length; i++) {
            expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x)
        }

        const debits = [
            await boxOf(page.getByTestId('entry-line-debit-0')),
            await boxOf(page.getByTestId('entry-line-debit-1')),
        ]
        const credits = [
            await boxOf(page.getByTestId('entry-line-credit-0')),
            await boxOf(page.getByTestId('entry-line-credit-1')),
        ]
        for (const group of [debits, credits]) {
            expect(group[1].width).toBeCloseTo(group[0].width, 0)
            expect(group[1].x + group[1].width).toBeCloseTo(group[0].x + group[0].width, 0)
        }
    })
})

test.describe('journal-entries: read-only view (phone New button)', () => {
    test('the New button is hidden on the read-only entry', async ({ page }) => {
        await start(page, PHONE)
        await openEntry(page, ENTRIES_SEED.posted)
        await expect(page.getByLabel('New', { exact: true })).toHaveCount(0)
    })

    test('the New button shows again on the entries list after returning', async ({ page }) => {
        await start(page, PHONE)
        await openEntry(page, ENTRIES_SEED.posted)
        await page.getByTestId('entry-back').click()
        await expect(page.getByTestId('entries-screen')).toBeVisible()
        await expect(page.getByLabel('New', { exact: true })).toBeVisible()
    })
})

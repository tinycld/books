import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { openChart } from './account-register-helpers'
import {
    DESKTOP,
    dayText,
    GRID_NAMES,
    isPhone,
    lastFiscalYearEnd,
    lastMonthEnd,
    openOpeningBalances,
    openWithIds,
    PHONE,
} from './opening-balances-helpers'

// All opening-balances e2e live in this one file: the feature has one entry per
// database and tests in one file run in file order in one worker.
//
// Checkpoint 2 (states, header and date). The read-only test fulfils the real
// books_access response with level read_only, because the seed has no read-only
// Books member. It covers the client layout only; server enforcement stays
// covered by the Go tests. The loading, empty-chart and error tests hold or
// replace the books_accounts read. They reload the page on the opened screen so
// the accounts query is not already served from rows the Chart of Accounts
// loaded; the reload keeps the route, so nothing is navigated with page.goto.
// Nothing is written.

const ACCOUNTS = '**/api/collections/books_accounts/records*'
const ACCESS = '**/api/collections/books_access/records*'
const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

async function start(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
}

async function choosePreset(page: Page, label: string) {
    await page.getByTestId('opening-preset').click()
    await page.getByRole('menuitem', { name: label, exact: true }).click()
}

async function helperText(page: Page) {
    const helper = page.getByTestId('opening-date-helper')
    return (await helper.count()) ? helper.innerText() : ''
}

for (const [sizeName, size] of SIZES) {
    test.describe(`opening-balances: states, header and date (${sizeName})`, () => {
        test('the header shows the back link, title, explanation and help icon', async ({
            page,
        }) => {
            await start(page, size)
            await openOpeningBalances(page)

            const screen = page.getByTestId('opening-balances-screen')
            await expect(page.getByTestId('opening-back')).toContainText('Chart of Accounts')
            await expect(screen.getByText('Opening balances', { exact: true })).toBeVisible()
            await expect(
                screen.getByText(
                    'Enter what each account held at the end of your starting date. Books posts one journal entry and balances it with Opening Balance Equity.'
                )
            ).toBeVisible()
            await expect(page.getByTestId('opening-help')).toBeVisible()

            await page.getByTestId('opening-back').click()
            await expect(page.getByTestId('account-search')).toBeVisible()
        })

        test('the date block defaults, follows presets and keeps a typed memo', async ({
            page,
        }) => {
            await start(page, size)
            await openOpeningBalances(page)

            const yearEnd = lastFiscalYearEnd()
            await expect(page.getByTestId('opening-preset')).toContainText(
                'End of last fiscal year'
            )
            await expect(page.getByTestId('opening-date')).toHaveValue(yearEnd)
            await expect(page.getByTestId('opening-date-helper')).toHaveText(
                `Balances at end of day ${dayText(yearEnd)}`
            )
            await expect(page.getByTestId('opening-memo')).toHaveValue(
                `Opening balances as of ${dayText(yearEnd)}`
            )

            const monthEnd = lastMonthEnd()
            await choosePreset(page, 'End of last month')
            await expect(page.getByTestId('opening-preset')).toContainText('End of last month')
            await expect(page.getByTestId('opening-date')).toHaveValue(monthEnd)
            await expect(page.getByTestId('opening-date-helper')).toHaveText(
                `Balances at end of day ${dayText(monthEnd)}`
            )
            await expect(page.getByTestId('opening-memo')).toHaveValue(
                `Opening balances as of ${dayText(monthEnd)}`
            )

            await page.getByTestId('opening-date').fill('2025-6-1')
            await expect.poll(() => helperText(page)).toBe('')
            await expect(page.getByText('Invalid Date')).toHaveCount(0)

            await page.getByTestId('opening-date').fill('2025-06-01')
            await expect(page.getByTestId('opening-preset')).toContainText('Custom date')
            await expect(page.getByTestId('opening-date-helper')).toHaveText(
                'Balances at end of day Jun 1, 2025'
            )

            await page.getByTestId('opening-memo').fill('Converted from the old books')
            await page.getByTestId('opening-date').fill('2025-07-01')
            await expect(page.getByTestId('opening-date-helper')).toHaveText(
                'Balances at end of day Jul 1, 2025'
            )
            await expect(page.getByTestId('opening-memo')).toHaveValue(
                'Converted from the old books'
            )

            await page.getByTestId('opening-memo').fill('')
            await expect(page.getByTestId('opening-memo')).toHaveValue(
                'Opening balances as of Jul 1, 2025'
            )
        })

        test('shows the loading state with the header while accounts are held', async ({
            page,
        }) => {
            await start(page, size)
            await openOpeningBalances(page)
            let release: () => void = () => {}
            const held = new Promise<void>(resolve => {
                release = resolve
            })
            await page.route(ACCOUNTS, async route => {
                await held
                await route.continue()
            })
            await page.reload()

            await expect(page.getByTestId('opening-loading')).toBeVisible()
            await expect(page.getByTestId('opening-back')).toBeVisible()
            await expect(page.getByTestId('opening-date')).toHaveCount(0)
            release()
            await expect(page.getByTestId('opening-date')).toBeVisible()
            await expect(page.getByTestId('opening-loading')).toHaveCount(0)
            await page.unrouteAll({ behavior: 'ignoreErrors' })
        })

        test('an empty chart shows the empty state and a link to the chart', async ({ page }) => {
            await start(page, size)
            await openOpeningBalances(page)
            await page.route(ACCOUNTS, route =>
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        page: 1,
                        perPage: 500,
                        totalItems: 0,
                        totalPages: 0,
                        items: [],
                    }),
                })
            )
            await page.reload()

            const empty = page.getByTestId('opening-empty')
            await expect(empty).toContainText('No accounts to enter balances for')
            await empty.getByText('Go to Chart of Accounts').click()
            // The empty-accounts route is still active, so the Chart of Accounts
            // screen shows its own empty state instead of the toolbar.
            await expect(page.getByTestId('accounts-empty')).toBeVisible()
            await expect(page.getByTestId('opening-empty')).toBeHidden()
            await page.unrouteAll({ behavior: 'ignoreErrors' })
        })

        test('shows an error and recovers on Retry', async ({ page }) => {
            await start(page, size)
            await openOpeningBalances(page)
            await page.route(ACCOUNTS, route =>
                route.fulfill({ status: 400, contentType: 'application/json', body: '{}' })
            )
            await page.reload()

            const alert = page
                .getByRole('alert')
                .filter({ hasText: 'Could not load opening balances' })
            await expect(alert).toBeVisible()
            await expect(page.getByTestId('opening-error')).toBeVisible()
            await expect(page.getByTestId('opening-retry')).toBeVisible()

            // The failing query re-requests books_accounts in a tight loop, so
            // requests are in flight when the route is removed. 'wait' lets every
            // running handler finish, so no 400 is issued after Retry.
            await page.unrouteAll({ behavior: 'wait' })
            await page.getByTestId('opening-retry').click()
            await expect(page.getByTestId('opening-date')).toBeVisible()
            await expect(page.getByTestId('opening-error')).toHaveCount(0)
        })

        test('a read-only user sees the no-entry message and no date block or actions', async ({
            page,
        }) => {
            await start(page, size)
            await openChart(page)
            await page.route(ACCESS, async route => {
                const response = await route.fetch()
                const body = await response.json()
                const items = (body.items ?? []).map((item: Record<string, unknown>) => ({
                    ...item,
                    level: 'read_only',
                    can_read: true,
                    can_write: false,
                }))
                await route.fulfill({ response, json: { ...body, items } })
            })
            await page.reload()

            const link = page.getByTestId('account-opening-balances-link')
            await expect(link).toBeVisible()
            await link.click()
            await expect(page.getByTestId('opening-balances-screen')).toBeVisible()
            await expect(page.getByTestId('opening-no-entry')).toContainText(
                'No opening balances have been entered.'
            )
            await expect(page.getByTestId('opening-date')).toHaveCount(0)
            await expect(page.getByTestId('opening-preset')).toHaveCount(0)
            // Vacuous until checkpoint 5 builds these ids; re-asserted there.
            await expect(page.getByTestId('opening-save')).toHaveCount(0)
            await expect(page.getByTestId('opening-post')).toHaveCount(0)
            await page.unrouteAll({ behavior: 'ignoreErrors' })
        })

        test('the Chart of Accounts link is visible to a writer', async ({ page }) => {
            await start(page, size)
            await openChart(page)
            await expect(page.getByTestId('account-opening-balances-link')).toBeVisible()
        })
    })
}

// Checkpoint 3 (account grid and amounts). Nothing is saved. Account ids are
// read from the Chart of Accounts test ids by `openWithIds`. The seed chart has
// no balance-sheet sub-account, so no test creates one: the indentation and
// ordering rule is covered by `pickOpeningBands` in checkpoint 1's unit tests.
// The "Inactive" label is covered there and by checkpoint 5's reopened-draft
// test; here only the absence of inactive rows is asserted. The sticky band test
// does not assert a scrolled-state change because the seed chart fits one
// screen.

const GROUPS = ['asset', 'liability', 'equity'] as const

// The Chart of Accounts stays mounted behind this screen on desktop and shows
// some of the same text, so grid text is always read inside the screen.
function screenOf(page: Page) {
    return page.getByTestId('opening-balances-screen')
}

function amount(page: Page, id: string) {
    return page.getByTestId(`opening-amount-${id}`)
}

for (const [sizeName, size] of SIZES) {
    test.describe(`opening-balances: account grid and amounts (${sizeName})`, () => {
        test('three bands with captions and subtotals list only balance-sheet accounts', async ({
            page,
        }) => {
            await start(page, size)
            // The seed has no Opening Balance Equity account (it is created on post), so it
            // has no chart row to resolve; its absence is checked by text below.
            const excluded = ['Rent', 'Consulting Income', 'Design Tools']
            const ids = await openWithIds(page, GRID_NAMES, excluded)

            const screen = screenOf(page)
            await expect(screen.getByText('Enter what each account holds')).toBeVisible()
            await expect(screen.getByText('Enter what you owe')).toBeVisible()
            await expect(screen.getByText("Enter the owners' share")).toBeVisible()
            for (const group of GROUPS) {
                await expect(page.getByTestId(`opening-band-subtotal-${group}`)).toHaveText('$0.00')
            }
            for (const name of GRID_NAMES) {
                await expect(amount(page, ids[name])).toBeVisible()
            }
            for (const name of excluded) {
                expect(ids[name]).toBeTruthy()
                await expect(amount(page, ids[name])).toHaveCount(0)
            }
            await expect(screen.getByText('Opening Balance Equity', { exact: true })).toHaveCount(0)
            await expect(screen.getByText('Rent', { exact: true })).toHaveCount(0)
            await expect(screen.getByText('Consulting Income', { exact: true })).toHaveCount(0)
            await expect(screen.getByText('Design Tools', { exact: true })).toHaveCount(0)
        })

        // (2) Hierarchy is covered by `pickOpeningBands` in checkpoint 1 (see the
        // header comment): the seed has no balance-sheet sub-account.

        test('the amount input formats on blur and the sign toggle flips the sign', async ({
            page,
        }) => {
            await start(page, size)
            const ids = await openWithIds(page)
            const id = ids['Office Equipment']
            const input = amount(page, id)

            await input.fill('1,234.5')
            await input.blur()
            await expect(input).toHaveValue('1,234.50')
            await input.fill('$1,234.5')
            await input.blur()
            await expect(input).toHaveValue('1,234.50')
            await input.fill('-250')
            await input.blur()
            await expect(input).toHaveValue('-250.00')

            await page.getByTestId(`opening-sign-${id}`).click()
            await expect(input).toHaveValue('250.00')
            await page.getByTestId(`opening-sign-${id}`).click()
            await expect(input).toHaveValue('-250.00')
        })

        test('an unparsable or oversized amount shows an error', async ({ page }) => {
            await start(page, size)
            const ids = await openWithIds(page)
            const id = ids['Office Equipment']
            const error = page.getByTestId(`opening-amount-error-${id}`)

            // Visible and not covered by the next row: a trial click fails when
            // another element would receive the pointer.
            for (const [text, message] of [
                ['abc', 'Enter an amount like 1,234.50'],
                ['99,999,999,999,999,999', 'Amount is too large'],
            ]) {
                await amount(page, id).fill(text)
                await amount(page, id).blur()
                await expect(error).toBeVisible()
                await expect(error).toHaveText(message)
                await error.click({ trial: true })
            }

            // In flow: the error sits inside its own row (wide) or card (phone), so it
            // cannot float over the next account.
            const container = page.getByTestId(
                size.width < 600 ? `opening-card-${id}` : `opening-row-${id}`
            )
            const errorBox = await error.boundingBox()
            const containerBox = await container.boundingBox()
            if (!errorBox || !containerBox) throw new Error('error or its row has no box')
            expect(errorBox.y).toBeGreaterThanOrEqual(containerBox.y - 0.5)
            expect(errorBox.y + errorBox.height).toBeLessThanOrEqual(
                containerBox.y + containerBox.height + 0.5
            )
        })

        test('receivable shows the no-detail helper and a bank account shows none', async ({
            page,
        }) => {
            await start(page, size)
            const ids = await openWithIds(page)

            await expect(
                page.getByTestId(`opening-helper-${ids['Accounts receivable']}`)
            ).toHaveText('No customer or vendor detail')
            await expect(
                page.getByTestId(`opening-helper-${ids['Business Checking']}`)
            ).toHaveCount(0)
        })

        // (6) The "Inactive" label is covered by `pickOpeningBands` (checkpoint 1)
        // and checkpoint 5's reopened-draft test; no inactive account has a saved
        // line here, so none is listed.
        test('an inactive account with no saved line is not listed', async ({ page }) => {
            await start(page, size)
            await openWithIds(page)

            await expect(screenOf(page).getByText('Old Petty Cash')).toHaveCount(0)
            await expect(page.locator('[data-testid^="opening-inactive-"]')).toHaveCount(0)
        })

        test('Enter in an amount moves focus to the next account amount', async ({ page }) => {
            await start(page, size)
            const ids = await openWithIds(page)
            const checking = amount(page, ids['Business Checking'])

            await checking.fill('100')
            await checking.press('Enter')
            await expect(amount(page, ids['Accounts receivable'])).toBeFocused()
        })

        test('band subtotals follow the typed amounts', async ({ page }) => {
            await start(page, size)
            const ids = await openWithIds(page)

            await amount(page, ids['Office Equipment']).fill('5,000')
            await amount(page, ids['Office Equipment']).blur()
            await expect(page.getByTestId('opening-band-subtotal-asset')).toHaveText('$5,000.00')

            await amount(page, ids["Owner's Equity"]).fill('-500')
            await amount(page, ids["Owner's Equity"]).blur()
            await expect(page.getByTestId('opening-band-subtotal-equity')).toHaveText('-$500.00')
        })

        test('the sticky column header sits in the scroller and the sticky band names Assets', async ({
            page,
        }) => {
            await start(page, size)
            const ids = await openWithIds(page)

            // The bar is always rendered; the scrolled state is unit-tested in
            // opening-window.test.ts.
            const band = page.getByTestId('opening-sticky-band')
            await expect(band).toBeVisible()
            await expect(band).toContainText('Assets')
            await expect(band).toContainText(
                (await page.getByTestId('opening-band-subtotal-asset').innerText()).trim()
            )
            const header = screenOf(page).getByText('Detail type', { exact: true })
            if (isPhone(page)) {
                await expect(header).toHaveCount(0)
                return
            }
            await expect(header).toBeVisible()
            const sticky = await header.evaluate((node, inputId) => {
                const input = document.querySelector(`[data-testid="opening-amount-${inputId}"]`)
                let stickyFound = false
                let el: HTMLElement | null = node as HTMLElement
                while (el) {
                    const style = getComputedStyle(el)
                    if (style.position === 'sticky') stickyFound = true
                    if (/(auto|scroll)/.test(style.overflowY) && el.contains(input)) {
                        return stickyFound
                    }
                    el = el.parentElement
                }
                return false
            }, ids['Business Checking'])
            expect(sticky).toBe(true)
        })

        test('layout: fixed amount column and name-wider-than-detail on desktop, cards on phone', async ({
            page,
        }) => {
            await start(page, size)
            const ids = await openWithIds(page)
            const id = ids['Business Checking']
            const input = amount(page, id)

            if (isPhone(page)) {
                const card = page.getByTestId(`opening-card-${id}`)
                await expect(card).toBeVisible()
                const name = await card.getByText('Business Checking').first().boundingBox()
                const box = await input.boundingBox()
                expect(box?.y ?? 0).toBeGreaterThanOrEqual((name?.y ?? 0) + (name?.height ?? 0))
                expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
                return
            }
            const widths = await input.evaluate(node => {
                const list: number[] = []
                let el = node.parentElement
                while (el) {
                    list.push(Math.round(el.getBoundingClientRect().width))
                    el = el.parentElement
                }
                return list
            })
            expect(widths).toContain(168)

            const cellWidth = (label: string) =>
                screenOf(page)
                    .getByText(label, { exact: true })
                    .first()
                    .evaluate(node => {
                        let el: HTMLElement | null = node as HTMLElement
                        while (el && Number.parseFloat(getComputedStyle(el).flexGrow) <= 0) {
                            el = el.parentElement
                        }
                        return el ? el.getBoundingClientRect().width : 0
                    })
            const accountWidth = await cellWidth('Account')
            const detailWidth = await cellWidth('Detail type')
            expect(detailWidth).toBeGreaterThan(0)
            expect(accountWidth).toBeGreaterThan(detailWidth)
        })
    })
}

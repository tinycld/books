import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { accountItem, openChart, openRegister } from './account-register-helpers'
import {
    confirmDiscard,
    DESKTOP,
    dayText,
    dialogCancelButton,
    discardChangesTitle,
    discardDraftTitle,
    discardExistingDraft,
    discardTrigger,
    GRID_NAMES,
    idsFromChart,
    isPhone,
    lastMonthEnd,
    leaveToChart,
    openDiscardDialog,
    openFromChart,
    openOpeningBalances,
    openWithIds,
    PHONE,
    readDefaultDate,
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
const SETTINGS = '**/api/collections/books_settings/records*'
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

            const yearEnd = await readDefaultDate(page)
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

            await page.getByTestId('opening-date-open').click()
            await page.getByLabel('2025-06-15', { exact: true }).first().click()
            await expect(page.getByTestId('opening-date')).toHaveValue('2025-06-15')
            await expect(page.getByTestId('opening-date-helper')).toHaveText(
                'Balances at end of day Jun 15, 2025'
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

        test('recovers on Retry after the settings read fails', async ({ page }) => {
            await start(page, size)
            await openOpeningBalances(page)
            await page.route(SETTINGS, route =>
                route.fulfill({ status: 400, contentType: 'application/json', body: '{}' })
            )
            await page.reload()

            const alert = page
                .getByRole('alert')
                .filter({ hasText: 'Could not load opening balances' })
            await expect(alert).toBeVisible()
            await expect(page.getByTestId('opening-retry')).toBeVisible()

            // 'wait' lets running handlers finish, so no 400 is issued after Retry.
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

// Checkpoint 4 (Balance Sheet preview and totals). Nothing is saved. Test ids
// carrying a figure sit on the element that holds the text and the tone class
// (`opening-preview-total-le`, `opening-preview-amount-<id>`,
// `opening-total-*`), so `toHaveText` and `toHaveClass` read the same element.
// Wide screens show the preview in a rail; on a phone it sits in a collapsed
// disclosure that every preview test opens first, except the toggle test.

async function openPreview(page: Page) {
    if (!isPhone(page)) return
    const toggle = page.getByTestId('opening-preview-toggle')
    await expect(toggle).toBeVisible()
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    await expect(page.getByTestId('opening-preview')).toBeVisible()
}

async function type(page: Page, id: string, text: string) {
    await amount(page, id).fill(text)
    await amount(page, id).blur()
}

async function boxOf(page: Page, testId: string) {
    await expect(page.getByTestId(testId)).toBeVisible()
    const box = await page.getByTestId(testId).boundingBox()
    if (!box) throw new Error(`${testId} has no box`)
    return box
}

async function scrollBody(page: Page) {
    const body = await boxOf(page, 'opening-body')
    await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2)
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(250)
}

test.describe('opening-balances: preview and totals', () => {
    for (const [sizeName, size] of SIZES) {
        test.describe(sizeName, () => {
            test('with no amount typed the preview shows the empty text and no balancing row', async ({
                page,
            }) => {
                await start(page, size)
                await openWithIds(page)
                await openPreview(page)

                await expect(page.getByTestId('opening-preview-empty')).toBeVisible()
                await expect(page.getByTestId('opening-preview-empty')).toHaveText(
                    'Type a balance to see the preview.'
                )
                await expect(page.getByTestId('opening-preview-obe')).toHaveCount(0)
            })

            test('typed amounts fill the preview and the balancing row reconciles it', async ({
                page,
            }) => {
                await start(page, size)
                const ids = await openWithIds(page)
                const shownDate = await readDefaultDate(page)
                await type(page, ids['Office Equipment'], '5,000')
                await type(page, ids['Company Card'], '1,200')
                await openPreview(page)

                const preview = page.getByTestId('opening-preview')
                await expect(page.getByTestId('opening-preview-title')).toHaveText('Balance Sheet')
                await expect(page.getByTestId('opening-preview-subtitle')).toHaveText(
                    `As of ${dayText(shownDate)}`
                )
                await expect(page.getByTestId('opening-preview-chip')).toHaveText('Preview')
                await expect(
                    page.getByTestId(`opening-preview-row-${ids['Office Equipment']}`)
                ).toContainText('Office Equipment')
                await expect(
                    page.getByTestId(`opening-preview-row-${ids['Company Card']}`)
                ).toContainText('Company Card')
                // The id was resolved above, so a missing row cannot pass this.
                expect(ids['Business Checking']).toBeTruthy()
                await expect(
                    page.getByTestId(`opening-preview-row-${ids['Business Checking']}`)
                ).toHaveCount(0)
                await expect(preview.getByText('Business Checking')).toHaveCount(0)
                await expect(page.getByTestId('opening-preview-empty')).toHaveCount(0)

                const obe = page.getByTestId('opening-preview-obe')
                await expect(obe).toBeVisible()
                await expect(obe).toContainText('Opening Balance Equity')
                await expect(obe).toContainText('$3,800.00')
                await expect(page.getByTestId('opening-preview-total-assets')).toHaveText(
                    '$5,000.00'
                )
                const total = page.getByTestId('opening-preview-total-le')
                await expect(total).toHaveText('$5,000.00')
                await expect(total).toHaveClass(/text-success/)
            })

            test('the totals strip shows assets, liabilities and equity', async ({ page }) => {
                await start(page, size)
                const ids = await openWithIds(page)
                await type(page, ids['Office Equipment'], '5,000')
                await type(page, ids['Company Card'], '1,200')

                const strip = page.getByTestId('opening-totals')
                await expect(strip).toBeVisible()
                await expect(strip).toContainText('Assets')
                await expect(strip).toContainText('Liabilities')
                await expect(strip).toContainText('Equity (including Opening Balance Equity)')
                await expect(page.getByTestId('opening-total-assets')).toHaveText('$5,000.00')
                await expect(page.getByTestId('opening-total-liabilities')).toHaveText('$1,200.00')
                await expect(page.getByTestId('opening-total-equity')).toHaveText('$3,800.00')
            })

            test('a negative amount sits on the opposite side', async ({ page }) => {
                await start(page, size)
                const ids = await openWithIds(page)
                await type(page, ids['Company Card'], '-500')
                await openPreview(page)

                await expect(page.getByTestId('opening-total-liabilities')).toHaveText('-$500.00')
                const row = page.getByTestId(`opening-preview-row-${ids['Company Card']}`)
                await expect(row).toBeVisible()
                const figure = page.getByTestId(`opening-preview-amount-${ids['Company Card']}`)
                await expect(figure).toHaveText('-$500.00')
                await expect(figure).toHaveClass(/text-destructive/)
            })

            test('the preview follows the date and the amounts', async ({ page }) => {
                await start(page, size)
                const ids = await openWithIds(page)
                const shownDate = await readDefaultDate(page)
                await type(page, ids['Office Equipment'], '5,000')
                await openPreview(page)
                await expect(page.getByTestId('opening-preview-subtitle')).toHaveText(
                    `As of ${dayText(shownDate)}`
                )

                await page.getByTestId('opening-date').fill('2025-06-01')
                await expect(page.getByTestId('opening-preview-subtitle')).toHaveText(
                    'As of Jun 1, 2025'
                )

                await type(page, ids['Office Equipment'], '')
                await expect(page.getByTestId('opening-preview-empty')).toHaveText(
                    'Type a balance to see the preview.'
                )
                await expect(page.getByTestId('opening-preview-obe')).toHaveCount(0)
                await expect(
                    page.getByTestId(`opening-preview-row-${ids['Office Equipment']}`)
                ).toHaveCount(0)
            })

            // Proven: the rail sits right of the grid, inside the viewport, and does
            // not move when the grid is wheeled. Not proven: that the rail stays in
            // view while a long body scrolls; the rail is a non-scrolling sibling
            // and the seed chart is too short to scroll the grid.
            test('wide: the preview is a rail right of the grid; phone: a disclosure that opens in view', async ({
                page,
            }) => {
                await start(page, size)
                const ids = await openWithIds(page)
                await type(page, ids['Office Equipment'], '5,000')

                const totals = page.getByTestId('opening-totals')
                if (!isPhone(page)) {
                    const grid = await boxOf(page, 'opening-grid')
                    const rail = await boxOf(page, 'opening-preview')
                    expect(rail.x).toBeGreaterThan(grid.x + grid.width - 0.5)
                    expect(rail.x + rail.width).toBeLessThanOrEqual(size.width + 0.5)
                    expect(rail.y).toBeGreaterThanOrEqual(0)
                    expect(rail.y + rail.height).toBeLessThanOrEqual(size.height + 0.5)
                    await scrollBody(page)
                    const after = await boxOf(page, 'opening-preview')
                    expect(Math.abs(after.y - rail.y)).toBeLessThan(1)
                    expect(Math.abs(after.x - rail.x)).toBeLessThan(1)
                    return
                }
                const toggle = page.getByTestId('opening-preview-toggle')
                await expect(toggle).toBeVisible()
                await expect(toggle).toContainText('Preview')
                await expect(toggle).toHaveAttribute('aria-expanded', 'false')
                await expect(page.getByTestId('opening-preview')).toBeHidden()

                await toggle.click()
                await expect(toggle).toHaveAttribute('aria-expanded', 'true')
                const content = await boxOf(page, 'opening-preview')
                const totalsBox = await boxOf(page, 'opening-totals')
                expect(content.y).toBeGreaterThanOrEqual(0)
                expect(content.y + content.height).toBeLessThanOrEqual(size.height + 0.5)
                // Not clipped by or hidden behind the totals strip.
                expect(content.y + content.height).toBeLessThanOrEqual(totalsBox.y + 0.5)
                // The open preview must leave the grid usable.
                const gridBox = await boxOf(page, 'opening-grid')
                expect(gridBox.height).toBeGreaterThanOrEqual(200)
                await expect(toggle).toBeVisible()
                await expect(totals).toBeVisible()
                await expect(page.getByTestId('opening-total-assets')).toHaveText('$5,000.00')
                await expect(page.getByTestId('opening-total-liabilities')).toHaveText('$0.00')
                await expect(page.getByTestId('opening-total-equity')).toHaveText('$5,000.00')
            })

            // Proven: the strip ends inside the viewport and keeps its box when the
            // grid is wheeled. Not proven: that it stays put while a long body
            // scrolls; the seed chart does not scroll the body.
            test('the totals strip sits above the viewport bottom and does not move on wheel', async ({
                page,
            }) => {
                await start(page, size)
                const ids = await openWithIds(page)
                await type(page, ids['Office Equipment'], '5,000')
                await openPreview(page)

                const totals = page.getByTestId('opening-totals')
                await expect(totals).toBeVisible()
                const before = await boxOf(page, 'opening-totals')
                expect(before.y + before.height).toBeLessThanOrEqual(size.height + 0.5)
                await scrollBody(page)
                const after = await boxOf(page, 'opening-totals')
                expect(Math.abs(after.y - before.y)).toBeLessThan(1)
                expect(Math.abs(after.height - before.height)).toBeLessThan(1)
                expect(after.y + after.height).toBeLessThanOrEqual(size.height + 0.5)
            })

            test('an invalid date drops the preview subtitle until the date is valid again', async ({
                page,
            }) => {
                await start(page, size)
                const ids = await openWithIds(page)
                await type(page, ids['Office Equipment'], '5,000')
                await openPreview(page)
                const preview = page.getByTestId('opening-preview')
                await expect(page.getByTestId('opening-preview-subtitle')).toBeVisible()

                await page.getByTestId('opening-date').fill('2025-6-1')
                await expect(page.getByTestId('opening-preview-subtitle')).toHaveCount(0)
                await expect(preview.getByText('As of ')).toHaveCount(0)
                await expect(page.getByTestId('opening-preview-title')).toHaveText('Balance Sheet')

                await page.getByTestId('opening-date').fill('2025-06-01')
                await expect(page.getByTestId('opening-preview-subtitle')).toHaveText(
                    'As of Jun 1, 2025'
                )
            })

            test('an oversized sum shows Too large in the destructive tone', async ({ page }) => {
                await start(page, size)
                const ids = await openWithIds(page)
                await type(page, ids['Office Equipment'], '20,000,000,000,000')
                await openPreview(page)

                const previewProblem = page.getByTestId('opening-preview-problem')
                await expect(previewProblem).toBeVisible()
                await expect(previewProblem).toContainText('Too large')
                await expect(previewProblem).toHaveClass(/text-destructive/)
                // The problem replaces the figures, so no reconciled success total remains.
                await expect(page.getByTestId('opening-preview-total-le')).toHaveCount(0)

                const problem = page.getByTestId('opening-totals-problem')
                await expect(problem).toBeVisible()
                await expect(problem).toContainText('Too large')
                await expect(problem).toHaveClass(/text-destructive/)
                await expect(page.getByTestId('opening-total-assets')).toHaveCount(0)
            })
        })
    }

    // A short window must keep the grid usable while the preview is open: the
    // open disclosure is capped at a share of the body, never the whole body.
    test('short window, disclosure layout: the open preview is capped and the grid keeps room', async ({
        page,
    }) => {
        await start(page, { width: 1000, height: 560 })
        const ids = await openWithIds(page)
        const input = amount(page, ids['Office Equipment'])
        await input.scrollIntoViewIfNeeded()
        await type(page, ids['Office Equipment'], '1,234.5')

        const toggle = page.getByTestId('opening-preview-toggle')
        await expect(toggle).toBeVisible()
        await expect(page.getByTestId('opening-preview')).toHaveCount(0)
        await toggle.click()
        await expect(toggle).toHaveAttribute('aria-expanded', 'true')

        const body = await boxOf(page, 'opening-body')
        const grid = await boxOf(page, 'opening-grid')
        const preview = await boxOf(page, 'opening-preview')
        const totals = await boxOf(page, 'opening-totals')
        expect(grid.height).toBeGreaterThan(60)
        expect(preview.y + preview.height).toBeLessThanOrEqual(totals.y + 0.5)
        expect(preview.height).toBeLessThanOrEqual(body.height * 0.4)

        await input.scrollIntoViewIfNeeded()
        await expect(input).toBeVisible()
        await input.click({ trial: true })
        await expect(page.getByTestId('opening-total-assets')).toHaveText('$1,234.50')
        await expect(page.getByTestId('opening-total-liabilities')).toHaveText('$0.00')
        await expect(page.getByTestId('opening-total-equity')).toHaveText('$1,234.50')
    })

    test('short window, rail layout: the rail, the grid and the totals all stay in view', async ({
        page,
    }) => {
        await start(page, { width: 1280, height: 560 })
        const ids = await openWithIds(page)
        const input = amount(page, ids['Office Equipment'])
        await input.scrollIntoViewIfNeeded()
        await type(page, ids['Office Equipment'], '1,234.5')

        await expect(page.getByTestId('opening-preview')).toBeVisible()
        await expect(page.getByTestId('opening-grid')).toBeVisible()
        await expect(page.getByTestId('opening-preview-toggle')).toHaveCount(0)
        const grid = await boxOf(page, 'opening-grid')
        expect(grid.height).toBeGreaterThan(60)

        await input.scrollIntoViewIfNeeded()
        await expect(input).toBeVisible()
        await input.click({ trial: true })
        await expect(page.getByTestId('opening-totals')).toBeVisible()
        await expect(page.getByTestId('opening-total-assets')).toHaveText('$1,234.50')
    })

    test('tablet: amounts fit and the preview is a disclosure without a rail', async ({ page }) => {
        const tablet = { width: 900, height: 800 }
        await start(page, tablet)
        const ids = await openWithIds(page)
        await type(page, ids['Office Equipment'], '1,234.5')

        const input = await boxOf(page, `opening-amount-${ids['Office Equipment']}`)
        expect(input.x).toBeGreaterThanOrEqual(0)
        expect(input.x + input.width).toBeLessThanOrEqual(tablet.width + 0.5)

        const toggle = page.getByTestId('opening-preview-toggle')
        await expect(toggle).toBeVisible()
        await expect(toggle).toHaveAttribute('aria-expanded', 'false')
        await expect(page.getByTestId('opening-preview')).toHaveCount(0)

        await toggle.click()
        await expect(toggle).toHaveAttribute('aria-expanded', 'true')
        const content = await boxOf(page, 'opening-preview')
        expect(content.x).toBeGreaterThanOrEqual(0)
        expect(content.x + content.width).toBeLessThanOrEqual(tablet.width + 0.5)
        expect(content.y).toBeGreaterThanOrEqual(0)
        expect(content.y + content.height).toBeLessThanOrEqual(tablet.height + 0.5)
    })
})

// Checkpoint 5 (save draft and discard). The tests of this block run in the
// order of the checkpoint, before any post (the opening entry is permanent once
// posted), and the e2e database is shared by every test in the file, so each
// test starts and ends through `discardExistingDraft`. Opening Balance Equity
// persists after the first successful save, so the chart is asserted to list
// exactly one, never "created in this test". Desktop and phone variants of a
// test run one after the other, and the refusals come first because they must
// happen before the first successful save.
//
// Not testable here (11): the "Inactive" label. The seed has no inactive
// balance-sheet account and tests may not create one with a raw write; it is
// covered by `pickOpeningBands` in checkpoint 1's unit tests.
//
// Also not observable through the UI: that clearing every amount removes the
// stored balancing line (test 6). The re-opened form and preview are empty
// either way; the line diff itself is unit-tested in checkpoint 1.

const ENTRY_WRITES = '**/api/collections/books_journal_entries/records'
const LINE_WRITES = '**/api/collections/books_journal_lines/records'
const ACCOUNT_WRITES = '**/api/collections/books_accounts/records'

function trackWrites(page: Page) {
    let count = 0
    page.on('request', request => {
        if (request.method() !== 'GET' && request.url().includes('/api/collections/books_')) {
            count += 1
        }
    })
    return { count: () => count }
}

// Fulfils POSTs to a collection with a PocketBase-style 400; other methods pass.
async function refusePosts(page: Page, url: string, body: object) {
    await page.route(url, async route => {
        if (route.request().method() !== 'POST') {
            await route.continue()
            return
        }
        await route.fulfill({ status: 400, body: JSON.stringify(body) })
    })
}

function saveButton(page: Page) {
    return page.getByTestId('opening-save')
}

// A save is done when a write went out and the label is back to "Save draft".
async function saveAndSettle(page: Page, writes: { count: () => number }) {
    const before = writes.count()
    await saveButton(page).click()
    await expect.poll(() => writes.count()).toBeGreaterThan(before)
    await expect(saveButton(page)).toHaveText('Save draft')
    await expect(saveButton(page)).toBeEnabled()
}

async function begin(page: Page, size: { width: number; height: number }) {
    await start(page, size)
    await discardExistingDraft(page)
    const ids = await idsFromChart(page)
    await openFromChart(page)
    return ids
}

async function reopen(page: Page) {
    await leaveToChart(page)
    await openFromChart(page)
}

async function expectAmount(page: Page, id: string, text: string) {
    await expect(amount(page, id)).toBeVisible()
    await expect(amount(page, id)).toHaveValue(text)
}

async function expectOneEquityAccount(page: Page) {
    await leaveToChart(page)
    await expect(accountItem(page, 'Opening Balance Equity')).toHaveCount(1)
}

function bothSizes(
    name: string,
    run: (page: Page, size: { width: number; height: number }) => Promise<void>
) {
    for (const [sizeName, size] of SIZES) {
        test(`${name} (${sizeName})`, async ({ page }) => {
            await run(page, size)
        })
    }
}

test.describe('opening-balances: save draft and discard', () => {
    bothSizes(
        '(1) a refused account insert shows the message, creates no draft and keeps the form',
        async (page, size) => {
            const ids = await begin(page, size)
            const writes = trackWrites(page)
            await refusePosts(page, ACCOUNT_WRITES, {
                message: 'Account refused',
                data: {},
            })
            await type(page, ids['Office Equipment'], '10,000')

            await saveAndSettle(page, writes)
            await expect(page.getByTestId('opening-error-summary')).toBeVisible()
            await expect(page.getByTestId('opening-error-summary')).toContainText('Account refused')
            await expect(screenOf(page)).toBeVisible()
            await expectAmount(page, ids['Office Equipment'], '10,000.00')
            await page.unrouteAll({ behavior: 'wait' })

            await reopen(page)
            await expectAmount(page, ids['Office Equipment'], '')
            await expect(discardTrigger(page)).toHaveCount(0)
            await discardExistingDraft(page)
        }
    )

    bothSizes(
        '(2) a refused line insert leaves a draft without lines that a normal save repairs',
        async (page, size) => {
            const ids = await begin(page, size)
            const writes = trackWrites(page)
            await refusePosts(page, LINE_WRITES, { message: 'Lines refused', data: {} })
            await type(page, ids['Office Equipment'], '5,000')
            await type(page, ids['Company Card'], '1,200')

            await saveAndSettle(page, writes)
            // A refusal of a typed account's line belongs under that account's amount.
            const lineError = page.getByTestId(`opening-amount-error-${ids['Office Equipment']}`)
            await expect(lineError).toBeVisible()
            await expect(lineError).toContainText('Lines refused')
            await expect(page.getByTestId('opening-error-summary')).toBeHidden()
            await page.unrouteAll({ behavior: 'wait' })

            await reopen(page)
            await expect(discardTrigger(page)).toBeVisible()
            await expectAmount(page, ids['Office Equipment'], '')
            await expectAmount(page, ids['Company Card'], '')

            await type(page, ids['Office Equipment'], '5,000')
            await type(page, ids['Company Card'], '1,200')
            await saveAndSettle(page, writes)
            await expect(page.getByTestId('opening-error-summary')).toHaveCount(0)

            await reopen(page)
            await expectAmount(page, ids['Office Equipment'], '5,000.00')
            await expectAmount(page, ids['Company Card'], '1,200.00')
            await discardExistingDraft(page)
        }
    )

    bothSizes(
        '(3) a refused date shows the server message under the date field',
        async (page, size) => {
            const ids = await begin(page, size)
            const writes = trackWrites(page)
            await refusePosts(page, ENTRY_WRITES, {
                message: 'Validation failed',
                data: { date: { code: 'validation_invalid', message: 'Pick another date' } },
            })
            await type(page, ids['Office Equipment'], '5,000')

            await saveAndSettle(page, writes)
            // The summary may repeat a field error, so the first match is the
            // one the person reads; the field error itself is a role=alert.
            const message = screenOf(page).getByText('Pick another date').first()
            await expect(message).toBeVisible()
            await expect(screenOf(page)).toBeVisible()
            // The refused entry write rolls its optimistic draft back; wait for
            // that so the cleanup below does not race it.
            await expect(discardTrigger(page)).toHaveCount(0)
            await page.unrouteAll({ behavior: 'wait' })
            await discardExistingDraft(page)
        }
    )

    bothSizes(
        '(2b) a refusal of the balancing line is a root message in the summary and keeps the amounts',
        async (page, size) => {
            const ids = await begin(page, size)
            const writes = trackWrites(page)
            // Two typed amounts make two typed lines; the balancing line is written
            // last, so it is the third line POST.
            let linePosts = 0
            await page.route(LINE_WRITES, async route => {
                if (route.request().method() !== 'POST') {
                    await route.continue()
                    return
                }
                linePosts += 1
                if (linePosts < 3) {
                    await route.continue()
                    return
                }
                await route.fulfill({
                    status: 400,
                    body: JSON.stringify({
                        message: 'Line refused',
                        data: { account: { code: 'validation_invalid', message: 'Bad account' } },
                    }),
                })
            })
            await type(page, ids['Office Equipment'], '5,000')
            await type(page, ids['Company Card'], '1,200')

            await saveAndSettle(page, writes)
            const summary = page.getByTestId('opening-error-summary')
            await expect(summary).toBeVisible()
            await expect(summary).toContainText('Line refused')
            await expect(
                page.getByTestId(`opening-amount-error-${ids['Office Equipment']}`)
            ).toHaveCount(0)
            await expect(
                page.getByTestId(`opening-amount-error-${ids['Company Card']}`)
            ).toHaveCount(0)
            await expectAmount(page, ids['Office Equipment'], '5,000.00')
            await expectAmount(page, ids['Company Card'], '1,200.00')
            expect(linePosts).toBe(3)
            await page.unrouteAll({ behavior: 'wait' })
            await discardExistingDraft(page)
        }
    )

    bothSizes(
        '(3b) a refused memo shows the server message under the memo field',
        async (page, size) => {
            const ids = await begin(page, size)
            const writes = trackWrites(page)
            await refusePosts(page, ENTRY_WRITES, {
                message: 'Validation failed',
                data: { memo: { code: 'validation_invalid', message: 'Memo refused' } },
            })
            await type(page, ids['Office Equipment'], '5,000')

            await saveAndSettle(page, writes)
            const memoError = page.getByTestId('opening-memo-error')
            await expect(memoError).toBeVisible()
            await expect(memoError).toContainText('Memo refused')
            await expect(screenOf(page)).toBeVisible()
            await expectAmount(page, ids['Office Equipment'], '5,000.00')
            await expect(discardTrigger(page)).toHaveCount(0)
            await page.unrouteAll({ behavior: 'wait' })
            await discardExistingDraft(page)
        }
    )

    bothSizes(
        '(9b) a refused discard keeps the draft and shows the message in the summary',
        async (page, size) => {
            const ids = await begin(page, size)
            const writes = trackWrites(page)
            await type(page, ids['Office Equipment'], '5,000')
            await saveAndSettle(page, writes)
            await reopen(page)
            await expectAmount(page, ids['Office Equipment'], '5,000.00')

            await page.route(`${ENTRY_WRITES}/*`, async route => {
                if (route.request().method() !== 'DELETE') {
                    await route.continue()
                    return
                }
                await route.fulfill({
                    status: 400,
                    body: JSON.stringify({ message: 'Discard refused', data: {} }),
                })
            })
            await openDiscardDialog(page)
            await confirmDiscard(page)
            const summary = page.getByTestId('opening-error-summary')
            await expect(summary).toBeVisible()
            await expect(summary).toContainText('Discard refused')
            await expect(discardDraftTitle(page)).toHaveCount(0)
            await expect(screenOf(page)).toBeVisible()
            await expect(discardTrigger(page)).toBeVisible()
            await expectAmount(page, ids['Office Equipment'], '5,000.00')

            await page.unrouteAll({ behavior: 'wait' })
            await discardExistingDraft(page)
        }
    )

    bothSizes(
        '(4) the first save shows Saving..., stays on the form and ignores a double press',
        async (page, size) => {
            const ids = await begin(page, size)
            const writes = trackWrites(page)
            let entryPosts = 0
            let release: () => void = () => {}
            const held = new Promise<void>(resolve => {
                release = resolve
            })
            await page.route(ENTRY_WRITES, async route => {
                if (route.request().method() !== 'POST') {
                    await route.continue()
                    return
                }
                entryPosts += 1
                if (entryPosts === 1) await held
                await route.continue()
            })
            await type(page, ids['Office Equipment'], '5,000')
            await type(page, ids['Company Card'], '1,200')

            // Two clicks in one tick: the button has not re-rendered as disabled
            // between them, so only the ref guard can drop the second.
            await saveButton(page).evaluate(el => {
                if (!(el instanceof HTMLElement)) throw new Error('the save button is not HTML')
                el.click()
                el.click()
            })
            await expect(saveButton(page)).toHaveText('Saving...')
            await expect(saveButton(page)).toBeDisabled()
            await expect(screenOf(page)).toBeVisible()
            await expectAmount(page, ids['Office Equipment'], '5,000.00')
            await expectAmount(page, ids['Company Card'], '1,200.00')

            release()
            await expect.poll(() => writes.count()).toBeGreaterThan(0)
            await expect(saveButton(page)).toHaveText('Save draft')
            await expect(saveButton(page)).toBeEnabled()
            expect(entryPosts).toBe(1)
            await page.unrouteAll({ behavior: 'wait' })

            await reopen(page)
            await expect(discardTrigger(page)).toBeVisible()
            await expectAmount(page, ids['Office Equipment'], '5,000.00')
            await expectOneEquityAccount(page)
            await discardExistingDraft(page)
        }
    )

    bothSizes(
        '(5) re-opening seeds the form from the draft and a second save adds no equity account',
        async (page, size) => {
            const ids = await begin(page, size)
            const writes = trackWrites(page)
            await page.getByTestId('opening-date').fill('2025-06-01')
            await page.getByTestId('opening-memo').fill('Converted from the old books')
            await type(page, ids['Office Equipment'], '5,000')
            await type(page, ids['Company Card'], '1,200')
            await saveAndSettle(page, writes)

            await reopen(page)
            await expect(page.getByTestId('opening-status-badge')).toBeVisible()
            await expect(page.getByTestId('opening-status-badge')).toHaveText('Draft')
            await expect(page.getByTestId('opening-date')).toHaveValue('2025-06-01')
            await expect(page.getByTestId('opening-memo')).toHaveValue(
                'Converted from the old books'
            )
            await expectAmount(page, ids['Office Equipment'], '5,000.00')
            await expectAmount(page, ids['Company Card'], '1,200.00')
            if (isPhone(page)) {
                await page.getByTestId('opening-more').click()
                await expect(
                    page.getByRole('menuitem', { name: 'Discard draft', exact: true })
                ).toBeVisible()
                await page.keyboard.press('Escape')
            } else {
                await expect(page.getByTestId('opening-discard')).toBeVisible()
            }

            await type(page, ids['Company Card'], '1,300')
            await saveAndSettle(page, writes)
            await reopen(page)
            await expectAmount(page, ids['Company Card'], '1,300.00')
            await expectOneEquityAccount(page)
            await discardExistingDraft(page)
        }
    )

    bothSizes(
        '(5b) a draft saved with the default date and a blank memo re-opens following the date',
        async (page, size) => {
            const ids = await begin(page, size)
            const writes = trackWrites(page)
            const defaultDate = await readDefaultDate(page)
            await type(page, ids['Office Equipment'], '5,000')
            await saveAndSettle(page, writes)

            await reopen(page)
            await expect(page.getByTestId('opening-date')).toHaveValue(defaultDate)
            await expect(page.getByTestId('opening-preset')).toContainText(
                'End of last fiscal year'
            )
            await expect(page.getByTestId('opening-memo')).toHaveValue(
                `Opening balances as of ${dayText(defaultDate)}`
            )

            await page.getByTestId('opening-date').fill('2025-06-01')
            await expect(page.getByTestId('opening-memo')).toHaveValue(
                `Opening balances as of ${dayText('2025-06-01')}`
            )
            await discardExistingDraft(page)
        }
    )

    bothSizes(
        '(6) editing changes, clears and adds figures; clearing all leaves a draft with no lines',
        async (page, size) => {
            const ids = await begin(page, size)
            const writes = trackWrites(page)
            await type(page, ids['Office Equipment'], '5,000')
            await type(page, ids['Company Card'], '1,200')
            await saveAndSettle(page, writes)

            await type(page, ids['Office Equipment'], '6,000')
            await type(page, ids['Company Card'], '')
            await type(page, ids["Owner's Equity"], '700')
            await saveAndSettle(page, writes)
            await reopen(page)
            await expectAmount(page, ids['Office Equipment'], '6,000.00')
            await expectAmount(page, ids['Company Card'], '')
            await expectAmount(page, ids["Owner's Equity"], '700.00')

            await type(page, ids['Office Equipment'], '')
            await type(page, ids["Owner's Equity"], '')
            await saveAndSettle(page, writes)
            await reopen(page)
            await expect(discardTrigger(page)).toBeVisible()
            await expectAmount(page, ids['Office Equipment'], '')
            await expectAmount(page, ids["Owner's Equity"], '')
            await openPreview(page)
            await expect(page.getByTestId('opening-preview-empty')).toBeVisible()
            await discardExistingDraft(page)
        }
    )

    bothSizes('(7) a form that was never saved has no Discard draft', async (page, size) => {
        await begin(page, size)
        await expect(saveButton(page)).toBeVisible()
        await expect(page.getByTestId('opening-status-badge')).toHaveCount(0)
        await expect(page.getByTestId('opening-discard')).toHaveCount(0)
        await expect(page.getByTestId('opening-more')).toHaveCount(0)
        await expect(screenOf(page).getByText('Discard draft')).toHaveCount(0)
    })

    bothSizes('(8) Cancel asks only when there are unsaved changes', async (page, size) => {
        const ids = await begin(page, size)
        const writes = trackWrites(page)
        const screen = screenOf(page)
        const dialog = discardChangesTitle(page)

        // No changes: back without a dialog.
        await page.getByTestId('opening-cancel').click()
        await expect(screen).toBeHidden()
        await expect(dialog).toHaveCount(0)
        await openFromChart(page)

        // Unsaved changes: the dialog opens; its cancel keeps the form.
        await type(page, ids['Office Equipment'], '100')
        await page.getByTestId('opening-cancel').click()
        await expect(dialog).toBeVisible()
        await dialogCancelButton(page).click()
        await expect(dialog).toHaveCount(0)
        await expect(screen).toBeVisible()
        await expectAmount(page, ids['Office Equipment'], '100.00')

        // Its confirm leaves to the Chart of Accounts.
        await page.getByTestId('opening-cancel').click()
        await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
        await expect(screen).toBeHidden()
        await expect(page.getByTestId('account-search')).toBeVisible()
        await openFromChart(page)
        await expectAmount(page, ids['Office Equipment'], '')

        // Right after a successful save the form is clean: no prompt.
        await type(page, ids['Office Equipment'], '5,000')
        await saveAndSettle(page, writes)
        await page.getByTestId('opening-cancel').click()
        await expect(screen).toBeHidden()
        await expect(dialog).toHaveCount(0)
        await discardExistingDraft(page)
    })

    bothSizes('(9) Discard draft deletes the draft after a confirmation', async (page, size) => {
        const ids = await begin(page, size)
        const writes = trackWrites(page)
        await type(page, ids['Office Equipment'], '5,000')
        await saveAndSettle(page, writes)
        await reopen(page)
        await expectAmount(page, ids['Office Equipment'], '5,000.00')

        const dialog = discardDraftTitle(page)
        await openDiscardDialog(page)
        await dialogCancelButton(page).click()
        await expect(dialog).toHaveCount(0)
        await expect(discardTrigger(page)).toBeVisible()
        await expectAmount(page, ids['Office Equipment'], '5,000.00')

        await openDiscardDialog(page)
        await confirmDiscard(page)
        await expect(discardTrigger(page)).toHaveCount(0)
        await leaveToChart(page)
        await openFromChart(page)
        await expectAmount(page, ids['Office Equipment'], '')
        await expect(discardTrigger(page)).toHaveCount(0)
        await discardExistingDraft(page)
    })

    bothSizes(
        '(10) Save draft is disabled and sends nothing for a Too large figure',
        async (page, size) => {
            const ids = await begin(page, size)
            const writes = trackWrites(page)
            await type(page, ids['Office Equipment'], '20,000,000,000,000')
            await expect(page.getByTestId('opening-totals-problem')).toContainText('Too large')
            await expect(saveButton(page)).toBeVisible()
            await expect(saveButton(page)).toBeDisabled()

            // Counted from the moment of the press; a POST to the entries
            // collection is the first request a save would send.
            let entryPosts = 0
            page.on('request', request => {
                if (
                    request.method() === 'POST' &&
                    request.url().includes('/books_journal_entries')
                ) {
                    entryPosts += 1
                }
            })
            await saveButton(page).click({ force: true })
            await amount(page, ids['Office Equipment']).focus()
            await page.keyboard.press('Enter')

            // Leaving and re-opening lets any pending work settle: a draft that
            // exists now would show its Discard trigger.
            await reopen(page)
            await expect(discardTrigger(page)).toHaveCount(0)
            await expectAmount(page, ids['Office Equipment'], '')
            expect(entryPosts).toBe(0)
            expect(writes.count()).toBe(0)
            await discardExistingDraft(page)
        }
    )
})

// Checkpoint 6 (post and posted view). The REAL post happens once, in test (3):
// an opening entry is permanent, the e2e database is shared by this file in
// order, so every test that needs a draft or a form runs before it, and the
// read-only test (5) runs after it. The header badge is `opening-status-badge`
// (text Draft or Posted). "View journal entry" (`opening-view-entry`) is the
// link to the posted entry, shown now that Journal Entries has shipped.

function postButton(page: Page) {
    return page.getByTestId('opening-post')
}

// The nearest ancestor of an account's name that also holds a figure is the
// account's row or card, whatever the layout.
function figureRowOf(page: Page, name: string) {
    return screenOf(page)
        .getByText(name, { exact: true })
        .locator('xpath=ancestor::*[.//text()[contains(., "$")]][1]')
}

async function expectPostedView(page: Page, ids: Record<string, string>) {
    const screen = screenOf(page)
    await expect(screen).toBeVisible()
    await expect(screen.getByText('Opening balances', { exact: true })).toBeVisible()
    await expect(page.getByTestId('opening-status-badge')).toBeVisible()
    await expect(page.getByTestId('opening-status-badge')).toHaveText('Posted')
    await expect(page.getByTestId('opening-posted-line')).toBeVisible()
    await expect(page.getByTestId('opening-posted-line')).toHaveText(
        /(?:[A-Za-z]+-)?\d+ · [A-Z][a-z]{2} \d{1,2}, \d{4} · posted by .+ on [A-Z][a-z]{2} \d{1,2}, \d{4}/
    )

    // Amounts are text: no input of any kind in the screen.
    await expect(screen.locator('input, textarea')).toHaveCount(0)
    for (const group of GROUPS) {
        await expect(page.getByTestId(`opening-band-${group}`)).toBeVisible()
    }
    // Only the two non-zero accounts are listed.
    await expect(figureRowOf(page, 'Office Equipment')).toContainText('$5,000.00')
    await expect(figureRowOf(page, 'Company Card')).toContainText('$1,200.00')
    for (const name of ['Business Checking', 'Accounts receivable', "Owner's Equity"]) {
        await expect(screen.getByText(name, { exact: true })).toHaveCount(0)
        await expect(page.getByTestId(`opening-amount-${ids[name]}`)).toHaveCount(0)
    }
    await expect(figureRowOf(page, 'Opening Balance Equity')).toContainText('$3,800.00')

    await expect(page.getByTestId('opening-total-assets')).toHaveText('$5,000.00')
    await expect(page.getByTestId('opening-total-liabilities')).toHaveText('$1,200.00')
    await expect(page.getByTestId('opening-total-equity')).toHaveText('$3,800.00')
    await expect(page.getByText('Equity (including Opening Balance Equity)')).toBeVisible()

    // No preview, no action bar, no form controls.
    await expect(page.getByTestId('opening-preview')).toHaveCount(0)
    await expect(page.getByTestId('opening-preview-toggle')).toHaveCount(0)
    await expect(page.getByTestId('opening-actions')).toHaveCount(0)
    await expect(page.getByTestId('opening-save')).toHaveCount(0)
    await expect(postButton(page)).toHaveCount(0)
    await expect(page.getByTestId('opening-date')).toHaveCount(0)
    await expect(page.getByTestId('opening-view-entry')).toHaveText('View journal entry')
}

function postedRow(page: Page, id: string) {
    return page.getByTestId(`opening-posted-row-${id}`)
}

async function expectPostedTable(page: Page, ids: Record<string, string>) {
    const screen = screenOf(page)
    for (const label of ['Account', 'Detail type', 'Amount']) {
        await expect(screen.getByText(label, { exact: true })).toBeVisible()
    }
    await expect(postedRow(page, ids['Office Equipment'])).toContainText('Machinery and equipment')
    await expect(postedRow(page, ids['Company Card'])).toContainText('Credit card')
    await expect(postedRow(page, 'balancing')).toHaveText(/^Opening Balance Equity\s*\$3,800\.00$/)
}

async function expectPostedCards(page: Page, ids: Record<string, string>) {
    const screen = screenOf(page)
    await expect(screen.getByText('Detail type', { exact: true })).toHaveCount(0)
    for (const [name, typeLabel] of [
        ['Office Equipment', 'Fixed asset'],
        ['Company Card', 'Credit card'],
    ]) {
        const card = postedRow(page, ids[name])
        await expect(card).toBeVisible()
        const nameBox = await card.getByText(name, { exact: true }).boundingBox()
        const typeBox = await card.getByText(typeLabel, { exact: true }).boundingBox()
        expect(typeBox?.y ?? 0).toBeGreaterThanOrEqual((nameBox?.y ?? 0) + (nameBox?.height ?? 0))
    }
    await expectCardAmountsFlushRight(page, [
        ids['Office Equipment'],
        ids['Company Card'],
        'balancing',
    ])
    await expectTailOnOneLine(page)
    await expect(postedRow(page, 'balancing')).toHaveText(/^Opening Balance Equity\s*\$3,800\.00$/)
}

// The amount sits on the card's right side: its right edge is within the card padding
// (8px) plus border of the card's right edge, and it starts past the card's left third,
// so a left-aligned amount fails both.
async function expectCardAmountsFlushRight(page: Page, rowIds: string[]) {
    for (const id of rowIds) {
        const card = postedRow(page, id)
        const cardBox = await card.boundingBox()
        const amountBox = await card.getByText(/^\$[\d,]+\.\d{2}$/).boundingBox()
        if (!cardBox || !amountBox) throw new Error(`no boxes for posted card ${id}`)
        expect(amountBox.x + amountBox.width).toBeGreaterThanOrEqual(cardBox.x + cardBox.width - 24)
        expect(amountBox.x + amountBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width)
        expect(amountBox.x).toBeGreaterThan(cardBox.x + cardBox.width / 3)
    }
}

// 'on <date>' is one nowrap unit: its box is one text line tall, so the year never
// wraps onto a line of its own.
async function expectTailOnOneLine(page: Page) {
    const tail = page.getByTestId('opening-posted-line').getByText(/^on [A-Z][a-z]{2} \d/)
    await expect(tail).toBeVisible()
    const { height, lineHeight } = await tail.evaluate(el => {
        const style = getComputedStyle(el)
        const parsed = Number.parseFloat(style.lineHeight)
        const fallback = Number.parseFloat(style.fontSize) * 1.5
        return {
            height: el.getBoundingClientRect().height,
            lineHeight: Number.isNaN(parsed) ? fallback : parsed,
        }
    })
    expect(height).toBeLessThan(lineHeight * 1.6)
}

function todayLabel() {
    const now = new Date()
    return dayText(`${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`)
}

test.describe('opening-balances: post and posted view', () => {
    bothSizes(
        '(1) Post is disabled until an amount is typed and while a figure is Too large',
        async (page, size) => {
            const ids = await begin(page, size)
            await expect(postButton(page)).toBeVisible()
            await expect(postButton(page)).toHaveText('Post')
            await expect(postButton(page)).toBeDisabled()

            await type(page, ids['Office Equipment'], '5,000')
            await expect(postButton(page)).toBeEnabled()

            await type(page, ids['Office Equipment'], '20,000,000,000,000')
            await expect(page.getByTestId('opening-totals-problem')).toContainText('Too large')
            await expect(postButton(page)).toBeDisabled()

            await type(page, ids['Office Equipment'], '')
            await expect(postButton(page)).toBeDisabled()
            await leaveToChart(page)
            await discardExistingDraft(page)
        }
    )

    bothSizes(
        '(2) a refused post shows the message, stays on the form and keeps the saved draft',
        async (page, size) => {
            const ids = await begin(page, size)
            await page.route(`${ENTRY_WRITES}/*`, async route => {
                const request = route.request()
                if (request.method() !== 'PATCH' || request.postDataJSON()?.status !== 'posted') {
                    await route.continue()
                    return
                }
                await route.fulfill({
                    status: 400,
                    body: JSON.stringify({
                        message: 'Books are closed through Mar 31, 2025.',
                        data: {},
                    }),
                })
            })
            await type(page, ids['Office Equipment'], '5,000')
            await postButton(page).click()

            const summary = page.getByTestId('opening-error-summary')
            await expect(summary).toBeVisible()
            await expect(summary).toContainText('Books are closed through Mar 31, 2025.')
            await expect(screenOf(page)).toBeVisible()
            await expect(postButton(page)).toHaveText('Post')
            await expect(postButton(page)).toBeEnabled()
            await expectAmount(page, ids['Office Equipment'], '5,000.00')
            await expect(page.getByTestId('opening-status-badge')).toHaveText('Draft')
            await page.unrouteAll({ behavior: 'wait' })

            await reopen(page)
            await expect(page.getByTestId('opening-status-badge')).toHaveText('Draft')
            await expectAmount(page, ids['Office Equipment'], '5,000.00')
            await discardExistingDraft(page)
        }
    )

    test('(3) Post shows Posting..., then the read-only posted view', async ({ page }) => {
        const ids = await begin(page, DESKTOP)
        // The entry this posts is the one checkpoint 7 replaces and finds in the register. End
        // of last month does not depend on the fiscal start month, which other specs change on
        // the shared DB, so the register's Last month range holds it whatever that month is.
        await choosePreset(page, 'End of last month')
        await expect(page.getByTestId('opening-preset')).toContainText('End of last month')
        let release: () => void = () => {}
        const held = new Promise<void>(resolve => {
            release = resolve
        })
        await page.route(`${ENTRY_WRITES}/*`, async route => {
            const request = route.request()
            if (request.method() === 'PATCH' && request.postDataJSON()?.status === 'posted') {
                await held
            }
            await route.continue()
        })
        await type(page, ids['Office Equipment'], '5,000')
        await type(page, ids['Company Card'], '1,200')
        await postButton(page).click()

        await expect(postButton(page)).toHaveText('Posting...')
        await expect(postButton(page)).toBeDisabled()
        await expect(saveButton(page)).toBeDisabled()
        release()
        await expect(page.getByTestId('opening-status-badge')).toHaveText('Posted')
        await page.unrouteAll({ behavior: 'wait' })

        await expectPostedView(page, ids)
        await expectPostedTable(page, ids)
        const line = page.getByTestId('opening-posted-line')
        await expect(line).toHaveText(/ on [A-Z][a-z]{2} \d{1,2}, \d{4}$/)
        await expect(line).toContainText(`on ${todayLabel()}`)
    })

    test('(4) the posted view at phone size, and when re-opened from the chart', async ({
        page,
    }) => {
        await start(page, PHONE)
        await openChart(page)
        const ids = await idsFromChart(page)
        await openFromChart(page)
        await expectPostedView(page, ids)
        await expectPostedCards(page, ids)

        await leaveToChart(page)
        await openFromChart(page)
        await expectPostedView(page, ids)
        await expectPostedCards(page, ids)
        await expect(page.getByTestId('opening-totals')).toBeVisible()
    })

    test('(4b) the posted view switches between the table and cards when the window is resized', async ({
        page,
    }) => {
        await start(page, DESKTOP)
        await openChart(page)
        const ids = await idsFromChart(page)
        await openFromChart(page)
        await expectPostedTable(page, ids)

        await page.setViewportSize(PHONE)
        await expectPostedCards(page, ids)
        await expectPostedView(page, ids)

        await page.setViewportSize(DESKTOP)
        await expectPostedTable(page, ids)
        await expectPostedView(page, ids)
    })

    test('(4c) at a narrow wide window the Amount column is reachable in the horizontal scroller', async ({
        page,
    }) => {
        await start(page, { width: 800, height: 800 })
        await openChart(page)
        const ids = await idsFromChart(page)
        await openFromChart(page)
        await expectPostedView(page, ids)

        const header = screenOf(page).getByText('Amount', { exact: true })
        await header.scrollIntoViewIfNeeded()
        await expect(header).toBeVisible()
        const figure = postedRow(page, ids['Office Equipment']).getByText('$5,000.00')
        await figure.scrollIntoViewIfNeeded()
        await expect(figure).toBeVisible()
        const box = await figure.boundingBox()
        if (!box) throw new Error('no box for the Office Equipment amount')
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(800)
    })

    test('(5) a read-only user sees the posted entry as text with no actions', async ({ page }) => {
        await start(page, DESKTOP)
        await openChart(page)
        const ids = await idsFromChart(page)
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
        await openFromChart(page)

        await expectPostedView(page, ids)
        await expect(page.getByRole('button', { name: 'Edit balances' })).toHaveCount(0)
        await expect(screenOf(page).getByText('Edit balances')).toHaveCount(0)
        await page.unrouteAll({ behavior: 'ignoreErrors' })
    })
})

// Checkpoint 7 (replace a posted entry, register label, help). These tests rely
// on the entry the "post and posted view" describe left posted (file order, one
// worker, a fresh database per run). Tests (1), (2) and (4) leave the original
// entry untouched and run first, because they assert its original figures (5,000
// and 1,200); test (3) then replaces it (6,000 at desktop, 7,000 at phone, which
// seeds from the 6,000), and (5) and (6) do not depend on the figures. Each test ends with the replacement
// posted or its draft discarded. The Journal Entries hand-off is Go-tested in
// checkpoint 0 and has no e2e, because Journal Entries has no screen yet.

async function openPosted(page: Page, size: { width: number; height: number }) {
    await start(page, size)
    await openChart(page)
    const ids = await idsFromChart(page)
    await openFromChart(page)
    await expect(page.getByTestId('opening-status-badge')).toHaveText('Posted')
    await expect(editBalances(page)).toBeVisible()
    return ids
}

function editBalances(page: Page) {
    return page.getByTestId('opening-edit-balances')
}

// The posted header line starts with the entry number (the seeded prefix is
// empty, so it is plain digits), followed by " · ".
async function postedNumber(page: Page) {
    const line = page.getByTestId('opening-posted-line')
    await expect(line).toBeVisible()
    const match = /^((?:[A-Za-z]+-)?\d+) ·/.exec(await line.innerText())
    if (!match) throw new Error('the posted line does not start with an entry number')
    return match[1]
}

// "Edit balances" is a filled primary button in the header's right actions
// area: above the first band, right of centre on a wide screen, below the
// title when the actions wrap on a phone.
async function expectEditButtonInHeader(page: Page) {
    const screen = screenOf(page)
    const button = editBalances(page)
    const box = await button.boundingBox()
    const screenBox = await screen.boundingBox()
    const bandBox = await page.getByTestId('opening-band-asset').boundingBox()
    const titleBox = await screen
        .getByText('Opening balances', { exact: true })
        .first()
        .boundingBox()
    if (!box || !screenBox || !bandBox || !titleBox) throw new Error('missing layout boxes')
    expect(box.y + box.height).toBeLessThanOrEqual(bandBox.y)
    if (isPhone(page)) {
        expect(box.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height)
    } else {
        expect(box.x + box.width).toBeGreaterThan(screenBox.x + screenBox.width / 2)
    }
    const background = await button.evaluate(el => getComputedStyle(el).backgroundColor)
    expect(background).not.toBe('rgba(0, 0, 0, 0)')
    const screenBackground = await screen.evaluate(el => getComputedStyle(el).backgroundColor)
    expect(background).not.toBe(screenBackground)
}

function replaceNotice(number: string) {
    return `Posting this replaces ${number} under the same number. The original is voided.`
}

function draftNotice(number: string) {
    return `Posting this replaces ${number}. The posted balances stay until you post.`
}

async function openReplaceForm(
    page: Page,
    ids: Record<string, string>,
    seededOfficeEquipment = '5,000.00'
) {
    await editBalances(page).click()
    await expect(page.getByTestId('opening-edit-back')).toBeVisible()
    await expect(page.getByTestId('opening-status-badge')).toBeVisible()
    await expectAmount(page, ids['Office Equipment'], seededOfficeEquipment)
}

test.describe('opening-balances: replace a posted entry', () => {
    bothSizes(
        '(1) Edit balances opens the form seeded from the posted lines with the replace notice and writes nothing',
        async (page, size) => {
            const ids = await openPosted(page, size)
            const number = await postedNumber(page)
            const writes = trackWrites(page)

            await expectEditButtonInHeader(page)
            await openReplaceForm(page, ids)
            await expectAmount(page, ids['Company Card'], '1,200.00')
            await expect(page.getByTestId('opening-notice')).toBeVisible()
            await expect(page.getByTestId('opening-notice')).toHaveText(replaceNotice(number))
            await expect(editBalances(page)).toHaveCount(0)

            await leaveToChart(page)
            await openFromChart(page)
            await expectPostedView(page, ids)
            expect(await postedNumber(page)).toBe(number)
            expect(writes.count()).toBe(0)
        }
    )

    bothSizes('(2) Back returns to the posted view', async (page, size) => {
        const ids = await openPosted(page, size)
        const number = await postedNumber(page)

        await openReplaceForm(page, ids)
        await page.getByTestId('opening-edit-back').click()

        await expectPostedView(page, ids)
        await expect(editBalances(page)).toBeVisible()
        await expect(page.getByTestId('opening-edit-back')).toHaveCount(0)
        await expect(page.getByTestId('opening-notice')).toHaveCount(0)
        expect(await postedNumber(page)).toBe(number)
    })

    bothSizes(
        '(4) Save draft keeps a replacing draft that wins over the posted entry until it is discarded',
        async (page, size) => {
            const ids = await openPosted(page, size)
            const number = await postedNumber(page)
            const writes = trackWrites(page)

            await openReplaceForm(page, ids)
            await saveAndSettle(page, writes)
            await expect(page.getByTestId('opening-notice')).toHaveText(draftNotice(number))

            await reopen(page)
            await expect(page.getByTestId('opening-status-badge')).toHaveText('Draft')
            await expect(page.getByTestId('opening-notice')).toHaveText(draftNotice(number))
            await expectAmount(page, ids['Office Equipment'], '5,000.00')
            await expect(editBalances(page)).toHaveCount(0)

            await openDiscardDialog(page)
            await confirmDiscard(page)
            await reopen(page)
            await expectPostedView(page, ids)
            expect(await postedNumber(page)).toBe(number)
        }
    )

    for (const [sizeName, size, typed, shown, seeded] of [
        ['desktop', DESKTOP, '6,000', '$6,000.00', '5,000.00'],
        // The form seeds from the entry the desktop run left posted at 6,000.
        ['phone', PHONE, '7,000', '$7,000.00', '6,000.00'],
    ] as const) {
        test(`(3) changing Office Equipment and pressing Post replaces the entry under the same number (${sizeName})`, async ({
            page,
        }) => {
            const ids = await openPosted(page, size)
            const number = await postedNumber(page)

            await openReplaceForm(page, ids, seeded)
            await type(page, ids['Office Equipment'], typed)

            // Hold the draft POST so the write stays in flight: Back must not be
            // usable meanwhile. The draft row is inserted optimistically, which
            // moves the screen out of the replace state, so Back is either
            // already gone or disabled; it is never enabled. Releasing the
            // route completes the post.
            let release: () => void = () => {}
            const held = new Promise<void>(resolve => {
                release = resolve
            })
            await page.route(ENTRY_WRITES, async route => {
                if (route.request().method() === 'POST') {
                    await held
                }
                await route.continue()
            })
            await postButton(page).click()
            await expect(saveButton(page)).toHaveText('Saving...')
            const back = page.getByTestId('opening-edit-back')
            await expect
                .poll(async () => (await back.count()) === 0 || (await back.isDisabled()))
                .toBe(true)
            release()
            await page.unrouteAll({ behavior: 'wait' })

            await expect(editBalances(page)).toBeVisible()
            await expect(page.getByTestId('opening-status-badge')).toHaveText('Posted')
            await expect(postButton(page)).toHaveCount(0)
            await expect(page.getByTestId('opening-total-assets')).toHaveText(shown)
            await expect(figureRowOf(page, 'Office Equipment')).toContainText(shown)
            await expect(figureRowOf(page, 'Company Card')).toContainText('$1,200.00')
            expect(await postedNumber(page)).toBe(number)

            await reopen(page)
            await expect(page.getByTestId('opening-status-badge')).toHaveText('Posted')
            await expect(page.getByTestId('opening-total-assets')).toHaveText(shown)
            expect(await postedNumber(page)).toBe(number)
        })
    }

    bothSizes(
        '(5) the register names the opening entry "Opening balances" in the Type column',
        async (page, size) => {
            await start(page, size)
            await openRegister(page, 'Office Equipment')
            // Post test (3) dated the entry at the end of last month, and each replacement keeps
            // that date, so Last month holds all three whatever the fiscal start month is.
            await page.getByTestId('register-range').click()
            await page.getByRole('menuitem', { name: 'Last month', exact: true }).click()
            await expect(page.getByTestId('register-range')).toContainText('Last month')

            if (isPhone(page)) {
                // The entry's memo can read the same, so match the card's detail
                // line, where the type label follows " · ". Each earlier
                // replacement (desktop, then phone) voided its predecessor, and
                // both voided entries stay listed, marked Void.
                const cards = page.locator('[data-testid^="register-card-"]')
                const live = cards.filter({ hasText: /· Opening balances(?! · Void)/ })
                await expect(live).toHaveCount(1)
                await expect(live).toBeVisible()
                await expect(cards.filter({ hasText: /· Opening balances · Void/ })).toHaveCount(2)
                return
            }
            // The type cell holds the label and a separate Void marker.
            const types = page.locator('[data-testid^="register-cell-type-"]')
            const live = types.filter({ hasText: /^Opening balances$/ })
            await expect(live).toHaveCount(1)
            await expect(live).toBeVisible()
            await expect(types.filter({ hasText: /^Opening balances\s*Void$/ })).toHaveCount(2)
        }
    )

    bothSizes(
        '(6) the header help icon opens the Opening balances help topic',
        async (page, size) => {
            await start(page, size)
            await openChart(page)
            await openFromChart(page)
            await expect(page.getByTestId('opening-status-badge')).toHaveText('Posted')
            const titles = page.getByText('Opening balances', { exact: true })
            const before = await titles.count()
            await expect(page.getByText('Save draft')).toHaveCount(0)

            await page.getByTestId('opening-help').getByRole('button').click()

            // The drawer adds its own title next to the screen's title, and the
            // topic body names the Save draft action the posted view lacks.
            await expect.poll(() => titles.count()).toBeGreaterThan(before)
            await expect(page.getByText('Save draft').first()).toBeVisible()
        }
    )
})

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
// Checkpoint 2 (states and date). The read-only test fulfils the real
// books_access response with level read_only, because the seed has no read-only
// Books member. It covers the client only; server enforcement stays covered by
// the Go tests. The loading, empty-chart and error tests hold or replace the
// books_accounts or books_settings read. They reload the page on the opened screen so
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

test.describe('opening-balances: states and date', () => {
    test('the date block defaults, follows presets and keeps a typed memo', async ({ page }) => {
        await start(page, DESKTOP)
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
        await expect(page.getByTestId('opening-memo')).toHaveValue('Converted from the old books')

        await page.getByTestId('opening-memo').fill('')
        await expect(page.getByTestId('opening-memo')).toHaveValue(
            'Opening balances as of Jul 1, 2025'
        )
    })

    test('shows the loading state while accounts are held', async ({ page }) => {
        await start(page, DESKTOP)
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
        await expect(page.getByTestId('opening-date')).toHaveCount(0)
        release()
        await expect(page.getByTestId('opening-date')).toBeVisible()
        await expect(page.getByTestId('opening-loading')).toHaveCount(0)
        await page.unrouteAll({ behavior: 'ignoreErrors' })
    })

    test('an empty chart shows the empty state and a link to the chart', async ({ page }) => {
        await start(page, DESKTOP)
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

    test('a failed accounts or settings read shows the error, and Retry recovers', async ({
        page,
    }) => {
        await start(page, DESKTOP)
        await openOpeningBalances(page)
        for (const url of [ACCOUNTS, SETTINGS]) {
            await page.route(url, route =>
                route.fulfill({ status: 400, contentType: 'application/json', body: '{}' })
            )
            await page.reload()

            const alert = page
                .getByRole('alert')
                .filter({ hasText: 'Could not load opening balances' })
            await expect(alert).toBeVisible()

            // The failing query re-requests its collection in a tight loop, so
            // requests are in flight when the route is removed. 'wait' lets every
            // running handler finish, so no 400 is issued after Retry.
            await page.unrouteAll({ behavior: 'wait' })
            await page.getByTestId('opening-retry').click()
            await expect(page.getByTestId('opening-date')).toBeVisible()
            await expect(page.getByTestId('opening-error')).toHaveCount(0)
        }
    })

    test('a read-only user sees the no-entry message and no date block or actions', async ({
        page,
    }) => {
        await start(page, DESKTOP)
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
        await expect(page.getByTestId('opening-save')).toHaveCount(0)
        await expect(page.getByTestId('opening-post')).toHaveCount(0)
        await page.unrouteAll({ behavior: 'ignoreErrors' })
    })
})

// Checkpoint 3 (account grid and amounts). Nothing is saved. Account ids are
// read from the Chart of Accounts test ids by `openWithIds`. The seed chart has
// no balance-sheet sub-account, so no test creates one: the indentation and
// ordering rule is covered by `pickOpeningBands` in checkpoint 1's unit tests.
// The "Inactive" label is covered there; here only the absence of inactive rows
// is asserted. The grid logic is the same at every size, so it runs at desktop
// size; the amount error also runs at phone size, where each account is a card
// whose error takes the helper line.

// The Chart of Accounts stays mounted behind this screen on desktop and shows
// some of the same text, so grid text is always read inside the screen.
function screenOf(page: Page) {
    return page.getByTestId('opening-balances-screen')
}

function amount(page: Page, id: string) {
    return page.getByTestId(`opening-amount-${id}`)
}

test.describe('opening-balances: account grid and amounts', () => {
    test('the grid lists only balance-sheet accounts', async ({ page }) => {
        await start(page, DESKTOP)
        // The seed has no Opening Balance Equity account (it is created on post), so it
        // has no chart row to resolve; its absence is checked by text below.
        const excluded = ['Rent', 'Consulting Income', 'Design Tools']
        const ids = await openWithIds(page, GRID_NAMES, excluded)

        const screen = screenOf(page)
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

    test('the amount input formats on blur and the sign toggle flips the sign', async ({
        page,
    }) => {
        await start(page, DESKTOP)
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

    for (const [sizeName, size] of SIZES) {
        test(`an unparsable or oversized amount shows an error (${sizeName})`, async ({ page }) => {
            await start(page, size)
            const ids = await openWithIds(page)
            const id = ids['Office Equipment']
            const error = page.getByTestId(`opening-amount-error-${id}`)

            for (const [text, message] of [
                ['abc', 'Enter an amount like 1,234.50'],
                ['99,999,999,999,999,999', 'Amount is too large'],
            ]) {
                await amount(page, id).fill(text)
                await amount(page, id).blur()
                await expect(error).toBeVisible()
                await expect(error).toHaveText(message)
            }
        })
    }

    test('receivable shows the no-detail helper and a bank account shows none', async ({
        page,
    }) => {
        await start(page, DESKTOP)
        const ids = await openWithIds(page)

        await expect(page.getByTestId(`opening-helper-${ids['Accounts receivable']}`)).toHaveText(
            'No customer or vendor detail'
        )
        await expect(page.getByTestId(`opening-helper-${ids['Business Checking']}`)).toHaveCount(0)
    })

    test('an inactive account with no saved line is not listed', async ({ page }) => {
        await start(page, DESKTOP)
        await openWithIds(page)

        await expect(screenOf(page).getByText('Old Petty Cash')).toHaveCount(0)
        await expect(page.locator('[data-testid^="opening-inactive-"]')).toHaveCount(0)
    })

    test('Enter in an amount moves focus to the next account amount', async ({ page }) => {
        await start(page, DESKTOP)
        const ids = await openWithIds(page)
        const checking = amount(page, ids['Business Checking'])

        await checking.fill('100')
        await checking.press('Enter')
        await expect(amount(page, ids['Accounts receivable'])).toBeFocused()
    })

    test('band subtotals follow the typed amounts', async ({ page }) => {
        await start(page, DESKTOP)
        const ids = await openWithIds(page)

        await amount(page, ids['Office Equipment']).fill('5,000')
        await amount(page, ids['Office Equipment']).blur()
        await expect(page.getByTestId('opening-band-subtotal-asset')).toHaveText('$5,000.00')

        await amount(page, ids["Owner's Equity"]).fill('-500')
        await amount(page, ids["Owner's Equity"]).blur()
        await expect(page.getByTestId('opening-band-subtotal-equity')).toHaveText('-$500.00')
    })
})

// Checkpoint 4 (Balance Sheet preview and totals). Nothing is saved. Test ids
// carrying a figure sit on the element that holds the text and the tone class
// (`opening-preview-total-le`, `opening-preview-amount-<id>`,
// `opening-total-*`), so `toHaveText` and `toHaveClass` read the same element.
// Wide screens show the preview in a rail; on a phone it sits in a collapsed
// disclosure that `openPreview` opens first. The figures are the same at every
// size, so only the main preview test also runs at phone size, through the
// disclosure.

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

test.describe('opening-balances: preview and totals', () => {
    for (const [sizeName, size] of SIZES) {
        test(`typed amounts fill the preview and the totals strip, and the balancing row reconciles them (${sizeName})`, async ({
            page,
        }) => {
            await start(page, size)
            const ids = await openWithIds(page)
            await type(page, ids['Office Equipment'], '5,000')
            await type(page, ids['Company Card'], '1,200')
            await openPreview(page)

            const preview = page.getByTestId('opening-preview')
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
            await expect(page.getByTestId('opening-preview-total-assets')).toHaveText('$5,000.00')
            const total = page.getByTestId('opening-preview-total-le')
            await expect(total).toHaveText('$5,000.00')
            await expect(total).toHaveClass(/text-success/)

            await expect(page.getByTestId('opening-total-assets')).toHaveText('$5,000.00')
            await expect(page.getByTestId('opening-total-liabilities')).toHaveText('$1,200.00')
            await expect(page.getByTestId('opening-total-equity')).toHaveText('$3,800.00')
        })
    }

    test('a negative amount sits on the opposite side', async ({ page }) => {
        await start(page, DESKTOP)
        const ids = await openWithIds(page)
        await type(page, ids['Company Card'], '-500')

        await expect(page.getByTestId('opening-total-liabilities')).toHaveText('-$500.00')
        const row = page.getByTestId(`opening-preview-row-${ids['Company Card']}`)
        await expect(row).toBeVisible()
        const figure = page.getByTestId(`opening-preview-amount-${ids['Company Card']}`)
        await expect(figure).toHaveText('-$500.00')
        await expect(figure).toHaveClass(/text-destructive/)
    })

    test('the preview follows the date, an invalid date, and the amounts', async ({ page }) => {
        await start(page, DESKTOP)
        const ids = await openWithIds(page)
        const shownDate = await readDefaultDate(page)
        await type(page, ids['Office Equipment'], '5,000')
        const preview = page.getByTestId('opening-preview')
        const subtitle = page.getByTestId('opening-preview-subtitle')
        await expect(subtitle).toHaveText(`As of ${dayText(shownDate)}`)

        await page.getByTestId('opening-date').fill('2025-6-1')
        await expect(subtitle).toHaveCount(0)
        await expect(preview.getByText('As of ')).toHaveCount(0)

        await page.getByTestId('opening-date').fill('2025-06-01')
        await expect(subtitle).toHaveText('As of Jun 1, 2025')

        await type(page, ids['Office Equipment'], '')
        await expect(page.getByTestId('opening-preview-empty')).toHaveText(
            'Type a balance to see the preview.'
        )
        await expect(page.getByTestId('opening-preview-obe')).toHaveCount(0)
        await expect(
            page.getByTestId(`opening-preview-row-${ids['Office Equipment']}`)
        ).toHaveCount(0)
    })

    test('an oversized sum shows Too large in the destructive tone', async ({ page }) => {
        await start(page, DESKTOP)
        const ids = await openWithIds(page)
        await type(page, ids['Office Equipment'], '20,000,000,000,000')

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

// Checkpoint 5 (save draft and discard). The tests of this block run in the
// order of the checkpoint, before any post (the opening entry is permanent once
// posted), and the e2e database is shared by every test in the file, so each
// test starts and ends through `discardExistingDraft`. Opening Balance Equity
// persists after the first successful save, so the chart is asserted to list
// exactly one, never "created in this test". The refusals come first because
// they must happen before the first successful save. The draft logic is the same
// at every size, so it runs at desktop size; Discard draft also runs at phone
// size, where the trigger is the More menu and the confirm is a sheet.
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
    test('(1) a refused account insert shows the message, creates no draft and keeps the form', async ({
        page,
    }) => {
        const ids = await begin(page, DESKTOP)
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
    })

    test('(2) a refused line insert leaves a draft without lines that a normal save repairs', async ({
        page,
    }) => {
        const ids = await begin(page, DESKTOP)
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
    })

    test('(3) a refused date shows the server message under the date field', async ({ page }) => {
        const ids = await begin(page, DESKTOP)
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
    })

    test('(2b) a refusal of the balancing line is a root message in the summary and keeps the amounts', async ({
        page,
    }) => {
        const ids = await begin(page, DESKTOP)
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
        await expect(page.getByTestId(`opening-amount-error-${ids['Company Card']}`)).toHaveCount(0)
        await expectAmount(page, ids['Office Equipment'], '5,000.00')
        await expectAmount(page, ids['Company Card'], '1,200.00')
        expect(linePosts).toBe(3)
        await page.unrouteAll({ behavior: 'wait' })
        await discardExistingDraft(page)
    })

    test('(3b) a refused memo shows the server message under the memo field', async ({ page }) => {
        const ids = await begin(page, DESKTOP)
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
    })

    test('(9b) a refused discard keeps the draft and shows the message in the summary', async ({
        page,
    }) => {
        const ids = await begin(page, DESKTOP)
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
    })

    test('(4) the first save shows Saving..., stays on the form and ignores a double press', async ({
        page,
    }) => {
        const ids = await begin(page, DESKTOP)
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
    })

    test('(5) re-opening seeds the form from the draft and a second save adds no equity account', async ({
        page,
    }) => {
        const ids = await begin(page, DESKTOP)
        const writes = trackWrites(page)
        await page.getByTestId('opening-date').fill('2025-06-01')
        await page.getByTestId('opening-memo').fill('Converted from the old books')
        await type(page, ids['Office Equipment'], '5,000')
        await type(page, ids['Company Card'], '1,200')
        await saveAndSettle(page, writes)

        await reopen(page)
        await expect(page.getByTestId('opening-status-badge')).toHaveText('Draft')
        await expect(page.getByTestId('opening-date')).toHaveValue('2025-06-01')
        await expect(page.getByTestId('opening-memo')).toHaveValue('Converted from the old books')
        await expectAmount(page, ids['Office Equipment'], '5,000.00')
        await expectAmount(page, ids['Company Card'], '1,200.00')

        await type(page, ids['Company Card'], '1,300')
        await saveAndSettle(page, writes)
        await reopen(page)
        await expectAmount(page, ids['Company Card'], '1,300.00')
        await expectOneEquityAccount(page)
        await discardExistingDraft(page)
    })

    test('(5b) a draft saved with the default date and a blank memo re-opens following the date', async ({
        page,
    }) => {
        const ids = await begin(page, DESKTOP)
        const writes = trackWrites(page)
        const defaultDate = await readDefaultDate(page)
        await type(page, ids['Office Equipment'], '5,000')
        await saveAndSettle(page, writes)

        await reopen(page)
        await expect(page.getByTestId('opening-date')).toHaveValue(defaultDate)
        await expect(page.getByTestId('opening-preset')).toContainText('End of last fiscal year')
        await expect(page.getByTestId('opening-memo')).toHaveValue(
            `Opening balances as of ${dayText(defaultDate)}`
        )

        await page.getByTestId('opening-date').fill('2025-06-01')
        await expect(page.getByTestId('opening-memo')).toHaveValue(
            `Opening balances as of ${dayText('2025-06-01')}`
        )
        await discardExistingDraft(page)
    })

    test('(6) editing changes, clears and adds figures; clearing all leaves a draft with no lines', async ({
        page,
    }) => {
        const ids = await begin(page, DESKTOP)
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
    })

    test('(8) Cancel asks only when there are unsaved changes', async ({ page }) => {
        const ids = await begin(page, DESKTOP)
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
        await expect(page.getByTestId('opening-status-badge')).toHaveCount(0)
        await discardExistingDraft(page)
    })

    test('(10) Save draft is disabled and sends nothing for a Too large figure', async ({
        page,
    }) => {
        const ids = await begin(page, DESKTOP)
        const writes = trackWrites(page)
        await type(page, ids['Office Equipment'], '20,000,000,000,000')
        await expect(page.getByTestId('opening-totals-problem')).toContainText('Too large')
        await expect(saveButton(page)).toBeVisible()
        await expect(saveButton(page)).toBeDisabled()

        // Counted from the moment of the press; a POST to the entries
        // collection is the first request a save would send.
        let entryPosts = 0
        page.on('request', request => {
            if (request.method() === 'POST' && request.url().includes('/books_journal_entries')) {
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
    })
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
    await expect(page.getByTestId('opening-status-badge')).toBeVisible()
    await expect(page.getByTestId('opening-status-badge')).toHaveText('Posted')
    await expect(page.getByTestId('opening-posted-line')).toBeVisible()
    await expect(page.getByTestId('opening-posted-line')).toHaveText(
        /(?:[A-Za-z]+-)?\d+ · [A-Z][a-z]{2} \d{1,2}, \d{4} · posted by .+ on [A-Z][a-z]{2} \d{1,2}, \d{4}/
    )

    // Amounts are text: no input of any kind in the screen.
    await expect(screen.locator('input, textarea')).toHaveCount(0)
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
    await expect(postedRow(page, ids['Office Equipment'])).toContainText('Machinery and equipment')
    await expect(postedRow(page, ids['Company Card'])).toContainText('Credit card')
    await expect(postedRow(page, 'balancing')).toHaveText(/^Opening Balance Equity\s*\$3,800\.00$/)
}

async function expectPostedCards(page: Page, ids: Record<string, string>) {
    await expect(screenOf(page).getByText('Detail type', { exact: true })).toHaveCount(0)
    for (const [name, typeLabel] of [
        ['Office Equipment', 'Fixed asset'],
        ['Company Card', 'Credit card'],
    ]) {
        const card = postedRow(page, ids[name])
        await expect(card).toBeVisible()
        await expect(card).toContainText(typeLabel)
    }
    await expect(postedRow(page, 'balancing')).toHaveText(/^Opening Balance Equity\s*\$3,800\.00$/)
}

function todayLabel() {
    const now = new Date()
    return dayText(`${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`)
}

test.describe('opening-balances: post and posted view', () => {
    test('(1) Post is disabled until an amount is typed and while a figure is Too large', async ({
        page,
    }) => {
        const ids = await begin(page, DESKTOP)
        await expect(postButton(page)).toBeVisible()
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
    })

    test('(2) a refused post shows the message, stays on the form and keeps the saved draft', async ({
        page,
    }) => {
        const ids = await begin(page, DESKTOP)
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
    })

    test('(3) Post shows Posting..., then the read-only posted view', async ({ page }) => {
        const ids = await begin(page, DESKTOP)
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

    test('(4) the posted view at phone size shows a card per account', async ({ page }) => {
        await start(page, PHONE)
        await openChart(page)
        const ids = await idsFromChart(page)
        await openFromChart(page)
        await expectPostedView(page, ids)
        await expectPostedCards(page, ids)
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
        await page.unrouteAll({ behavior: 'ignoreErrors' })
    })
})

// Checkpoint 7 (replace a posted entry, register label, help). In file order
// these tests use the entry the "post and posted view" describe left posted (one
// worker, a fresh database per run); run alone, `ensurePosted` posts the same
// 5,000 / 1,200 entry through the form first. Tests (1) and (4) leave the entry
// untouched and run first, because they assert its original figures; test (3)
// then replaces it (6,000 at desktop, then 7,000 at phone, which seeds from the
// 6,000). Test (5) makes its own replacement and counts relative to what the
// register listed before it, and (6) does not depend on the figures. Each test
// ends with the replacement posted or its draft discarded.

function editBalances(page: Page) {
    return page.getByTestId('opening-edit-balances')
}

// Opens Opening balances from the Chart of Accounts and leaves the posted view
// open. When nothing is posted yet, it discards any saved draft and posts 5,000
// Office Equipment and 1,200 Company Card through the form, so a test that needs
// a posted entry also passes when it runs alone.
async function ensurePosted(page: Page, ids: Record<string, string>) {
    await openFromChart(page)
    const loaded = editBalances(page).or(page.getByTestId('opening-body'))
    await expect(loaded).toBeVisible()
    if (await editBalances(page).isVisible()) return
    if (await discardTrigger(page).isVisible()) {
        await openDiscardDialog(page)
        await confirmDiscard(page)
        await reopen(page)
        await expect(loaded).toBeVisible()
        if (await editBalances(page).isVisible()) return
    }
    await type(page, ids['Office Equipment'], '5,000')
    await type(page, ids['Company Card'], '1,200')
    await postButton(page).click()
    await expect(editBalances(page)).toBeVisible()
}

async function openPosted(page: Page, size: { width: number; height: number }) {
    await start(page, size)
    await openChart(page)
    const ids = await idsFromChart(page)
    await ensurePosted(page, ids)
    await expect(page.getByTestId('opening-status-badge')).toHaveText('Posted')
    await expect(editBalances(page)).toBeVisible()
    return ids
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

// Opens the Office Equipment register on the last fiscal year, where the default
// opening date falls. The type cell holds the label and a separate Void marker.
async function openOpeningTypes(page: Page) {
    await openRegister(page, 'Office Equipment')
    await page.getByTestId('register-range').click()
    await page.getByRole('menuitem', { name: 'Last fiscal year', exact: true }).click()
    await expect(page.getByTestId('register-range')).toContainText('Last fiscal year')
    const types = page.locator('[data-testid^="register-cell-type-"]')
    return {
        live: types.filter({ hasText: /^Opening balances$/ }),
        voided: types.filter({ hasText: /^Opening balances\s*Void$/ }),
    }
}

// From the posted view: Edit balances, raise Office Equipment by 1,000 over the
// seeded figure, and post the replacement.
async function replaceOfficeEquipment(page: Page, ids: Record<string, string>) {
    await expect(page.getByTestId('opening-status-badge')).toHaveText('Posted')
    await editBalances(page).click()
    const input = amount(page, ids['Office Equipment'])
    await expect(input).toHaveValue(/\d/)
    const seeded = Number((await input.inputValue()).replace(/,/g, ''))
    await type(page, ids['Office Equipment'], String(seeded + 1000))
    await postButton(page).click()
    await expect(editBalances(page)).toBeVisible()
    await expect(page.getByTestId('opening-status-badge')).toHaveText('Posted')
}

test.describe('opening-balances: replace a posted entry', () => {
    test('(1) Edit balances opens the seeded replace form, Back returns to the posted view, and nothing is written', async ({
        page,
    }) => {
        const ids = await openPosted(page, DESKTOP)
        const number = await postedNumber(page)
        const writes = trackWrites(page)

        await openReplaceForm(page, ids)
        await expectAmount(page, ids['Company Card'], '1,200.00')
        await expect(page.getByTestId('opening-notice')).toHaveText(replaceNotice(number))
        await expect(editBalances(page)).toHaveCount(0)

        await page.getByTestId('opening-edit-back').click()
        await expectPostedView(page, ids)
        await expect(editBalances(page)).toBeVisible()
        await expect(page.getByTestId('opening-edit-back')).toHaveCount(0)
        await expect(page.getByTestId('opening-notice')).toHaveCount(0)
        expect(await postedNumber(page)).toBe(number)

        await leaveToChart(page)
        await openFromChart(page)
        await expectPostedView(page, ids)
        expect(await postedNumber(page)).toBe(number)
        expect(writes.count()).toBe(0)
    })

    test('(4) Save draft keeps a replacing draft that wins over the posted entry until it is discarded', async ({
        page,
    }) => {
        const ids = await openPosted(page, DESKTOP)
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
    })

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

    test('(5) a replacement voids the opening entry in the register, and the live one reads "Opening balances"', async ({
        page,
    }) => {
        const ids = await openPosted(page, DESKTOP)
        await leaveToChart(page)
        const before = await openOpeningTypes(page)
        await expect(before.live).toHaveCount(1)
        const voided = await before.voided.count()

        await openChart(page)
        await openFromChart(page)
        await replaceOfficeEquipment(page, ids)
        await leaveToChart(page)

        const after = await openOpeningTypes(page)
        await expect(after.voided).toHaveCount(voided + 1)
        await expect(after.live).toHaveCount(1)
        await expect(after.live).toBeVisible()
    })

    test('(6) the header help icon opens the Opening balances help topic', async ({ page }) => {
        await openPosted(page, DESKTOP)
        const titles = page.getByText('Opening balances', { exact: true })
        const before = await titles.count()
        await expect(page.getByText('Save draft')).toHaveCount(0)

        await page.getByTestId('opening-help').getByRole('button').click()

        // The drawer adds its own title next to the screen's title, and the
        // topic body names the Save draft action the posted view lacks.
        await expect.poll(() => titles.count()).toBeGreaterThan(before)
        await expect(page.getByText('Save draft').first()).toBeVisible()
    })
})

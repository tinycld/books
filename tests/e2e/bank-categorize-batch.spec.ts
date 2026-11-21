import { expect, type Locator, type Page, test } from '@playwright/test'
import { TEST_USER_NAME } from '@tinycld/core/e2e-helpers'
import {
    drawerShows,
    openCategorizeDrawer,
    openEntryByMemo,
    pickAccount,
    startCategorizeAccount,
} from './bank-categorize-helpers'
import {
    inBanking,
    openMatchAccount,
    reviewRowId,
    todayDigits,
    visibleRow,
    visibleTestId,
} from './bank-match-helpers'
import { voidPostedEntry } from './books-report-helpers'

// Categorize for chosen rows (the selection bar's dialog), the Reviewed tab's Added to
// Books and its Undo, and a void made on the entry's own screen. Each test connects its own
// number-less account and imports its own OFX file (stamped descriptions, per-run cents,
// dated today, after the close date books-settings.spec.ts holds). The posting account is
// the seeded 6100 Rent, of which no spec asserts a current-month total.

const RENT = '6100 Rent'
const SUBMIT_KEY = 'ControlOrMeta+Enter'
const ADDED_ENTRY = /^Added Journal entry (\S+)\.$/
const IN_BOOKS_ADDED = /^Added · Journal entry \S+$/

const label = (stamp: string, which: string) => `${stamp} batch ${which}`
// `whole` dollars and the run's own cents, as the OFX amount and the screens show them.
const dollars = (stamp: string, whole: number) => `${whole}.${stamp.slice(-2)}`

const drawer = (page: Page) => visibleTestId(page, 'bank-txn-drawer')
const result = (page: Page) => inBanking(page, 'bank-review-result')

// Cents as the screens write money: "$1,234.56".
function moneyText(cents: number): string {
    const whole = Math.floor(cents / 100).toLocaleString('en-US')
    return `$${whole}.${String(cents % 100).padStart(2, '0')}`
}

function centsOf(text: string): number {
    const [whole, part] = text.split('.')
    return Number(whole) * 100 + Number(part)
}

// The number of the posted entry the result line names.
async function addedNumber(page: Page): Promise<string> {
    const line = await result(page)
    await expect(line).toHaveText(ADDED_ENTRY)
    return ADDED_ENTRY.exec((await line.innerText()).trim())?.[1] ?? ''
}

// The In Books cell of the visible row that shows `description`.
async function inBooksOf(page: Page, description: string): Promise<Locator> {
    const id = await reviewRowId(await visibleRow(page, description))
    return inBanking(page, `bank-review-inbooks-${id}`)
}

// Presses a tab key of the account panel and waits for its body and the URL.
async function tabByKey(page: Page, key: string, tab: 'review' | 'reviewed'): Promise<void> {
    await page.keyboard.press(key)
    await expect(await inBanking(page, `bank-tab-body-${tab}`)).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`[?&]tab=${tab}(&|$)`))
}

async function openTab(page: Page, tab: 'review' | 'reviewed'): Promise<void> {
    await (await inBanking(page, `bank-tabs-${tab}`)).click()
    await expect(await inBanking(page, `bank-tab-body-${tab}`)).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`[?&]tab=${tab}(&|$)`))
}

test.describe('bank-categorize: chosen rows and undo', () => {
    test('categorizes three chosen rows to one account from the dialog', async ({ page }) => {
        const { stamp } = await startCategorizeAccount(page, s => [
            { day: todayDigits(), amount: `-${dollars(s, 11)}`, name: label(s, 'one') },
            { day: todayDigits(), amount: `-${dollars(s, 12)}`, name: label(s, 'two') },
            { day: todayDigits(), amount: `-${dollars(s, 13)}`, name: label(s, 'three') },
        ])
        const names = ['one', 'two', 'three'].map(which => label(stamp, which))
        const spent = moneyText(
            [11, 12, 13].reduce((sum, whole) => sum + centsOf(dollars(stamp, whole)), 0)
        )

        // Search the run's rows, then choose them with the header box.
        await (await inBanking(page, 'bank-review-search')).fill(stamp)
        for (const name of names) await expect(await visibleRow(page, name)).toHaveCount(1)
        await (await inBanking(page, 'bank-review-select-all')).click()
        await expect(await inBanking(page, 'bank-review-selection-text')).toHaveText(
            `3 selected · Spent ${spent} · Received $0.00`
        )
        await expect(await inBanking(page, 'bank-review-categorize-chosen')).toBeEnabled()

        // C opens the dialog, with the choice's sums and the focus in Account.
        await page.keyboard.press('c')
        const dialog = visibleTestId(page, 'bank-categorize-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByText('Categorize 3 transactions', { exact: true })).toBeVisible()
        await expect(page.getByTestId('bank-categorize-dialog-sums')).toHaveText(
            `Spent ${spent} · Received $0.00`
        )
        await expect(page.getByTestId('bank-categorize-dialog-account')).toBeFocused()

        // ⌘↵ with no account names the missing field and sends nothing.
        await page.keyboard.press(SUBMIT_KEY)
        await expect(dialog.getByText('Choose an account.', { exact: true })).toBeVisible()
        await expect(dialog).toBeVisible()

        await pickAccount(page, 'bank-categorize-dialog-account', RENT)
        await page.keyboard.press(SUBMIT_KEY)
        await expect(dialog).toHaveCount(0)
        await expect(await result(page)).toHaveText('Categorized 3 transactions.')
        for (const name of names) await expect(await visibleRow(page, name)).toHaveCount(0)

        // Reviewed: each row reads "Added · Journal entry n", a link to its entry.
        await openTab(page, 'reviewed')
        for (const name of names) {
            const inBooks = await inBooksOf(page, name)
            await expect(inBooks).toHaveText(IN_BOOKS_ADDED)
            await expect(inBooks).toHaveAttribute('href', /books\/entries\/[^/]+$/)
        }

        // The link opens the entry, whose memo is the row's own bank description.
        const [first] = names
        const inBooks = await inBooksOf(page, first)
        const entryLabel = (await inBooks.innerText()).trim().replace(/^Added · /, '')
        await inBooks.click()
        await expect(page.getByTestId('entry-title').filter({ visible: true })).toHaveText(
            entryLabel
        )
        await expect(page.getByTestId('entry-detail-memo').filter({ visible: true })).toContainText(
            first
        )
    })

    test('undoes a categorized row with Z, from the keyboard', async ({ page }) => {
        const { stamp } = await startCategorizeAccount(page, s => [
            { day: todayDigits(), amount: `-${dollars(s, 87)}`, name: label(s, 'undo') },
        ])
        const description = label(stamp, 'undo')
        const amount = moneyText(centsOf(dollars(stamp, 87)))
        const row = await visibleRow(page, description)
        await expect(row).toHaveCount(1)

        // From here on, the keyboard only. J, Enter: the row opens on Categorize with the
        // focus in Account; typing picks the account; ⌘↵ posts it.
        await page.keyboard.press('Escape')
        await page.keyboard.press('j')
        await expect(row).toHaveAttribute('data-focused', 'true')
        await page.keyboard.press('Enter')
        await expect(drawerShows(page, description)).toBeVisible()
        const account = page.getByTestId('bank-cat-account-0')
        await expect(account).toBeFocused()
        await page.keyboard.type(RENT)
        await expect(page.getByTestId('bank-cat-account-0-search')).toHaveValue(RENT)
        await page.keyboard.press('Enter')
        await expect(account).toContainText(RENT)
        await page.keyboard.press(SUBMIT_KEY)
        const number = await addedNumber(page)
        await expect(drawer(page)).toHaveCount(0)

        // The Reviewed tab by its key; J and Enter open the row.
        await tabByKey(page, '2', 'reviewed')
        const reviewed = await visibleRow(page, description)
        await page.keyboard.press('j')
        await expect(reviewed).toHaveAttribute('data-focused', 'true')
        await page.keyboard.press('Enter')
        await expect(drawerShows(page, description)).toBeVisible()

        // Added to Books: the entry link, the line on 6100 Rent, who added it.
        const section = page.getByTestId('bank-added-section')
        await expect(section).toBeVisible()
        await expect(
            section.getByRole('link').filter({ hasText: `Journal entry ${number}` })
        ).toHaveCount(1)
        const lines = page.getByTestId('bank-added-lines')
        await expect(lines).toContainText(RENT)
        await expect(lines).toContainText(amount)
        await expect(page.getByTestId('bank-added-by')).toHaveText(
            new RegExp(`^Added .+ by ${TEST_USER_NAME}$`)
        )

        // Z: the drawer closes and the row is back on For review.
        await page.keyboard.press('z')
        await expect(drawer(page)).toHaveCount(0)
        await expect(await result(page)).toHaveText(
            `Undone. Journal entry ${number} is void and the transaction is back in For review.`
        )
        await expect(await visibleRow(page, description)).toHaveCount(0)
        await tabByKey(page, '1', 'review')
        await expect(await visibleRow(page, description)).toHaveCount(1)

        // The entry is void.
        await openEntryByMemo(page, description)
        await expect(page.getByTestId('entry-title').filter({ visible: true })).toHaveText(
            `Journal entry ${number}`
        )
        await expect(page.getByTestId('entry-badge').filter({ visible: true })).toHaveText('Void')
    })

    test('returns the row to For review when its entry is voided on its own screen', async ({
        page,
    }) => {
        const { accountName, stamp } = await startCategorizeAccount(page, s => [
            { day: todayDigits(), amount: `-${dollars(s, 88)}`, name: label(s, 'void') },
        ])
        const description = label(stamp, 'void')
        await openCategorizeDrawer(page, description)
        await expect(page.getByTestId('bank-cat-section')).toBeVisible()
        await pickAccount(page, 'bank-cat-account-0', RENT)
        await page.keyboard.press(SUBMIT_KEY)
        const number = await addedNumber(page)

        // The Reviewed row's In Books link opens the entry; its own Void voids it.
        await openTab(page, 'reviewed')
        const inBooks = await inBooksOf(page, description)
        await expect(inBooks).toHaveText(`Added · Journal entry ${number}`)
        await inBooks.click()
        await expect(page.getByTestId('entry-title').filter({ visible: true })).toHaveText(
            `Journal entry ${number}`
        )
        await voidPostedEntry(page)

        // Back in Banking: the row is on For review and not on Reviewed.
        await openMatchAccount(page, accountName)
        await expect(await visibleRow(page, description)).toHaveCount(1)
        await openTab(page, 'reviewed')
        await expect(await visibleRow(page, description)).toHaveCount(0)
    })
})

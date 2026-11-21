import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import {
    drawerShows,
    openCategorizeDrawer,
    openEntryByMemo,
    pickAccount,
    startCategorizeAccount,
} from './bank-categorize-helpers'
import {
    inBanking,
    matchOptionIds,
    openMatchAccount,
    postMatchTransfer,
    reviewRowId,
    signInWide,
    todayDigits,
    visibleRow,
    visibleTestId,
} from './bank-match-helpers'
import { BANKING_PHONE, fakeReadOnlyAccess } from './banking-helpers'
import { openReviewTab } from './for-review-helpers'
import { tabTo } from './keyboard-helpers'
import { uniqueMemo } from './transfer-helpers'

// The drawer's way switch, the Categorize way with one account, and the next-row rule.
// Each test connects its own number-less account and imports its own OFX file (stamped
// descriptions, per-run cents, dated today or the days before). The posting account is
// the seeded 6100 Rent and the payee the seeded vendor Harbor Freight Logistics; no spec
// asserts a current-month total of either. The reader test only reads the seeded
// 1000 Business Checking.

const RENT = '6100 Rent'
const VENDOR = 'Harbor Freight Logistics'
const CHECKING = '1000 Business Checking'
const PACIFIC = 'PACIFIC POWER AUTOPAY'
const AMAZON = 'AMAZON MARKETPLACE'
// The seeded review statement's row that the seed categorized (seed.ts seedBankMatch).
const DROPBOX = 'DROPBOX BUSINESS'
const CREATE_URL = '**/api/collections/books_bank_categorizations/records*'
const ALREADY_REVIEWED = 'This transaction is already reviewed.'
const SEND_FAILED = 'The transaction could not be sent. Check your connection and try again.'
// The line of the Match section's heading, which it keeps under the switch.
const MATCH_SUBTITLE = 'Books transactions that fit this bank transaction.'
// The heading's title "Match", which it drops under the switch: a text "Match" in the
// section that is not the Match button's label.
const MATCH_TITLE =
    'xpath=.//*[normalize-space(text())="Match"][not(ancestor-or-self::*[@role="button" or @data-testid="bank-match-submit"])]'
const SUBMIT_KEY = 'ControlOrMeta+Enter'
const ADDED_ENTRY = /^Added Journal entry (\S+)\.$/

const label = (stamp: string, which: string) => `${stamp} cat ${which}`
// `whole` dollars and the run's own cents, as the OFX amount and the form show them.
const dollars = (stamp: string, whole: number) => `${whole}.${stamp.slice(-2)}`

const drawer = (page: Page) => visibleTestId(page, 'bank-txn-drawer')
const result = (page: Page) => inBanking(page, 'bank-review-result')

// A local day `offset` days from today as an OFX day, 'YYYYMMDD'.
function dayDigits(offset: number): string {
    const now = new Date()
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    const month = String(day.getMonth() + 1).padStart(2, '0')
    const date = String(day.getDate()).padStart(2, '0')
    return `${day.getFullYear()}${month}${date}`
}

function money(text: string): string {
    return `$${text}`
}

// The entry read view's lines, in one snapshot: account label, debit, credit and name.
function readEntryLines(page: Page) {
    return page
        .getByTestId('entry-read-only')
        .filter({ visible: true })
        .evaluate(root => {
            const text = (id: string) =>
                (root.querySelector(`[data-testid="${id}"]`)?.textContent ?? '').trim()
            const count = root.querySelectorAll('[data-testid^="entry-line-account-"]').length
            return Array.from({ length: count }, (_, i) => ({
                account: text(`entry-line-account-${i}`),
                debit: text(`entry-line-debit-${i}`),
                credit: text(`entry-line-credit-${i}`),
                name: text(`entry-line-party-${i}`),
            }))
        })
}

// Whether the element is painted topmost at its centre point (core
// tests/e2e/sheet-in-drawer.spec.ts): an open sheet marks the rest of the document
// `inert`, and hit testing skips inert nodes, so the probe lifts `inert` and puts it back
// in one synchronous task and reads the paint order alone.
function isTopmostAtCentre(target: Locator) {
    return target.evaluate(el => {
        const inert = Array.from(document.querySelectorAll('[inert]'))
        for (const node of inert) node.removeAttribute('inert')
        const r = el.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        for (const node of inert) node.setAttribute('inert', '')
        return !!hit && el.contains(hit)
    })
}

// On a phone: opens the picker `triggerId`, checks that its search and the option
// `label` are drawn above the transaction's sheet, and picks the option.
async function pickAboveSheet(page: Page, triggerId: string, label: string) {
    const trigger = page.getByTestId(triggerId).filter({ visible: true })
    await trigger.click()
    const search = page.getByTestId(`${triggerId}-search`)
    await expect(search).toBeFocused()
    await expect.poll(() => isTopmostAtCentre(search)).toBe(true)
    await search.fill(label)
    const options = page
        .getByRole('menuitem')
        .and(page.locator(`[data-testid^="${triggerId}-option-"]`))
    await expect(options.filter({ hasNotText: label })).toHaveCount(0)
    const option = options.and(page.getByRole('menuitem', { name: label, exact: true }))
    await expect(option).toBeVisible()
    await expect.poll(() => isTopmostAtCentre(option)).toBe(true)
    await option.click()
    await expect(search).toHaveCount(0)
    await expect(trigger).toContainText(label)
}

// The number of the posted entry the result line names.
async function addedNumber(page: Page, pattern: RegExp): Promise<string> {
    const line = await result(page)
    await expect(line).toHaveText(pattern)
    return pattern.exec((await line.innerText()).trim())?.[1] ?? ''
}

test.describe('bank-categorize: drawer', () => {
    test('categorizes a row to one account from the keyboard', async ({ page }) => {
        const { accountName, stamp } = await startCategorizeAccount(page, s => [
            { day: todayDigits(), amount: `-${dollars(s, 86)}`, name: label(s, 'keys') },
        ])
        const description = label(stamp, 'keys')
        const amount = money(dollars(stamp, 86))
        const row = await visibleRow(page, description)

        // J focuses the only row; Enter opens it on Categorize, with the focus in Account.
        await page.keyboard.press('Escape')
        await page.keyboard.press('j')
        await expect(row).toHaveAttribute('data-focused', 'true')
        await page.keyboard.press('Enter')
        await expect(drawerShows(page, description)).toBeVisible()
        await expect(page.getByTestId('bank-cat-section')).toBeVisible()
        const account = page.getByTestId('bank-cat-account-0')
        await expect(account).toBeFocused()

        // Typing opens the picker; Enter picks; the focus goes on to Memo.
        await page.keyboard.type(RENT)
        await expect(page.getByTestId('bank-cat-account-0-search')).toHaveValue(RENT)
        await page.keyboard.press('Enter')
        await expect(account).toContainText(RENT)
        const memo = page.getByTestId('bank-cat-memo')
        await expect(memo).toBeFocused()
        await expect(memo).toHaveValue(description)

        // Back to Payee, the vendor, then ⌘↵.
        const payee = page.getByTestId('bank-cat-payee')
        await tabTo(page, payee, { max: 3, key: 'Shift+Tab' })
        await page.keyboard.type(VENDOR)
        await expect(page.getByTestId('bank-cat-payee-search')).toHaveValue(VENDOR)
        await page.keyboard.press('Enter')
        await expect(payee).toContainText(VENDOR)
        await page.keyboard.press(SUBMIT_KEY)

        const number = await addedNumber(page, ADDED_ENTRY)
        await expect(drawer(page)).toHaveCount(0)
        await openReviewTab(page, 'reviewed')
        await expect(await visibleRow(page, description)).toHaveCount(1)

        // The entry: the bank account credited, 6100 Rent debited, the vendor on both.
        await openEntryByMemo(page, description)
        await expect(page.getByTestId('entry-title').filter({ visible: true })).toHaveText(
            `Journal entry ${number}`
        )
        await expect
            .poll(async () => {
                const lines = await readEntryLines(page)
                return {
                    count: lines.length,
                    bankCredit: lines.find(line => line.account === accountName)?.credit,
                    rentDebit: lines.find(line => line.account === RENT)?.debit,
                    names: [...new Set(lines.map(line => line.name))],
                }
            })
            .toEqual({ count: 2, bankCredit: amount, rentDebit: amount, names: [VENDOR] })
    })

    test('switches the way with C, T and ⇧M', async ({ page }) => {
        const { accountName, stamp } = await startCategorizeAccount(page, s => [
            { day: todayDigits(), amount: `-${dollars(s, 210)}`, name: label(s, 'ways') },
            { day: todayDigits(), amount: `-${dollars(s, 211)}`, name: label(s, 'other') },
        ])
        const ways = label(stamp, 'ways')
        const other = label(stamp, 'other')
        await postMatchTransfer(
            page,
            accountName,
            dollars(stamp, 210),
            uniqueMemo('bank-categorize ways')
        )
        const row = await visibleRow(page, ways)
        const rowId = await reviewRowId(row)
        await expect(await inBanking(page, `bank-review-suggestion-${rowId}`)).toBeVisible()

        const matchTab = page.getByTestId('bank-way-match')
        const matchSection = page.getByTestId('bank-match-section')
        const catSection = page.getByTestId('bank-cat-section')
        const transferSection = page.getByTestId('bank-transfer-section')
        const catAccount = page.getByTestId('bank-cat-account-0')
        const transferAccount = page.getByTestId('bank-transfer-account')

        // Tab to the table row and Enter: the drawer narrows the list to cards, and the
        // focus goes to the selected Match tab rather than to the page body.
        await tabTo(page, row, { max: 60, fromBody: true })
        await page.keyboard.press('Enter')
        await expect(drawerShows(page, ways)).toBeVisible()
        await expect(await inBanking(page, 'bank-review-cards')).toBeVisible()
        await expect(matchTab).toBeFocused()
        await expect(matchTab).toHaveText('Match (1)')
        await expect(matchTab).toHaveClass(/\bborder-primary\b/)
        await expect(matchSection).toBeVisible()
        await expect(matchSection.getByText(MATCH_SUBTITLE, { exact: true })).toBeVisible()
        await expect(matchSection.locator(MATCH_TITLE)).toHaveCount(0)

        // C: Categorize, with the focus in its Account; Escape leaves the field only.
        await page.keyboard.press('c')
        await expect(catSection).toBeVisible()
        await expect(catAccount).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(drawerShows(page, ways)).toBeVisible()
        await expect(catAccount).not.toBeFocused()

        // T: Transfer, with the focus in its account.
        await page.keyboard.press('t')
        await expect(transferSection).toBeVisible()
        await expect(transferAccount).toBeFocused()

        // ⇧M shows Match and does not press Match.
        await page.keyboard.press('Escape')
        await page.keyboard.press('Shift+M')
        await expect(matchSection).toBeVisible()
        await expect(matchTab).toHaveClass(/\bborder-primary\b/)
        await expect(transferSection).toHaveCount(0)
        await expect(await visibleRow(page, ways)).toHaveCount(1)
        await expect(await result(page)).toHaveCount(0)

        // The way resets when the drawer shows another row.
        await page.getByTestId('bank-way-categorize').click()
        await expect(catSection).toBeVisible()
        await openCategorizeDrawer(page, other)
        await expect(catSection).toBeVisible()
        await openCategorizeDrawer(page, ways)
        await expect(matchSection).toBeVisible()
        await expect(matchTab).toHaveClass(/\bborder-primary\b/)
        await expect(catSection).toHaveCount(0)

        // With no form field focused, Escape closes the drawer.
        await expect(matchTab).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(drawer(page)).toHaveCount(0)
    })

    test('goes to the next row after Categorize and Exclude', async ({ page }) => {
        // Newest first: A, B, C, D.
        const { stamp } = await startCategorizeAccount(page, s => [
            { day: dayDigits(0), amount: `-${dollars(s, 301)}`, name: label(s, 'next a') },
            { day: dayDigits(-1), amount: `-${dollars(s, 302)}`, name: label(s, 'next b') },
            { day: dayDigits(-2), amount: `-${dollars(s, 303)}`, name: label(s, 'next c') },
            { day: dayDigits(-3), amount: `-${dollars(s, 304)}`, name: label(s, 'next d') },
        ])
        const [a, b, c, d] = ['next a', 'next b', 'next c', 'next d'].map(which =>
            label(stamp, which)
        )
        const account = page.getByTestId('bank-cat-account-0')

        // Categorize B: the drawer shows C, with the focus in its Account.
        await openCategorizeDrawer(page, b)
        await expect(page.getByTestId('bank-cat-section')).toBeVisible()
        await pickAccount(page, 'bank-cat-account-0', RENT)
        await page.keyboard.press(SUBMIT_KEY)
        await expect(drawerShows(page, c)).toBeVisible()
        await expect(account).toBeFocused()

        // E excludes C: the drawer shows D and no field holds the focus, so K moves the
        // list's stripe.
        await page.keyboard.press('Escape')
        await page.keyboard.press('e')
        await expect(drawerShows(page, d)).toBeVisible()
        await expect(account).not.toBeFocused()
        await page.keyboard.press('k')
        await expect(
            page.locator('[data-testid^="bank-review-row-"][data-focused="true"]').filter({
                visible: true,
            })
        ).toHaveCount(1)
        await expect(page.getByTestId('bank-cat-account-0-search')).toHaveCount(0)
        await expect(drawerShows(page, d)).toBeVisible()

        // Categorize D, the last row: the drawer shows the row above it, A.
        await pickAccount(page, 'bank-cat-account-0', RENT)
        await page.keyboard.press(SUBMIT_KEY)
        await expect(drawerShows(page, a)).toBeVisible()

        // Categorize A, the only row: the drawer closes and the list is empty.
        await pickAccount(page, 'bank-cat-account-0', RENT)
        await page.keyboard.press(SUBMIT_KEY)
        await expect(drawer(page)).toHaveCount(0)
        await expect(await inBanking(page, 'bank-review-empty')).toBeVisible()
    })

    test('keeps the drawer on the row when the create fails', async ({ page }) => {
        const { stamp } = await startCategorizeAccount(page, s => [
            { day: todayDigits(), amount: `-${dollars(s, 404)}`, name: label(s, 'refused') },
        ])
        const description = label(stamp, 'refused')
        const submit = page.getByTestId('bank-cat-submit')
        const refusal = page.getByTestId('bank-cat-refusal')
        await openCategorizeDrawer(page, description)
        await expect(page.getByTestId('bank-cat-section')).toBeVisible()
        await pickAccount(page, 'bank-cat-account-0', RENT)

        // A create the server refuses, held until the test answers it.
        let answer: () => void = () => {}
        const answered = new Promise<void>(resolve => {
            answer = resolve
        })
        let posted = false
        await page.route(CREATE_URL, async (route: Route) => {
            if (route.request().method() !== 'POST') return route.continue()
            posted = true
            await answered
            await route.fulfill({
                status: 400,
                json: { status: 400, message: ALREADY_REVIEWED, data: {} },
            })
        })
        await page.keyboard.press(SUBMIT_KEY)
        await expect.poll(() => posted).toBe(true)
        await expect(submit).toContainText('Categorizing…')
        await expect(submit).toBeDisabled()
        // The switch takes no press while the write is sent (its wrapper drops pointer
        // events, so the press lands under it).
        await page.getByTestId('bank-way-transfer').click({ force: true })
        await expect(page.getByTestId('bank-cat-section')).toBeVisible()
        await expect(page.getByTestId('bank-transfer-section')).toHaveCount(0)

        answer()
        await expect(refusal).toHaveText(ALREADY_REVIEWED)
        await expect(refusal).toHaveAttribute('role', 'alert')
        await expect(drawerShows(page, description)).toBeVisible()
        await expect(page.getByTestId('bank-cat-account-0')).toContainText(RENT)
        await expect(await visibleRow(page, description)).toHaveCount(1)
        await page.unrouteAll({ behavior: 'wait' })

        // A create that never reaches the server.
        await page.route(CREATE_URL, (route: Route) =>
            route.request().method() === 'POST' ? route.abort() : route.continue()
        )
        await page.keyboard.press(SUBMIT_KEY)
        await expect(refusal).toHaveText(SEND_FAILED)
        await expect(drawerShows(page, description)).toBeVisible()
        await page.unrouteAll({ behavior: 'wait' })

        // The same form sent again.
        await page.keyboard.press(SUBMIT_KEY)
        await addedNumber(page, ADDED_ENTRY)
    })

    test('picks an account and a payee from the pickers above the phone sheet', async ({
        page,
    }) => {
        const { stamp } = await startCategorizeAccount(page, s => [
            { day: todayDigits(), amount: `-${dollars(s, 390)}`, name: label(s, 'phone') },
        ])
        const description = label(stamp, 'phone')
        await page.setViewportSize(BANKING_PHONE)
        await expect(await inBanking(page, 'bank-review-cards')).toBeVisible()

        // A tap on the card opens the transaction's sheet on Categorize.
        await openCategorizeDrawer(page, description)
        await expect(page.getByTestId('bank-cat-section')).toBeVisible()

        // Each picker opens above the sheet; its pick lands in the trigger and only the
        // picker closes.
        await pickAboveSheet(page, 'bank-cat-account-0', RENT)
        await expect(drawerShows(page, description)).toBeVisible()
        await pickAboveSheet(page, 'bank-cat-payee', VENDOR)
        await expect(drawerShows(page, description)).toBeVisible()
        await expect(page.getByTestId('bank-cat-account-0')).toContainText(RENT)

        // With a picker open, Escape closes the picker and the sheet stays open.
        await page.getByTestId('bank-cat-account-0').filter({ visible: true }).click()
        const search = page.getByTestId('bank-cat-account-0-search')
        await expect(search).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(search).toHaveCount(0)
        await expect(drawer(page)).toBeVisible()
        await expect(drawerShows(page, description)).toBeVisible()
        await expect(page.getByTestId('bank-cat-account-0')).toContainText(RENT)
    })

    test('a reader sees no way switch and no form', async ({ page }) => {
        await fakeReadOnlyAccess(page)
        await signInWide(page)
        await openMatchAccount(page, CHECKING)
        const ways = page.locator('[data-testid^="bank-way"]')
        const catSection = page.getByTestId('bank-cat-section')
        const transferSection = page.getByTestId('bank-transfer-section')
        const matchSection = page.getByTestId('bank-match-section')

        // A row with no suggestion: nothing under the facts.
        await openCategorizeDrawer(page, AMAZON)
        await expect(page.getByTestId('bank-txn-status')).toHaveText('For review')
        await expect(matchSection).toHaveCount(0)
        await expect(ways).toHaveCount(0)
        await expect(catSection).toHaveCount(0)
        await expect(transferSection).toHaveCount(0)
        await page.keyboard.press('c')
        await page.keyboard.press('t')
        await expect(drawer(page)).toBeVisible()
        await expect(catSection).toHaveCount(0)
        await expect(transferSection).toHaveCount(0)

        // A row with one suggestion: the Match list as a reader sees it.
        await openCategorizeDrawer(page, PACIFIC)
        await expect(matchSection).toBeVisible()
        await matchOptionIds(page, 1)
        await expect(page.getByTestId('bank-match-submit')).toHaveCount(0)
        await expect(ways).toHaveCount(0)

        // For review offers a reader no choosing and no Categorize for chosen rows.
        await expect(
            page.locator('[data-testid^="bank-review-check-"]').filter({ visible: true })
        ).toHaveCount(0)
        await expect(page.getByTestId('bank-review-categorize-chosen')).toHaveCount(0)

        // Reviewed: the seeded added row reads "Added · Journal entry n" as a link, and its
        // drawer shows the Added to Books facts with no Undo.
        await openReviewTab(page, 'reviewed')
        const dropbox = await visibleRow(page, DROPBOX)
        const dropboxId = await reviewRowId(dropbox)
        const inBooks = await inBanking(page, `bank-review-inbooks-${dropboxId}`)
        await expect(inBooks).toHaveText(/^Added · Journal entry \S+$/)
        await expect(inBooks).toHaveAttribute('href', /books\/entries\/[^/]+$/)
        await dropbox.getByText(DROPBOX, { exact: true }).click()
        await expect(drawerShows(page, DROPBOX)).toBeVisible()
        await expect(page.getByTestId('bank-added-section')).toBeVisible()
        await expect(page.getByTestId('bank-added-by')).toHaveText(/^Added .+ by .+$/)
        await expect(page.getByTestId('bank-added-undo')).toHaveCount(0)
        await page.unrouteAll({ behavior: 'wait' })
    })
})

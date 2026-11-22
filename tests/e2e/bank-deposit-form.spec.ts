import { expect, type Page, type Request, test } from '@playwright/test'
import { depositItemsMinWidth } from '../../tinycld/books/lib/deposit-columns'
import { openRegister, PHONE, revealRegisterItem } from './account-register-helpers'
import {
    DEPOSIT_URL,
    depositItemLineId,
    depositItemRow,
    depositItemTick,
    NEW_DEPOSIT_URL,
    OTHER_RECEIPT_CUSTOMER,
    openBooks,
    openDepositBySearch,
    openNewDeposit,
    postUndepositedReceipt,
    RECEIPT_CUSTOMER,
    shownDeposit,
    tickDepositItem,
    uniqueReference,
} from './bank-deposit-helpers'
import { uniqueMemo } from './invoice-helpers'
import { holdRequests, settleFrames } from './journal-entries-helpers'
import { tabTo } from './keyboard-helpers'
import {
    LIST_MARGIN,
    rightEdge,
    sidewaysOverflow,
    viewportForListWidth,
} from './payment-grid-width-helpers'
import { localDay } from './receive-payment-helpers'
import { isDisabled } from './record-form-helpers'

// The deposit form (bank deposit spec §3.2 to §3.7): + New → Bank deposit, the Deposit to and
// date band, the Undeposited funds list (grid wide, cards on a phone), the selection by
// mouse, touch and keyboard, the sort headers, Selected and the Deposit total, the memo, and
// Post, Post & new, the leave guard, a held post, refused posts and a refused list read.
//
// Each test posts its own sales receipts to Undeposited funds, dated today, with a per-run
// reference no. and memo, and finds their rows by the reference. No step ticks or posts a
// seeded item, and no assertion counts or sums the whole list (other workers add rows to
// it). Refusals are forced with route.fulfill(400); the held post with holdRequests.
//
// Not covered here: Save draft, a draft's reopen, the stale item and Delete draft
// (bank-deposit-drafts.spec.ts); the Other funds section and the correction (checkpoint 4);
// the empty, no-bank-account and no-access states (unit-tested undepositedListState and
// depositScreenState; the seeded book has a bank account and always lists items); native
// keys and native focus.

const DEPOSIT_RECORD = '**/api/collections/books_deposits/records/*'
const UNDEPOSITED_READ = '**/api/collections/books_undeposited_items/records**'

function isStatusPost(request: Request) {
    if (request.method() !== 'PATCH') return false
    const body: { status?: string } | null = request.postDataJSON()
    return body?.status === 'posted'
}

function money(cents: number) {
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

function rate(cents: number) {
    return (cents / 100).toFixed(2)
}

// Three receipts' worth of distinct cents, so their sums are not a seeded amount.
function amountsOf(count: number) {
    const base = 10_000 + Math.floor(Math.random() * 9_000)
    return Array.from({ length: count }, (_, index) => base + 1_137 * (index + 1))
}

// The order of these own rows in the shown list, by line id.
async function rowOrder(page: Page, lineIds: string[]) {
    const ids = await page
        .locator('[data-testid^="deposit-item-"]')
        .filter({ visible: true })
        .evaluateAll(elements => elements.map(el => el.getAttribute('data-testid') ?? ''))
    return ids
        .filter(id => lineIds.some(line => id === `deposit-item-${line}`))
        .map(id => id.slice('deposit-item-'.length))
}

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
            }))
        })
}

test.describe('bank-deposit: form', () => {
    test('a writer creates and posts a deposit from the keyboard only, then posts and starts a new one', async ({
        page,
    }) => {
        await openBooks(page)
        const memo = uniqueMemo('Deposit keyboard')
        const [a, b, c] = amountsOf(3)
        const refs = [uniqueReference('KA'), uniqueReference('KB'), uniqueReference('KC')]
        for (const [index, cents] of [a, b, c].entries()) {
            await postUndepositedReceipt(page, {
                reference: refs[index] as string,
                memo: uniqueMemo('Deposit keyboard receipt'),
                amount: rate(cents as number),
            })
        }
        const total = money((a as number) + (b as number))

        await openNewDeposit(page)
        const depositTo = shownDeposit(page, 'deposit-to')
        await expect(depositTo).toBeFocused()

        // ⇧? lists the form's keys under "Bank deposit"; Esc closes only the list.
        await page.keyboard.press('Shift+?')
        const shortcutList = page.getByRole('dialog').filter({ hasText: 'Keyboard shortcuts' })
        await expect(shortcutList).toBeVisible()
        const group = shortcutList.getByText('Bank deposit', { exact: true }).locator('..')
        await expect(group.getByText('Post', { exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(shortcutList).toHaveCount(0)
        await expect(depositTo).toBeFocused()
        await expect(shownDeposit(page, 'deposit-to-balance')).toHaveText(/^Balance/)

        // Tab to the date, then to each own tick box; Space ticks it.
        await tabTo(page, shownDeposit(page, 'deposit-date'), { max: 3 })
        const tickA = await depositItemTick(page, refs[0] as string)
        const tickB = await depositItemTick(page, refs[1] as string)
        await tabTo(page, tickA, { max: 300 })
        await page.keyboard.press('Space')
        await expect(tickA).toHaveAttribute('aria-checked', 'true')
        await tabTo(page, tickB, { max: 300 })
        await page.keyboard.press('Space')
        await expect(tickB).toHaveAttribute('aria-checked', 'true')
        const selected = shownDeposit(page, 'deposit-selected')
        await expect(selected).toContainText('2 of')
        await expect(selected).toContainText(total)
        await expect(shownDeposit(page, 'deposit-figure')).toContainText(total)

        const memoInput = shownDeposit(page, 'deposit-memo')
        await tabTo(page, memoInput, { max: 300 })
        await page.keyboard.type(memo)
        await page.keyboard.press('ControlOrMeta+Enter')

        // The read view: the posted number, both items and the total.
        await expect(shownDeposit(page, 'deposit-read-only')).toBeVisible()
        await expect(page).toHaveURL(DEPOSIT_URL)
        await expect(shownDeposit(page, 'deposit-title')).toHaveText(/^Deposit \d+$/)
        const readItems = shownDeposit(page, 'deposit-read-items-grid')
        await expect(readItems).toContainText(money(a as number))
        await expect(readItems).toContainText(money(b as number))
        await expect(shownDeposit(page, 'deposit-total')).toContainText(total)

        // J: one debit to the bank for the total, one credit to 1200 for the total.
        await page.keyboard.press('j')
        await expect(page.getByTestId('entry-read-only').filter({ visible: true })).toBeVisible()
        await expect
            .poll(async () => {
                const lines = await readEntryLines(page)
                return {
                    count: lines.length,
                    bankDebit: lines.filter(
                        line =>
                            line.account.includes('1000 Business Checking') && line.debit === total
                    ).length,
                    undepositedCredit: lines.filter(
                        line =>
                            line.account.includes('1200 Undeposited funds') && line.credit === total
                    ).length,
                }
            })
            .toEqual({ count: 2, bankDebit: 1, undepositedCredit: 1 })

        // Mouse again: the bank's register shows the deposit for the total, type Deposit.
        await openRegister(page, 'Business Checking')
        await page.getByTestId('register-range').click()
        await page.getByRole('menuitem', { name: 'This month', exact: true }).click()
        await expect(page.getByTestId('register-range')).toContainText('This month')
        const registerRow = page.locator('[data-testid^="register-row-"]').filter({ hasText: memo })
        await revealRegisterItem(page, registerRow)
        await expect(registerRow).toHaveCount(1)
        await expect(registerRow.locator('[data-testid^="register-cell-type-"]')).toHaveText(
            'Deposit'
        )
        await expect(registerRow.locator('[data-testid^="register-cell-debit-"]')).toHaveText(total)

        // A second deposit: one own row ticked from the keyboard, ⌘⇧↵.
        await openNewDeposit(page)
        await expect(shownDeposit(page, 'deposit-to')).toBeFocused()
        const tickC = await depositItemTick(page, refs[2] as string)
        await tabTo(page, tickC, { max: 300 })
        await page.keyboard.press('Space')
        await expect(tickC).toHaveAttribute('aria-checked', 'true')
        const posted = page.waitForResponse(
            r => isStatusPost(r.request()) && r.url().includes('/books_deposits/records/') && r.ok()
        )
        await page.keyboard.press('ControlOrMeta+Shift+Enter')
        await posted
        await expect(page).toHaveURL(NEW_DEPOSIT_URL)
        await expect(depositItemRow(page, refs[2] as string)).toHaveCount(0)
        await expect(shownDeposit(page, 'deposit-selected')).toContainText(/(^|\D)0 of/)
        await expect(shownDeposit(page, 'deposit-to')).toBeFocused()
    })

    test('a writer selects and sorts items by mouse, and the form guards its edits', async ({
        page,
    }) => {
        await openBooks(page)
        const [a, b] = amountsOf(2)
        const refA = uniqueReference('MA')
        const refB = uniqueReference('MB')
        const receiptA = await postUndepositedReceipt(page, {
            reference: refA,
            memo: uniqueMemo('Deposit mouse receipt'),
            amount: rate(a as number),
            customer: RECEIPT_CUSTOMER,
        })
        await postUndepositedReceipt(page, {
            reference: refB,
            memo: uniqueMemo('Deposit mouse receipt'),
            amount: rate(b as number),
            customer: OTHER_RECEIPT_CUSTOMER,
        })

        await openNewDeposit(page)
        const lineA = await depositItemLineId(page, refA)
        const lineB = await depositItemLineId(page, refB)
        const tickA = shownDeposit(page, `deposit-item-tick-${lineA}`)
        const tickB = shownDeposit(page, `deposit-item-tick-${lineB}`)

        // The row is the press target: a press on its Received from ticks it.
        await depositItemRow(page, refA).getByText(RECEIPT_CUSTOMER, { exact: true }).click()
        await expect(tickA).toHaveAttribute('aria-checked', 'true')
        await expect(tickB).toHaveAttribute('aria-checked', 'false')

        // The Transaction link of the dirty form asks first; Keep editing keeps the tick.
        const discard = page.getByTestId('discard-dialog')
        const keepEditing = page.getByRole('button', { name: 'Keep editing' })
        await shownDeposit(page, `deposit-item-link-${lineA}`).click()
        await expect(discard).toBeVisible()
        await keepEditing.click()
        await expect(discard).toHaveCount(0)
        await expect(page).toHaveURL(NEW_DEPOSIT_URL)
        await expect(tickA).toHaveAttribute('aria-checked', 'true')

        // The header back link goes through the same guard.
        await shownDeposit(page, 'deposit-back').click()
        await expect(discard).toBeVisible()
        await keepEditing.click()
        await expect(discard).toHaveCount(0)
        await expect(shownDeposit(page, 'deposit-form')).toBeVisible()
        await expect(tickA).toHaveAttribute('aria-checked', 'true')

        // The header box ticks every listed item; Clear selection clears them.
        await shownDeposit(page, 'deposit-tick-all').click()
        await expect(tickA).toHaveAttribute('aria-checked', 'true')
        await expect(tickB).toHaveAttribute('aria-checked', 'true')
        await shownDeposit(page, 'deposit-clear-selection').click()
        await expect(tickA).toHaveAttribute('aria-checked', 'false')
        await expect(tickB).toHaveAttribute('aria-checked', 'false')

        // ⌥A ticks every listed item; ⌥⌫ clears every tick.
        await page.keyboard.press('Alt+a')
        await expect(tickA).toHaveAttribute('aria-checked', 'true')
        await expect(tickB).toHaveAttribute('aria-checked', 'true')
        await page.keyboard.press('Alt+Backspace')
        await expect(tickA).toHaveAttribute('aria-checked', 'false')
        await expect(tickB).toHaveAttribute('aria-checked', 'false')

        // Post with nothing ticked and no line is refused in the summary.
        await shownDeposit(page, 'deposit-post').click()
        await expect(shownDeposit(page, 'deposit-error-summary')).toContainText(
            'Select an item or add a line to deposit.'
        )
        await expect(page).toHaveURL(NEW_DEPOSIT_URL)

        // A deposit date before the own receipt's date: the refusal under that row.
        await shownDeposit(page, 'deposit-date').fill(await localDay(page, -1))
        await tickA.click()
        await expect(tickA).toHaveAttribute('aria-checked', 'true')
        await shownDeposit(page, 'deposit-post').click()
        await expect(shownDeposit(page, `deposit-item-error-${lineA}`)).toHaveText(
            new RegExp(
                `^Sales receipt ${receiptA.number} is dated \\w{3} \\d{1,2}, \\d{4}, after the deposit date\\.$`
            )
        )
        await expect(page).toHaveURL(NEW_DEPOSIT_URL)

        // Received from sorts Harborview (B) before Northwind (A), then reverses; Date sorts
        // by date then number (A was posted first), then reverses.
        await expect.poll(() => rowOrder(page, [lineA, lineB])).toEqual([lineA, lineB])
        await shownDeposit(page, 'deposit-sort-party').click()
        await expect.poll(() => rowOrder(page, [lineA, lineB])).toEqual([lineB, lineA])
        await shownDeposit(page, 'deposit-sort-party').click()
        await expect.poll(() => rowOrder(page, [lineA, lineB])).toEqual([lineA, lineB])
        await shownDeposit(page, 'deposit-sort-date').click()
        await expect.poll(() => rowOrder(page, [lineA, lineB])).toEqual([lineA, lineB])
        await shownDeposit(page, 'deposit-sort-date').click()
        await expect.poll(() => rowOrder(page, [lineA, lineB])).toEqual([lineB, lineA])

        // Esc with edits asks first. With the dialog open the screen's write keys write
        // nothing (⌘⇧↵ and ⌘S; the dialog's own ⌘↵ is its Discard), and Esc closes only it.
        let deposits = 0
        page.on('request', request => {
            if (request.url().includes('/books_deposits/records') && request.method() !== 'GET') {
                deposits += 1
            }
        })
        await page.keyboard.press('Escape')
        await expect(discard).toBeVisible()
        await page.keyboard.press('ControlOrMeta+Shift+Enter')
        await page.keyboard.press('ControlOrMeta+s')
        await settleFrames(page)
        expect(deposits).toBe(0)
        await expect(discard).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(discard).toHaveCount(0)
        await expect(shownDeposit(page, 'deposit-form')).toBeVisible()
        await expect(page).toHaveURL(NEW_DEPOSIT_URL)
        await expect(tickA).toHaveAttribute('aria-checked', 'true')

        // Just above the grid's least width: the grid (not the cards), no sideways scroll,
        // and each own row's Amount inside its row.
        await viewportForListWidth(page, 'deposit-undeposited', depositItemsMinWidth + LIST_MARGIN)
        const grid = shownDeposit(page, 'deposit-items-grid')
        await expect(grid).toBeVisible()
        await expect(shownDeposit(page, 'deposit-items-cards')).toHaveCount(0)
        await expect.poll(() => sidewaysOverflow(grid)).toEqual([])
        for (const [ref, cents] of [
            [refA, a],
            [refB, b],
        ] as const) {
            const row = depositItemRow(page, ref)
            const amount = row.getByText(money(cents as number), { exact: true })
            await expect(amount).toBeVisible()
            expect(await rightEdge(amount)).toBeLessThanOrEqual((await rightEdge(row)) + 0.5)
        }
    })

    test('a held post keeps the form busy, and refused writes keep the draft and show the refusal', async ({
        page,
    }) => {
        await openBooks(page)
        const [a, b, c] = amountsOf(3)
        const refA = uniqueReference('HA')
        const refB = uniqueReference('HB')
        const refC = uniqueReference('HC')
        await postUndepositedReceipt(page, {
            reference: refA,
            memo: uniqueMemo('Deposit held receipt'),
            amount: rate(a as number),
        })
        await postUndepositedReceipt(page, {
            reference: refB,
            memo: uniqueMemo('Deposit refused receipt'),
            amount: rate(b as number),
        })
        await postUndepositedReceipt(page, {
            reference: refC,
            memo: uniqueMemo('Deposit refused receipt'),
            amount: rate(c as number),
        })

        // The list read refused: the error banner; Retry lists the rows.
        await page.route(UNDEPOSITED_READ, route =>
            route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ status: 400, message: 'Something went wrong.', data: {} }),
            })
        )
        await openNewDeposit(page)
        const listError = shownDeposit(page, 'deposit-items-error')
        await expect(listError).toBeVisible()
        await expect(depositItemRow(page, refA)).toHaveCount(0)
        await page.unrouteAll({ behavior: 'wait' })
        await listError.getByTestId('deposit-retry').click()
        await expect(depositItemRow(page, refA)).toBeVisible()
        await expect(listError).toHaveCount(0)

        // A held status update: the form stays up, its buttons busy, ⌘↵ does nothing.
        const memoA = uniqueMemo('Deposit held')
        await tickDepositItem(page, refA)
        await shownDeposit(page, 'deposit-memo').fill(memoA)
        const held = await holdRequests(page, DEPOSIT_RECORD, isStatusPost)
        await shownDeposit(page, 'deposit-post').click()
        await held.firstHeld
        await expect(shownDeposit(page, 'deposit-form')).toBeVisible()
        const post = shownDeposit(page, 'deposit-post')
        await expect.poll(() => isDisabled(post)).toBe(true)
        await expect.poll(() => isDisabled(shownDeposit(page, 'deposit-save-draft'))).toBe(true)
        await page.keyboard.press('ControlOrMeta+Enter')
        await settleFrames(page)
        expect(held.count()).toBe(1)
        await expect(shownDeposit(page, 'deposit-form')).toBeVisible()
        held.release()
        await expect(shownDeposit(page, 'deposit-read-only')).toBeVisible()
        await expect(page).toHaveURL(DEPOSIT_URL)
        await page.unrouteAll({ behavior: 'wait' })

        // A second deposit of two items whose status update is refused with a message keyed
        // to its first item (the new form wrote the draft and hands off to it), then with a
        // form-level message.
        const memoB = uniqueMemo('Deposit refused')
        const formMessage = 'The deposit date is on or before the close date.'
        const itemMessage = `Sales receipt ${refB} is already in Deposit 9999.`
        let refusal: object = {
            status: 400,
            message: 'Failed to update record.',
            data: { 'items.0': { code: 'validation_refused', message: itemMessage } },
        }
        await page.route(DEPOSIT_RECORD, route => {
            if (!isStatusPost(route.request())) return route.fallback()
            return route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify(refusal),
            })
        })
        await openNewDeposit(page)
        const lineB = await depositItemLineId(page, refB)
        const lineC = await depositItemLineId(page, refC)
        await tickDepositItem(page, refB)
        await tickDepositItem(page, refC)
        await shownDeposit(page, 'deposit-memo').fill(memoB)
        await shownDeposit(page, 'deposit-post').click()
        await expect(shownDeposit(page, `deposit-item-error-${lineB}`)).toContainText(itemMessage)
        await expect(page).toHaveURL(DEPOSIT_URL)
        await expect(shownDeposit(page, 'deposit-form')).toBeVisible()

        // Unticking the refused row takes its refusal with it: the other ticked row does
        // not show it.
        const tickB = shownDeposit(page, `deposit-item-tick-${lineB}`)
        const tickC = shownDeposit(page, `deposit-item-tick-${lineC}`)
        await tickB.click()
        await expect(tickB).toHaveAttribute('aria-checked', 'false')
        await expect(tickC).toHaveAttribute('aria-checked', 'true')
        await settleFrames(page)
        await expect(
            shownDeposit(page, `deposit-item-error-${lineC}`).filter({ hasText: itemMessage })
        ).toHaveCount(0)

        refusal = { status: 400, message: formMessage, data: {} }
        await shownDeposit(page, 'deposit-post').click()
        await expect(shownDeposit(page, 'deposit-error-summary')).toContainText(formMessage)
        await expect(page).toHaveURL(DEPOSIT_URL)
        await page.unrouteAll({ behavior: 'wait' })

        // The draft holds the ticked item: reopened through search, it is still ticked.
        await openDepositBySearch(page, memoB)
        await expect(shownDeposit(page, 'deposit-form')).toBeVisible()
        await expect(shownDeposit(page, `deposit-item-tick-${lineC}`)).toHaveAttribute(
            'aria-checked',
            'true'
        )
    })

    test('a writer ticks cards, selects all and posts and starts a new one from More at 390', async ({
        page,
    }) => {
        await openBooks(page)
        const [a, b] = amountsOf(2)
        const refA = uniqueReference('PA')
        const refB = uniqueReference('PB')
        await postUndepositedReceipt(page, {
            reference: refA,
            memo: uniqueMemo('Deposit phone receipt'),
            amount: rate(a as number),
        })
        await postUndepositedReceipt(page, {
            reference: refB,
            memo: uniqueMemo('Deposit phone receipt'),
            amount: rate(b as number),
        })
        await openNewDeposit(page)
        await page.setViewportSize(PHONE)

        await expect(shownDeposit(page, 'deposit-items-cards')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-items-grid')).toHaveCount(0)
        const lineA = await depositItemLineId(page, refA)
        const lineB = await depositItemLineId(page, refB)
        const tickA = shownDeposit(page, `deposit-item-tick-${lineA}`)
        const tickB = shownDeposit(page, `deposit-item-tick-${lineB}`)

        // A card press ticks it.
        await depositItemRow(page, refA).getByText(RECEIPT_CUSTOMER, { exact: true }).click()
        await expect(tickA).toHaveAttribute('aria-checked', 'true')
        await expect(tickB).toHaveAttribute('aria-checked', 'false')

        // "Select all" over the cards ticks both; "Clear selection" clears both.
        await shownDeposit(page, 'deposit-tick-all').click()
        await expect(tickA).toHaveAttribute('aria-checked', 'true')
        await expect(tickB).toHaveAttribute('aria-checked', 'true')
        await shownDeposit(page, 'deposit-clear-selection').click()
        await expect(tickA).toHaveAttribute('aria-checked', 'false')
        await expect(tickB).toHaveAttribute('aria-checked', 'false')

        // The figure sits under the title.
        const title = shownDeposit(page, 'deposit-title')
        const figure = shownDeposit(page, 'deposit-figure')
        await expect
            .poll(async () => {
                const titleBox = await title.boundingBox()
                const figureBox = await figure.boundingBox()
                if (!titleBox || !figureBox) return 'not drawn'
                return figureBox.y >= titleBox.y + titleBox.height - 1
                    ? 'under the title'
                    : `figure top ${figureBox.y}, title bottom ${titleBox.y + titleBox.height}`
            })
            .toBe('under the title')

        // The bar: Cancel, Save draft, Post and More; Post & new sits in More.
        await expect(shownDeposit(page, 'deposit-cancel')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-save-draft')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-post')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-post-new')).toHaveCount(0)

        // More → Post & new posts the ticked card and opens a fresh form.
        await tickA.click()
        await expect(tickA).toHaveAttribute('aria-checked', 'true')
        await shownDeposit(page, 'deposit-more').click()
        const postNew = shownDeposit(page, 'deposit-post-new')
        await expect(postNew).toBeVisible()
        const posted = page.waitForResponse(
            r => isStatusPost(r.request()) && r.url().includes('/books_deposits/records/') && r.ok()
        )
        await postNew.click()
        await posted
        await expect(page).toHaveURL(NEW_DEPOSIT_URL)
        await expect(depositItemRow(page, refA)).toHaveCount(0)
        await expect(tickB).toHaveAttribute('aria-checked', 'false')

        // ⌘⇧↵ on the phone bar (its Post & new sits in More) posts the ticked card too.
        await depositItemRow(page, refB).getByText(RECEIPT_CUSTOMER, { exact: true }).click()
        await expect(tickB).toHaveAttribute('aria-checked', 'true')
        const postedByKey = page.waitForResponse(
            r => isStatusPost(r.request()) && r.url().includes('/books_deposits/records/') && r.ok()
        )
        await page.keyboard.press('ControlOrMeta+Shift+Enter')
        await postedByKey
        await expect(page).toHaveURL(NEW_DEPOSIT_URL)
        await expect(shownDeposit(page, 'deposit-form')).toBeVisible()
        await expect(depositItemRow(page, refB)).toHaveCount(0)
        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        document.documentElement.scrollWidth > document.documentElement.clientWidth
                )
            )
            .toBe(false)
    })
})

import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { createIncomeAccount, openChart } from './account-register-helpers'
import {
    ACCOUNT_LABELS,
    DESKTOP,
    fillLine,
    isPhone,
    makeAccountInactiveElsewhere,
    openEntriesList,
    openNewEntry,
    PHONE,
} from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'

// Save draft, Post, Post & new and Cancel on the new-entry form (`entries/new`).
// Decisions that shape it (design gate): direction A, separate list and entry
// screens with cards on phones; the draft save is one batch (the entry and its
// lines, all or none); Post of a new entry saves the draft first, then sets the
// status, so a refused post leaves the draft behind and the next Post updates
// that same draft; the phone
// action bar keeps Cancel, Save draft and Post and moves Post & new into the
// `entry-more` menu; validation is zod, server refusals show in the error
// summary and under the line.
//
// Entries are made by driving the form; nothing is written raw. The refused posts
// are the server's own: the test creates an account, chooses it on line 2 and makes
// it inactive from another tab (the picker never offers an inactive account), so the
// server refuses the post with "Line 2: account <name> is inactive.". Two
// `page.route` answers remain: the delayed entries write (leaving while a save is in
// flight, passed on to the server) and the PocketBase-shaped 400 that keys an error
// to `auto_reverse_on`. That one covers only where the screen puts a field-keyed
// refusal: the form's zod schema stops every auto-reverse date the server refuses
// except one on or before the close date, and a spec may not set a close date on the
// shared DB. It also does not cover the 200-line limit
// (`tests/entry-schema.test.ts`) or editing an existing draft (checkpoint 7).

const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

const UNBALANCED = 'Debits and credits must be equal before this entry can be posted.'
const ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'
const CARDS = '[data-testid^="entries-card-"]'

async function start(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
    await openNewEntry(page)
}

function todayIso() {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${now.getFullYear()}-${month}-${day}`
}

async function fillBalanced(page: Page, memo: string, amount = '$10.00') {
    await page.getByTestId('entry-memo').fill(memo)
    await fillLine(page, 0, { account: ACCOUNT_LABELS.checking, debit: amount })
    await fillLine(page, 1, { account: ACCOUNT_LABELS.equity, credit: amount })
}

function listItems(page: Page, memo: string): Locator {
    return page.locator(isPhone(page) ? CARDS : ROWS).filter({ hasText: memo })
}

async function idOf(item: Locator): Promise<string> {
    const testId = await item.getAttribute('data-testid')
    return (testId ?? '').replace(/^entries-(row|card)-/, '')
}

// The saved draft opens in a read-only view today and in an editable form from
// checkpoint 7, so read a line cell's text or its input value.
function cellText(locator: Locator): Promise<string> {
    return locator.evaluate(el => {
        const value = (el as HTMLInputElement).value
        return (value ?? el.textContent ?? '').trim()
    })
}

async function pressPostAndNew(page: Page) {
    if (isPhone(page)) await page.getByTestId('entry-more').click()
    await page.getByTestId('entry-post-new').click()
}

// A save of a draft (the entry and its lines) is one batch request.
const BATCH_WRITE = '**/api/batch'

// The server's refusal of a post whose line 2 uses an inactive account
// (server/posting.go, validateLines).
const inactiveRefusal = (account: string) => `Line 2: account ${account} is inactive.`

// Books open on the new-entry form with a balanced entry whose line 2 uses an account the
// test created. The account picker offers no inactive account, so a test that needs the
// server to refuse the post makes this account inactive from another tab
// (`makeAccountInactiveElsewhere`) after the form chose it.
async function startWithOwnAccount(
    page: Page,
    size: { width: number; height: number },
    label: string
) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
    const account = uniqueName(`${label} account`)
    await openChart(page)
    await createIncomeAccount(page, account)
    await openNewEntry(page)
    const memo = uniqueName(label)
    await page.getByTestId('entry-memo').fill(memo)
    await fillLine(page, 0, { account: ACCOUNT_LABELS.checking, debit: '$10.00' })
    await fillLine(page, 1, { account, credit: '$10.00' })
    return { memo, account }
}

async function backToList(page: Page) {
    await page.getByTestId('entry-back').click()
    await expect(page.getByTestId('entries-screen')).toBeVisible()
}

test.describe('journal-entries: save and post (desktop)', () => {
    const sizeName = 'desktop'
    const size = DESKTOP

    test('save draft: moves to the draft, drops the blank line, lists it as Draft', async ({
        page,
    }) => {
        await start(page, size)
        const memo = uniqueName(`Draft save ${sizeName}`)
        await fillBalanced(page, memo)
        await page.getByTestId('entry-add-line').click()
        await expect(page.getByTestId('entry-line-2')).toBeVisible()

        await page.getByTestId('entry-save-draft').click()

        await expect(page).toHaveURL(/\/entries\/(?!new)[^/?#]+$/)
        await expect(page.getByTestId('entry-title')).toHaveText('Journal entry')
        await expect(page.getByTestId('entry-badge')).toHaveText('Draft')
        await expect(page.getByTestId('entry-line-account-0')).toBeVisible()
        expect(await cellText(page.getByTestId('entry-line-account-0'))).toBe(
            ACCOUNT_LABELS.checking
        )
        expect(await cellText(page.getByTestId('entry-line-account-1'))).toBe(ACCOUNT_LABELS.equity)
        expect(await cellText(page.getByTestId('entry-line-debit-0'))).toBe('$10.00')
        expect(await cellText(page.getByTestId('entry-line-credit-1'))).toBe('$10.00')
        await expect(page.getByTestId('entry-line-2')).toHaveCount(0)

        await backToList(page)
        const item = listItems(page, memo)
        await expect(item).toHaveCount(1)
        const id = await idOf(item)
        await expect(page.getByTestId(`entries-status-${id}`)).toHaveText('Draft')
        await expect(page.getByTestId(`entries-cell-number-${id}`)).toHaveText('Draft')
    })

    test('validation: unbalanced blocks Post, the message clears once balanced, and Save draft still saves an unbalanced draft', async ({
        page,
    }) => {
        await start(page, size)
        const memo = uniqueName(`Unbalanced ${sizeName}`)
        await page.getByTestId('entry-memo').fill(memo)
        await fillLine(page, 0, { account: ACCOUNT_LABELS.checking, debit: '$10.00' })
        await fillLine(page, 1, { account: ACCOUNT_LABELS.equity, credit: '$5.00' })

        await page.getByTestId('entry-post').click()

        const summary = page.getByTestId('entry-error-summary')
        await expect(summary).toContainText(UNBALANCED)
        await expect(summary).not.toContainText('This entry cannot be saved yet')
        await expect(page).toHaveURL(/\/entries\/new$/)

        // The message clears once the entry balances, without another submit.
        await fillLine(page, 1, { credit: '$10.00' })
        await expect(page.getByText(UNBALANCED)).toHaveCount(0)

        await fillLine(page, 1, { credit: '$5.00' })
        await page.getByTestId('entry-save-draft').click()
        // The new-entry form shows the same Draft badge, so only the move to `entries/<id>` says
        // the save finished. Back pressed before that pops the new form, and the save's late
        // replace then covers the list with the draft.
        await expect(page).toHaveURL(/\/entries\/(?!new)[^/?#]+$/)
        await expect(page.getByTestId('entry-title')).toHaveText('Journal entry')
        await expect(page.getByTestId('entry-badge')).toHaveText('Draft')

        // One row: the refused Post wrote nothing, only the draft save did.
        await backToList(page)
        const item = listItems(page, memo)
        await expect(item).toHaveCount(1)
        await expect(page.getByTestId(`entries-status-${await idOf(item)}`)).toHaveText('Draft')
    })

    test('validation: fewer than two amount lines blocks Post', async ({ page }) => {
        await start(page, size)
        await fillLine(page, 0, { account: ACCOUNT_LABELS.checking, debit: '$10.00' })

        await page.getByTestId('entry-post').click()

        await expect(page.getByTestId('entry-error-summary')).toContainText(
            'Enter an amount on at least two lines'
        )
        await expect(page).toHaveURL(/\/entries\/new$/)
    })

    test('validation: a bad entry date and an auto-reverse date not after the entry date show their errors', async ({
        page,
    }) => {
        await start(page, size)
        await fillBalanced(page, uniqueName(`Dates ${sizeName}`))
        await page.getByTestId('entry-date').fill('2026-13-45')

        await page.getByTestId('entry-save-draft').click()

        await expect(page.getByText('Enter a date as YYYY-MM-DD')).toBeVisible()
        await expect(page).toHaveURL(/\/entries\/new$/)

        await page.getByTestId('entry-date').fill('2026-10-12')
        await page.getByTestId('entry-auto-reverse').fill('2026-10-12')

        await page.getByTestId('entry-save-draft').click()

        await expect(
            page.getByText('The auto-reverse date must be after the entry date')
        ).toBeVisible()
        await expect(page).toHaveURL(/\/entries\/new$/)
    })

    test('server refusal: shows the message, keeps the draft, the next Post reuses it', async ({
        page,
    }) => {
        const { memo, account } = await startWithOwnAccount(page, size, `Refused post ${sizeName}`)
        const refusal = inactiveRefusal(account)
        await makeAccountInactiveElsewhere(page, account)

        await page.getByTestId('entry-post').click()

        await expect(page.getByTestId('entry-error-summary')).toContainText(refusal)
        await expect(page.getByTestId('entry-line-error-1')).toContainText(refusal)
        await expect(page).toHaveURL(/\/entries\/new$/)
        await expect(page.getByTestId('entry-memo')).toHaveValue(memo)

        // A second page of the same session shows the draft the failed post left.
        const other = await page.context().newPage()
        await login(other)
        await navigateToPackage(other, 'books')
        await other.setViewportSize(size)
        await openEntriesList(other)
        const draft = listItems(other, memo)
        await expect(draft).toHaveCount(1)
        await expect(other.getByTestId(`entries-status-${await idOf(draft)}`)).toHaveText('Draft')
        await other.close()

        // With an active account on line 2, the next Post updates that same draft.
        await fillLine(page, 1, { account: ACCOUNT_LABELS.equity })
        await page.getByTestId('entry-post').click()
        await expect(page.getByTestId('entry-read-only')).toBeVisible()
        await expect(page.getByTestId('entry-title')).toHaveText(/^Journal entry JE-\d+$/)

        await backToList(page)
        const item = listItems(page, memo)
        await expect(item).toHaveCount(1)
        await expect(page.getByTestId(`entries-status-${await idOf(item)}`)).toHaveText('Posted')
    })

    test('cancel: leaves at once when clean, asks to discard when edited', async ({ page }) => {
        await start(page, size)

        await page.getByTestId('entry-cancel').click()
        await expect(page.getByTestId('entries-screen')).toBeVisible()

        await page.getByTestId('entries-new').click()
        await expect(page.getByTestId('entry-title')).toHaveText('New journal entry')
        await page.getByTestId('entry-memo').fill('Keep this memo')
        await page.getByTestId('entry-cancel').click()
        await expect(page.getByTestId('discard-dialog')).toBeVisible()

        await page.getByRole('button', { name: 'Keep editing' }).click()
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        await expect(page.getByTestId('entry-memo')).toHaveValue('Keep this memo')

        await page.getByTestId('entry-cancel').click()
        await page.getByTestId('discard-confirm').click()
        await expect(page.getByTestId('entries-screen')).toBeVisible()
    })

    test('double click on Save draft writes one entry', async ({ page }) => {
        await start(page, size)
        const memo = uniqueName(`Double save ${sizeName}`)
        await fillBalanced(page, memo)

        await page.getByTestId('entry-save-draft').dblclick()

        await expect(page.getByTestId('entry-badge')).toHaveText('Draft')
        await backToList(page)
        await expect(listItems(page, memo)).toHaveCount(1)
    })

    test('leaving while a save is in flight does not navigate to the draft afterwards', async ({
        page,
    }) => {
        await start(page, size)
        await fillBalanced(page, uniqueName(`Leave mid save ${sizeName}`))
        let release = () => {}
        const gate = new Promise<void>(resolve => {
            release = resolve
        })
        await page.route(BATCH_WRITE, async route => {
            await gate
            return route.continue()
        })
        // The save writes the entry and its lines in one batch request.
        const lastWrite = new Promise<void>(resolve => {
            page.on('response', res => {
                if (res.url().includes('/api/batch')) resolve()
            })
        })

        await page.getByTestId('entry-save-draft').click()
        await page.getByTestId('entry-back').click()
        await expect(page.getByTestId('entries-screen')).toBeVisible()
        if (await page.getByTestId('discard-confirm').isVisible()) {
            await page.getByTestId('discard-confirm').click()
        }
        await expect(page).toHaveURL(/\/entries$/)

        release()
        await lastWrite
        // The navigation, if the guard let it through, runs in the continuation of that write;
        // two frames let it run before the negative check.
        await page.evaluate(
            () =>
                new Promise<void>(resolve =>
                    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
                )
        )
        await expect(page).toHaveURL(/\/entries$/)
        await expect(page.getByTestId('entries-screen')).toBeVisible()
    })

    test('after a refused post, editing a line clears its refusal and Cancel asks to discard again', async ({
        page,
    }) => {
        const { account } = await startWithOwnAccount(page, size, `Stale refusal ${sizeName}`)
        const refusal = inactiveRefusal(account)
        await makeAccountInactiveElsewhere(page, account)
        await page.getByTestId('entry-post').click()
        await expect(page.getByTestId('entry-error-summary')).toContainText(refusal)
        await expect(page.getByTestId('entry-line-error-1')).toContainText(refusal)

        await fillLine(page, 1, { credit: '$11.00' })

        await expect(page.getByTestId('entry-line-error-1')).toHaveCount(0)
        await expect(page.getByTestId('entry-error-summary').getByText(refusal)).toHaveCount(0)

        // The saved draft no longer matches the form, so leaving asks first.
        await page.getByTestId('entry-cancel').click()
        await expect(page.getByTestId('discard-dialog')).toBeVisible()
    })

    test('a field-keyed server refusal shows its message in the error summary', async ({
        page,
    }) => {
        await start(page, size)
        await fillBalanced(page, uniqueName(`Field refusal ${sizeName}`))
        // The answer of a batch whose first operation, the entry, is refused.
        await page.route(BATCH_WRITE, route =>
            route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({
                    status: 400,
                    message: 'Batch transaction failed.',
                    data: {
                        requests: {
                            0: {
                                code: 'batch_request_failed',
                                message: 'Batch request failed.',
                                response: {
                                    status: 400,
                                    message: 'Failed to create record.',
                                    data: {
                                        auto_reverse_on: {
                                            code: 'validation_x',
                                            message: 'Auto-reverse date is not valid.',
                                        },
                                    },
                                },
                            },
                        },
                    },
                }),
            })
        )

        await page.getByTestId('entry-save-draft').click()

        await expect(page.getByTestId('entry-error-summary')).toContainText(
            'Auto-reverse date is not valid.'
        )
        await expect(page).toHaveURL(/\/entries\/new$/)
    })

    test('cancel after a refused post leaves without asking, the draft is already saved', async ({
        page,
    }) => {
        const { account } = await startWithOwnAccount(page, size, `Cancel saved ${sizeName}`)
        await makeAccountInactiveElsewhere(page, account)
        await page.getByTestId('entry-post').click()
        await expect(page.getByTestId('entry-error-summary')).toContainText(
            inactiveRefusal(account)
        )

        await page.getByTestId('entry-cancel').click()

        await expect(page.getByTestId('entries-screen')).toBeVisible()
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
    })
})

for (const [sizeName, size] of SIZES) {
    test.describe(`journal-entries: save and post (${sizeName})`, () => {
        test('post and new: posts, then opens a fresh form', async ({ page }) => {
            await start(page, size)
            const memo = uniqueName(`Post and new ${sizeName}`)
            await fillBalanced(page, memo)

            await pressPostAndNew(page)

            await expect(page.getByTestId('entry-title')).toHaveText('New journal entry')
            await expect(page.getByTestId(/^entry-line-\d+$/)).toHaveCount(2)
            await expect(page.getByTestId('entry-line-account-0')).toHaveText('Choose account')
            await expect(page.getByTestId('entry-line-account-1')).toHaveText('Choose account')
            await expect(page.getByTestId('entry-date')).toHaveValue(todayIso())
            await expect(page.getByTestId('entry-memo')).toHaveValue('')

            await backToList(page)
            const item = listItems(page, memo)
            await expect(item).toHaveCount(1)
            await expect(page.getByTestId(`entries-status-${await idOf(item)}`)).toHaveText(
                'Posted'
            )
        })

        test('validation: a line with an amount but no account shows its error under the line', async ({
            page,
        }) => {
            await start(page, size)
            await fillLine(page, 0, { account: ACCOUNT_LABELS.checking, debit: '$10.00' })
            await fillLine(page, 1, { credit: '$10.00' })

            await page.getByTestId('entry-save-draft').click()

            await expect(page.getByTestId('entry-line-error-1')).toContainText('Choose an account')
            await expect(page.getByTestId('entry-line-error-0')).toHaveCount(0)
            await expect(page).toHaveURL(/\/entries\/new$/)
        })
    })
}

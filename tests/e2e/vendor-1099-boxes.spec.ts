import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { makeAccountInactive, openChart } from './account-register-helpers'
import {
    accountPatches,
    besideCentered,
    boxSelect,
    chooseBox,
    createExpenseAccount,
    fakeEmptyList,
    holdAccountWrite,
    openForm1099,
    visible,
} from './vendor-1099-helpers'
import {
    afterNextFrames,
    DESKTOP,
    isDisabled,
    isPhone,
    openBooksPage,
    PHONE,
    refusedWrites,
    stacked,
    uniqueName,
} from './vendor-form-helpers'

// Settings → 1099s, the Accounts reported on 1099s card.
//
// Every account a test maps is created through the Chart of Accounts UI with a unique
// name, and only those accounts are mapped; seeded accounts are never changed (the seeded
// inactive 6900 Old Petty Cash is only read; the inactive account whose clear is refused is
// one the test created and made inactive in the chart). Read-only rows cannot be driven here: the
// seeded admin is a writer, so the read-only box text is covered by checkpoint 7's
// read-only test in books-settings.spec.ts. A refusal is a 400 answered through
// `page.route`, which writes nothing.

const BOX_ITEMS = [
    'Not reported',
    'NEC 1 · Nonemployee compensation',
    'MISC 1 · Rents',
    'MISC 2 · Royalties',
    'MISC 3 · Other income',
    'MISC 5 · Fishing boat proceeds',
    'MISC 6 · Medical and health care payments',
    'MISC 8 · Substitute payments in lieu of dividends or interest',
    'MISC 9 · Crop insurance proceeds',
    'MISC 10 · Gross proceeds paid to an attorney',
    'MISC 11 · Fish purchased for resale',
]

const REFUSAL = 'Books cannot change this account right now.'
const SERVER_UNREACHED = "Your change wasn't saved: the server could not be reached."
const ACCOUNTS_NOTE = "Payments posted to these accounts count toward the vendor's 1099 box."

// Away from the section and back: the wide rail swaps sections in place; a phone goes
// back to the section list and pushes the section again.
async function reopenForm1099(page: Page) {
    if (isPhone(page)) {
        await visible(page, 'books-settings-back').click()
    } else {
        await visible(page, 'books-settings-section-company').click()
    }
    await visible(page, 'books-settings-section-form-1099').click()
    await expect(visible(page, 'books-1099-section')).toBeVisible()
}

test.describe('vendor-1099: account boxes', () => {
    for (const [label, size] of [
        ['desktop', DESKTOP],
        ['phone', PHONE],
    ] as const) {
        test(`a writer maps an account to a box while the select waits for the write (${label})`, async ({
            page,
        }) => {
            await login(page)
            await navigateToPackage(page, 'books')
            const name = uniqueName(page, `Box ${label}`)
            const id = await createExpenseAccount(page, name)
            await openForm1099(page)
            await page.setViewportSize(size)

            const row = visible(page, `books-1099-account-row-${id}`)
            await row.scrollIntoViewIfNeeded()
            await expect(row).toContainText(name)
            await expect(boxSelect(page, id)).toHaveText('Not reported')
            if (label === 'desktop') {
                await expect
                    .poll(() =>
                        besideCentered(row.getByText(name, { exact: true }), boxSelect(page, id))
                    )
                    .toBe(true)
            } else {
                await expect
                    .poll(() => stacked(row.getByText(name, { exact: true }), boxSelect(page, id)))
                    .toBe(true)
            }

            // The seeded inactive account keeps its box, so it is listed with its mark.
            const pettyCash = page
                .locator('[data-testid^="books-1099-account-row-"]:visible')
                .filter({ hasText: '6900 Old Petty Cash' })
            await expect(pettyCash).toHaveCount(1)
            await expect(pettyCash).toContainText('Inactive')

            const patches = accountPatches(page, id)
            await boxSelect(page, id).click()
            await expect(page.getByRole('menuitem')).toHaveText(BOX_ITEMS)
            // The shown box: no write starts, and the menu closes.
            await page.getByRole('menuitem', { name: 'Not reported', exact: true }).click()
            await expect(page.getByRole('menuitem')).toHaveCount(0)
            await afterNextFrames(page)
            expect(patches).toEqual([])

            const held = await holdAccountWrite(page, id)
            await chooseBox(page, id, 'MISC 3 · Other income')
            await held.arrived
            // The one PATCH is the MISC 3 write; the Not reported press sent none.
            expect(patches).toHaveLength(1)
            expect(patches[0]).toContain('misc_3')
            await expect.poll(() => isDisabled(boxSelect(page, id))).toBe(true)
            await boxSelect(page, id).click({ force: true })
            await afterNextFrames(page)
            await expect(
                page.getByRole('menuitem', { name: 'Not reported', exact: true })
            ).toHaveCount(0)

            await held.release()
            await expect.poll(() => isDisabled(boxSelect(page, id))).toBe(false)
            await expect(boxSelect(page, id)).toHaveText('MISC 3 · Other income')

            await reopenForm1099(page)
            await expect(boxSelect(page, id)).toHaveText('MISC 3 · Other income')
        })
    }

    test('a box change the server refuses or never answers keeps the stored box', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        const name = uniqueName(page, 'Box refused')
        const id = await createExpenseAccount(page, name)
        await openForm1099(page)
        const rowError = visible(page, `books-1099-account-error-${id}`)

        const refusal = refusedWrites(REFUSAL)
        await page.route(`**/api/collections/books_accounts/records/${id}`, refusal.handler)
        await chooseBox(page, id, 'NEC 1 · Nonemployee compensation')
        await expect(rowError).toHaveText(REFUSAL)
        await expect(boxSelect(page, id)).toHaveText('Not reported')
        await page.unrouteAll({ behavior: 'wait' })

        await page.context().setOffline(true)
        await chooseBox(page, id, 'MISC 1 · Rents')
        await expect(rowError).toHaveText(SERVER_UNREACHED)
        await expect(boxSelect(page, id)).toHaveText('Not reported')
        await page.context().setOffline(false)

        await chooseBox(page, id, 'MISC 1 · Rents')
        await expect(page.getByTestId(`books-1099-account-error-${id}`)).toHaveCount(0)
        await expect(boxSelect(page, id)).toHaveText('MISC 1 · Rents')

        // Inactive with a box, the account is listed so its box can be cleared. Clearing it
        // drops the reason it is listed, so the row must stay through the write and its refusal.
        await openChart(page)
        await makeAccountInactive(page, name)
        await openForm1099(page)
        const row = visible(page, `books-1099-account-row-${id}`)
        await expect(row).toContainText('Inactive')
        await expect(boxSelect(page, id)).toHaveText('MISC 1 · Rents')

        const clear = refusedWrites(REFUSAL)
        clear.hold()
        await page.route(`**/api/collections/books_accounts/records/${id}`, clear.handler)
        await chooseBox(page, id, 'Not reported')
        await expect.poll(() => clear.urls.length).toBe(1)
        await expect(row).toBeVisible()
        clear.release('refuse')
        await expect(rowError).toHaveText(REFUSAL)
        await expect(row).toContainText('Inactive')
        await expect(boxSelect(page, id)).toHaveText('MISC 1 · Rents')
    })

    test('an empty mapping card opens the chart of accounts', async ({ page }) => {
        const fresh = await openBooksPage(page, DESKTOP, p => fakeEmptyList(p, 'books_accounts'))
        await openForm1099(fresh)

        const empty = visible(fresh, 'books-1099-accounts-empty')
        await expect(empty).toContainText('Add an expense account to the chart of accounts first.')
        await expect(fresh.getByText(ACCOUNTS_NOTE, { exact: true })).toHaveCount(0)

        // The sidebar's Chart of Accounts link shows the same text, so the chart's own title
        // is the one more copy that appears after the press.
        const chartTitles = fresh
            .getByText('Chart of Accounts', { exact: true })
            .filter({ visible: true })
        const titlesBefore = await chartTitles.count()
        await visible(fresh, 'books-1099-accounts-chart').click()
        await expect(fresh).toHaveURL(/\/books\/accounts$/)
        // The chart draws its own empty state from the same empty list.
        await expect(visible(fresh, 'accounts-empty')).toBeVisible()
        await expect.poll(() => chartTitles.count()).toBeGreaterThan(titlesBefore)
    })
})

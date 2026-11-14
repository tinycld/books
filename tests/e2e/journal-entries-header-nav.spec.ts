import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { ENTRIES_SEED } from '../../tinycld/books/lib/journal-entries-fixture'
import {
    ACCOUNT_LABELS,
    BATCH_WRITE,
    createDraftEntry,
    DESKTOP,
    holdRequests,
    isBatchOf,
    openEntriesList,
    searchEntries,
    settleFrames,
} from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'

// The leave-without-asking rule after a held save, and Books reopened at an entry.
// The seeded draft is only opened; every other draft is made through the new-entry form.
// The held save is the one batch request a draft save sends.

const ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'

async function start(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

async function openFromList(page: Page, memo: string) {
    await openEntriesList(page)
    await searchEntries(page, memo)
    const item = page
        .locator(ROWS)
        .filter({ hasText: memo })
        .filter({ hasNotText: 'Reversal of' })
        .first()
    await item.click()
}

async function makeDraft(page: Page, memo: string) {
    await createDraftEntry(page, {
        memo,
        amount: '$10.00',
        debitAccount: ACCOUNT_LABELS.checking,
        creditAccount: ACCOUNT_LABELS.equity,
    })
}

test.describe('journal-entries: leaving after a held save', () => {
    test('back with no edits since Save draft leaves without the discard dialog', async ({
        page,
    }) => {
        await start(page)
        const memo = uniqueName('Held save leave')
        await makeDraft(page, memo)
        const held = await holdRequests(page, BATCH_WRITE, isBatchOf('save'))

        await page.getByTestId('entry-memo').fill(`${memo} edited`)
        await page.getByTestId('entry-save-draft').click()
        await held.firstHeld
        await page.getByTestId('entry-back').click()

        await expect(page.getByTestId('entries-screen')).toBeVisible()
        await settleFrames(page)
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        held.release()
    })
})

test.describe('journal-entries: reopening Books at an entry (desktop)', () => {
    test('a fresh page reopened at an entry reaches exactly one list', async ({ page }) => {
        await start(page)
        await openFromList(page, ENTRIES_SEED.draft)
        await expect(page.getByTestId('entry-title')).toBeVisible()

        const fresh = await page.context().newPage()
        await start(fresh)
        await openEntriesList(fresh)
        await settleFrames(fresh)
        await expect(fresh.getByTestId('entries-screen')).toHaveCount(1)
        await fresh.close()
    })
})

import { expect, type Page, type Request, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { ENTRIES_SEED } from '../../tinycld/books/lib/journal-entries-fixture'
import {
    ACCOUNT_LABELS,
    createDraftEntry,
    DESKTOP,
    holdRequests,
    openEntriesList,
    settleFrames,
} from './journal-entries-helpers'

// The leave-without-asking rule after a held save, and Books reopened at an entry.
// The seeded draft is only opened; every other draft is made through the new-entry form.

const ENTRY_RECORDS = '**/api/collections/books_journal_entries/records/*'
const ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'

function isDraftSave(request: Request) {
    return request.method() === 'PATCH' && !(request.postData() ?? '').includes('"status":"posted"')
}

async function start(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

function uniqueMemo(label: string) {
    return `${label} ${Date.now()}`
}

async function openFromList(page: Page, memo: string) {
    await openEntriesList(page)
    await page.getByTestId('entries-search').fill(memo)
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
        const memo = uniqueMemo('Held save leave')
        await makeDraft(page, memo)
        const held = await holdRequests(page, ENTRY_RECORDS, isDraftSave)

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

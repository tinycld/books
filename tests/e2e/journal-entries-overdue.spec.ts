import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    ACCOUNT_LABELS,
    DESKTOP,
    fillLine,
    openEntriesList,
    openNewEntry,
    PHONE,
    postOpenEntry,
    searchEntries,
} from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'

// An overdue automatic reversal: the entry view says that it did not post, and the
// journal list marks the entry.
//
// What this does not cover: a reversal that the server refused. The server posts a due
// reversal at the top of the hour, and no path through the UI makes it refuse one. So
// the entry here reverses in 2 days (the server leaves it alone during the run), and the
// page clock is set 4 days ahead. The state is the client's own reading of the entry,
// its reversal rows and the clock (lib/entry-display.ts autoReversalState); the Go tests
// of server/auto_reverse_test.go cover the sweep.

const DAY_MS = 24 * 60 * 60 * 1000

function utcDay(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10)
}

async function postEntryThatReverses(page: Page, memo: string, reverseOn: string) {
    await openNewEntry(page)
    await page.getByTestId('entry-memo').fill(memo)
    await page.getByTestId('entry-auto-reverse').fill(reverseOn)
    await fillLine(page, 0, { account: ACCOUNT_LABELS.checking, debit: '12.00' })
    await fillLine(page, 1, { account: ACCOUNT_LABELS.equity, credit: '12.00' })
    await postOpenEntry(page)
}

// The list at desktop size is a table of rows (EntryRow); at phone size it is cards
// (EntryCard). Both draw the mark, so both run.
for (const [sizeName, viewport] of [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const) {
    test(`an overdue automatic reversal is named in the entry and marked in the list (${sizeName})`, async ({
        page,
    }) => {
        const memo = uniqueName('E2E overdue accrual')
        const start = Date.now()
        // Two days ahead in UTC is after the entry date in every time zone.
        const reverseOn = utcDay(start + 2 * DAY_MS)

        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(viewport)
        await postEntryThatReverses(page, memo, reverseOn)

        // Before its day the reversal is scheduled.
        await expect(page.getByTestId('entry-auto-reverse')).toHaveText(/^Will reverse on /)

        // Four days later nothing has posted it.
        await page.clock.setFixedTime(new Date(start + 4 * DAY_MS))
        await openEntriesList(page)
        await searchEntries(page, memo)
        const mark = page.locator('[data-testid^="entries-overdue-"]')
        await expect(mark).toHaveCount(1)
        await expect(mark).toHaveText('Reversal overdue')

        await page.getByText(memo, { exact: true }).click()
        await expect(page.getByTestId('entry-auto-reverse')).toHaveText(
            /^The automatic reversal of .+ did not post\. Reverse or void this entry\.$/
        )
        await expect(page.getByTestId('entry-auto-reverse')).not.toHaveText(/Will reverse/)
    })
}

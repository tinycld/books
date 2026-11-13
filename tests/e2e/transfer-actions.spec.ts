import { expect, type Locator, type Page, test } from '@playwright/test'
import { ENTRIES_SEED } from '../../tinycld/books/lib/journal-entries-fixture'
import { createAccount, makeAccountInactive, openChart } from './account-register-helpers'
import { openEntriesList, refuseEntryWrite, searchEntries } from './journal-entries-helpers'
import {
    chooseTransferAccount,
    createPostedTransfer,
    DESKTOP,
    fillTransfer,
    openNewTransfer,
    openTransferFromList,
    PHONE,
    saveTransferDraft,
    startTransfers,
    TRANSFER_LABELS,
    TRANSFER_URL,
    transferIdFromUrl,
    uniqueMemo,
} from './transfer-helpers'

// What a writer does to a transfer after it exists: a refused post of a draft, the
// correction of a posted transfer, a void and the delete of a draft. Every transfer is made
// by driving the form (never a raw PocketBase write) and carries a unique memo, found
// through `entries-search`, because the DB is shared by every spec file on two workers.
// Every transfer posted here takes From = 1010 Business Savings (account-register-table.spec.ts
// relies on Business Checking never going below zero) and keeps the default date, today, so
// nothing is posted before mid-2026 (books-settings.spec.ts holds close date 2026-06-30 for a
// few seconds). No balance, fiscal month or close date is assumed.
//
// The close-date refusal is forced: the post of a saved draft is one batch (its line writes,
// then the entry with the status), and that batch is answered as PocketBase answers one whose
// entry write is refused, because a spec may not set a close date on the shared DB. That step
// covers how the form shows a summary refusal and keeps the draft, not the server's close-date
// rule. The inactive-account refusal is the real server's.
//
// The void runs at phone size only: there Void sits in the `entry-more` menu, not in the
// wide bar. A reader's view (no actions) is not driven: the e2e book has no non-writer
// Books user.

const ENTRY_ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'
const CLOSED =
    'The books are closed through 2026-06-30. Ask a Books admin for a close-date override to post on 2026-11-04.'

// The in-app move a link with no button makes (no page load).
async function pushPath(page: Page, path: string) {
    await page.evaluate(url => {
        window.history.pushState({}, '', url)
        window.dispatchEvent(new PopStateEvent('popstate'))
    }, path)
}

async function idFromTestId(locator: Locator, prefix: string): Promise<string> {
    const testId = (await locator.getAttribute('data-testid')) ?? ''
    expect(testId.startsWith(prefix)).toBe(true)
    return testId.slice(prefix.length)
}

type ListedRow = { memo: string; number: string; status: string }

// Every row the list shows, read in one snapshot (the list is windowed and re-renders as
// other specs add rows). Polled after a search, it settles on the rows that match.
function listedRows(page: Page): Promise<ListedRow[]> {
    return page.evaluate(selector => {
        const cell = (row: Element, prefix: string) =>
            (row.querySelector(`[data-testid^="${prefix}"]`)?.textContent ?? '').trim()
        return Array.from(document.querySelectorAll(selector))
            .map(row => ({
                memo: cell(row, 'entries-cell-memo-'),
                number: cell(row, 'entries-cell-number-'),
                status: cell(row, 'entries-status-'),
            }))
            .sort((a, b) => a.status.localeCompare(b.status))
    }, ENTRY_ROWS)
}

test.describe('transfer: actions', () => {
    test('a draft whose account went inactive shows it, and a refused post keeps the draft with the refusal where it belongs', async ({
        page,
    }) => {
        await startTransfers(page, DESKTOP)
        const name = uniqueMemo('Transfer Reserve')
        const memo = uniqueMemo('Inactive transfer')
        await openChart(page)
        await createAccount(page, name, { type: 'Bank', detailType: 'Savings' })

        await openNewTransfer(page)
        await fillTransfer(page, { from: TRANSFER_LABELS.savings, to: name, amount: '21.00', memo })
        await expect(page.getByTestId('transfer-balance-to')).toHaveText('Balance $0.00')
        await page.getByTestId('transfer-save-draft').click()
        await expect(page).toHaveURL(TRANSFER_URL)
        await expect(page.getByTestId('transfer-title')).toHaveText('Draft transfer')
        const id = transferIdFromUrl(page)
        const draftUrl = new RegExp(`/books/transfers/${id}$`)
        await page.getByTestId('transfer-cancel').click()
        await expect(page).not.toHaveURL(draftUrl)

        // The sidebar pushes the chart over the Journal Entries list Cancel returned to, and
        // pushing the list again would mount a second one: go back to it instead.
        await openChart(page)
        await makeAccountInactive(page, name)
        await page.goBack()
        await expect(page.getByTestId('entries-screen')).toBeVisible()

        await openTransferFromList(page, memo)
        await expect(page).toHaveURL(draftUrl)
        await expect(page.getByTestId('transfer-to')).toHaveText(name)

        await refuseEntryWrite(page, 'post', CLOSED)
        await page.getByTestId('transfer-post').click()
        await expect(page.getByTestId('transfer-error-summary')).toContainText(CLOSED)
        await expect(page.getByTestId('transfer-title')).toHaveText('Draft transfer')
        await expect(page.getByTestId('transfer-refusal-to')).toHaveCount(0)

        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('transfer-post').click()
        await expect(page.getByTestId('transfer-refusal-to')).toHaveText(
            `account ${name} is inactive.`
        )
        await expect(page.getByTestId('transfer-refusal-from')).toHaveCount(0)
        await expect(page.getByTestId('transfer-error-summary')).toHaveCount(0)
        await expect(page.getByTestId('transfer-title')).toHaveText('Draft transfer')

        await chooseTransferAccount(page, 'to', TRANSFER_LABELS.checking)
        await page.getByTestId('transfer-post').click()
        await expect(page.getByTestId('transfer-read-only')).toBeVisible()
        const title = page.getByTestId('transfer-title')
        await expect(title).toHaveText(/^Transfer TR-\d+$/)
        await expect(page).toHaveURL(draftUrl)
        const number = (await title.innerText()).trim().replace(/^Transfer /, '')

        // Each save updated the one draft: the list holds one row for the memo.
        await openEntriesList(page)
        await searchEntries(page, memo)
        await expect.poll(() => listedRows(page)).toEqual([{ memo, number, status: 'Posted' }])
    })

    test('edits a posted transfer as a correction that keeps its number', async ({ page }) => {
        await startTransfers(page, DESKTOP)
        const memo = uniqueMemo('Corrected transfer')
        const { id, number } = await createPostedTransfer(page, {
            from: TRANSFER_LABELS.savings,
            to: TRANSFER_LABELS.checking,
            amount: '10.00',
            memo,
        })

        // E is the read view's Edit key; the correction form opens with "Transfer from" focused.
        await expect(page.getByTestId('entry-edit')).toBeVisible()
        await page.keyboard.press('e')
        await expect(page).toHaveURL(new RegExp(`/books/transfers/new\\?replaces=${id}$`))
        await expect(page.getByTestId('transfer-title')).toHaveText(`Edit ${number}`)
        await expect(page.getByTestId('transfer-from')).toBeFocused()
        await expect(page.getByTestId('transfer-replace-note')).toHaveText(
            `Posting this replaces ${number} under the same number. The original is voided. Until you post, ${number} stays as it is.`
        )
        const amount = page.getByTestId('transfer-amount-input')
        await expect(amount).toHaveValue('$10.00')
        await amount.fill('12')
        await amount.blur()

        await page.getByTestId('transfer-post').click()
        await expect(page.getByTestId('transfer-read-only')).toBeVisible()
        await expect(page).toHaveURL(TRANSFER_URL)
        expect(transferIdFromUrl(page)).not.toBe(id)
        await expect(page.getByTestId('transfer-title')).toHaveText(`Transfer ${number}`)
        await expect(page.getByTestId('transfer-amount')).toHaveText('$12.00')

        await openEntriesList(page)
        await searchEntries(page, memo)
        await expect
            .poll(() => listedRows(page))
            .toEqual([
                { memo, number, status: 'Posted' },
                { memo, number, status: 'Void' },
            ])

        await searchEntries(page, ENTRIES_SEED.posted)
        const seeded = page
            .locator(ENTRY_ROWS)
            .filter({ hasText: ENTRIES_SEED.posted })
            .filter({ hasNotText: /reversal/i })
        await expect(seeded).toHaveCount(1)
        const entryId = await idFromTestId(seeded, 'entries-row-')
        await pushPath(page, `/a/books/transfers/new?replaces=${entryId}`)
        const cannotEdit = page.getByTestId('transfer-cannot-edit')
        await expect(cannotEdit).toContainText('This transfer cannot be edited')
        await expect(cannotEdit.getByTestId('entry-back')).toBeVisible()
    })

    test('voids a posted transfer from the phone More menu', async ({ page }) => {
        await startTransfers(page, PHONE)
        const { id, number } = await createPostedTransfer(page, {
            from: TRANSFER_LABELS.savings,
            to: TRANSFER_LABELS.checking,
            amount: '7.00',
            memo: uniqueMemo('Voided transfer'),
        })
        const transferUrl = new RegExp(`/books/transfers/${id}$`)

        await expect(page.getByTestId('entry-edit')).toBeVisible()
        const more = page.getByTestId('entry-more')
        await expect(more).toBeVisible()
        await expect(page.getByText('Reverse', { exact: true })).toHaveCount(0)

        // V is the read view's Void key; Escape closes only the dialog (a Sheet on a phone).
        const dialog = page.getByTestId('void-dialog')
        await page.keyboard.press('v')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(`Void ${number}?`)
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect(page.getByTestId('transfer-read-only')).toBeVisible()
        await expect(page.getByTestId('transfer-badge')).toHaveText('Posted')
        await expect(page).toHaveURL(transferUrl)

        await more.click()
        await expect(page.getByRole('menuitem', { name: 'Void', exact: true })).toBeVisible()
        await expect(page.getByRole('menuitem', { name: 'Reverse', exact: true })).toHaveCount(0)
        await page.getByRole('menuitem', { name: 'Void', exact: true }).click()

        await expect(dialog).toContainText(`Void ${number}?`)
        await expect(dialog).toContainText(
            'A reversing entry is posted in the original period. The number is kept.'
        )
        await page.getByTestId('void-confirm').click()

        await expect(page.getByTestId('transfer-badge')).toHaveText('Void')
        await expect(page).toHaveURL(transferUrl)
        await expect(page.getByTestId('transfer-read-only')).toBeVisible()
        await expect(page.getByTestId('transfer-voided-by')).toBeVisible()
        await expect(page.getByTestId('entry-more')).toHaveCount(0)
        await expect(page.getByTestId('entry-edit')).toHaveCount(0)
    })

    test('deletes a saved draft from More', async ({ page }) => {
        await startTransfers(page, DESKTOP)
        const memo = uniqueMemo('Deleted transfer')
        const id = await saveTransferDraft(page, {
            from: TRANSFER_LABELS.savings,
            to: TRANSFER_LABELS.checking,
            amount: '5.00',
            memo,
        })
        const draftUrl = new RegExp(`/books/transfers/${id}$`)

        // ⌘⌫ is Delete draft, also from the memo field: it opens the same dialog, and the
        // field never sees the key (with the caret at the end, the browser's own ⌘⌫ would
        // delete the memo text). Escape closes the dialog with the draft kept.
        const memoInput = page.getByTestId('transfer-memo')
        await memoInput.click()
        await page.keyboard.press('End')
        await expect(memoInput).toBeFocused()
        const deleteDialog = page.getByTestId('delete-draft-dialog')
        await page.keyboard.press('ControlOrMeta+Backspace')
        await expect(deleteDialog).toBeVisible()
        await expect(memoInput).toHaveValue(memo)
        await page.keyboard.press('Escape')
        await expect(deleteDialog).toBeHidden()
        await expect(page).toHaveURL(draftUrl)
        await expect(page.getByTestId('transfer-title')).toHaveText('Draft transfer')
        await expect(memoInput).toHaveValue(memo)

        const more = page.getByTestId('transfer-actions').getByTestId('transfer-more')
        await expect(more).toBeVisible()
        await more.click()
        const item = page.getByTestId('transfer-delete-draft')
        await expect(item).toHaveText('Delete draft')
        await item.click()
        await expect(deleteDialog).toBeVisible()
        await page.getByTestId('delete-draft-confirm').click()
        await expect(page).not.toHaveURL(draftUrl)

        await openEntriesList(page)
        await searchEntries(page, memo)
        await expect(page.getByTestId('entries-no-match')).toBeVisible()
    })
})

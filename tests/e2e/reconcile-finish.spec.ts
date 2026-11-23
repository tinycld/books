import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { DESKTOP, PHONE } from './account-register-helpers'
import { importReviewStatement } from './for-review-helpers'
import { ACCOUNT_LABELS, openOtherBooksPage } from './journal-entries-helpers'
import { tabTo } from './keyboard-helpers'
import {
    accountIdOf,
    accountRow,
    bandFigure,
    createReconcileAccount,
    daysAgo,
    expectDifference,
    finishReconciliation,
    focusAccountRow,
    lineBox,
    lineIdOf,
    lineRow,
    openReconcile,
    openWorkScreen,
    postDatedEntry,
    postEntryLines,
    pressRow,
    shownLineIds,
    startReconciliation,
} from './reconcile-helpers'
import { uniqueName } from './record-form-helpers'
import { visibleScreen } from './screen-helpers'

// Reconcile spec §3 "Hint line", the header's actions ("Edit info", "Finish later",
// "Finish", "Discard reconciliation"), the phone's Finish bar and More menu, and "The
// finished summary"; §4 "Writes" (Edit info, Finish, Discard). Each test makes its own
// account in the Chart of Accounts and posts its own entries through the journal entry form
// against 3000 Owner's Equity, dated today or a few days before.

const WORK_URL = /\/books\/reconcile\/[a-z0-9]{15}\/?$/
const FINISH_HINT = 'The difference must be $0.00 to finish.'
const RECONCILIATION_RECORD_URL = '**/api/collections/books_reconciliations/records/*'
// The server's refusal of an Edit info update; PocketBase adds the final period.
const EDIT_REFUSAL = 'This statement was changed by another user'
// Core writesAvailability's reason while the browser is offline.
const OFFLINE_REASON = "You're offline — changes can't be saved right now"

// 'YYYYMMDD' of daysAgo(n), as an OFX file dates a transaction.
function ofxDay(n: number): string {
    return daysAgo(n).replace(/-/g, '')
}

async function signIn(page: Page): Promise<void> {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

function visible(page: Page, testId: string): Locator {
    return page.getByTestId(testId).filter({ visible: true })
}

// Every request that would create a reconciliation: a POST of books_reconciliations, alone
// or inside a batch.
function startWrites(page: Page): string[] {
    const writes: string[] = []
    page.on('request', request => {
        if (request.method() !== 'POST') return
        const url = request.url()
        const isBatch = url.includes('/api/batch')
        if (url.includes('/api/collections/books_reconciliations/records')) writes.push(url)
        else if (isBatch && (request.postData() ?? '').includes('books_reconciliations')) {
            writes.push(url)
        }
    })
    return writes
}

// "Journal entry JE-29": the Transaction link of the row, as the hints name the transaction.
async function transactionLabel(page: Page, row: Locator): Promise<string> {
    const id = await lineIdOf(row)
    const text = (await visible(page, `reconcile-link-${id}`).textContent()) ?? ''
    expect(text.trim()).toMatch(/^Journal entry \S+$/)
    return text.trim()
}

async function expectChecked(page: Page, memo: string, isChecked: boolean): Promise<void> {
    await expect(lineBox(page, memo)).toHaveAttribute('aria-checked', String(isChecked))
}

test.describe('reconcile: finish and statement edits', () => {
    test('finish: the hints lead to a balance, Finish shows the summary, the accounts screen links it', async ({
        page,
    }) => {
        await signIn(page)
        const name = await createReconcileAccount(page, 'bank')
        const stamp = uniqueName('rf')
        const deposit = `${stamp} deposit`
        const big = `${stamp} payment big`
        const small = `${stamp} payment small`
        await postEntryLines(page, {
            date: daysAgo(2),
            memo: `${stamp} entry`,
            lines: [
                { account: name, debit: '900.00', memo: deposit },
                { account: name, credit: '270.00', memo: big },
                { account: name, credit: '27.00', memo: small },
                { account: ACCOUNT_LABELS.equity, credit: '603.00' },
            ],
        })
        const today = daysAgo(0)
        const reconciliationId = await startReconciliation(page, name, {
            balance: '603.00',
            date: today,
        })
        const work = await visibleScreen(page, 'reconcile-screen')
        const finish = visible(page, 'reconcile-finish')
        await expect(finish).toBeDisabled()

        // The reason Finish is disabled is visible text in the header, right under Finish,
        // not in the list.
        const reason = work.getByTestId('reconcile-disabled-reason').filter({ visible: true })
        await expect(reason).toHaveText(FINISH_HINT)
        await expect(visible(page, 'reconcile-disabled-reason')).toHaveCount(1)
        await expect(
            visible(page, 'reconcile-table').getByTestId('reconcile-disabled-reason')
        ).toHaveCount(0)
        await expect
            .poll(async () => {
                const finishBox = await finish.boundingBox()
                const reasonBox = await reason.boundingBox()
                if (!finishBox || !reasonBox) return 'no box'
                const gap = reasonBox.y - (finishBox.y + finishBox.height)
                return gap >= -1 && gap <= 48 ? 'under Finish' : `gap ${gap}`
            })
            .toBe('under Finish')

        await pressRow(page, deposit)
        await expectChecked(page, deposit, true)
        await pressRow(page, small)
        await expectChecked(page, small, true)
        await expectDifference(page, '-$270.00')
        await expect(finish).toBeDisabled()
        await expect(reason).toHaveText(FINISH_HINT)

        // −$270.00: clearing the payment of $270.00 closes it, and 27,000 cents divide by 9.
        const bigLabel = await transactionLabel(page, lineRow(page, big))
        const hints = work.getByTestId('reconcile-hints')
        await expect(hints).toContainText(
            `Clearing ${bigLabel} ($270.00) makes the difference zero.`
        )
        const more = hints.getByTestId('reconcile-hints-more')
        await expect(more).toHaveText('1 more')
        await expect(hints).not.toContainText('divides by 9')
        await more.click()
        await expect(hints).toContainText(
            'The difference, $270.00, divides by 9. Two digits of an amount may be swapped, for example $54.00 entered as $45.00.'
        )

        // Show gives the row the row focus; a press on it clears it.
        await hints.getByTestId('reconcile-hint-action-one').click()
        await expect(lineRow(page, big)).toHaveAttribute('data-focused', 'true')
        await pressRow(page, big)
        await expectChecked(page, big, true)
        await expectDifference(page, '$0.00')
        const difference = visible(page, 'reconcile-difference')
        await expect(difference).toContainText('Balanced')
        await expect(difference).not.toContainText('Not balanced')
        await expect(hints).toContainText('Balanced. Finish to record this reconciliation.')
        await expect(hints).not.toContainText('Clearing')
        await expect(finish).toBeEnabled()
        await expect(visible(page, 'reconcile-disabled-reason')).toHaveCount(0)

        const finished = await finishReconciliation(page)
        await expect(page).toHaveURL(new RegExp(`/books/reconcile/${reconciliationId}/?$`))
        await expect(bandFigure(finished, 'Statement ending balance')).toContainText('$603.00')
        await expect(finished).toContainText('2 payments')
        await expect(finished).toContainText('1 deposit')
        await expect(finished).toContainText('Difference')
        await expect(finished).toContainText('$0.00')
        await expect(visible(page, 'reconcile-status')).toHaveText('Reconciled')
        const summary = await visibleScreen(page, 'reconcile-screen')
        await expect(summary).toContainText(
            '3 transactions of this statement are reconciled. They cannot be voided or changed.'
        )
        await expect(summary.locator('[data-testid^="reconcile-check-"]')).toHaveCount(0)

        await visible(page, 'reconcile-another').click()
        await visibleScreen(page, 'reconcile-accounts-screen')
        const accountId = await accountIdOf(page, name)
        const through = visible(page, `reconcile-through-${accountId}`)
        await expect(through).toHaveText(formatDay(today))
        await expect(
            accountRow(page, name).getByTestId(`reconcile-start-${accountId}`)
        ).toBeVisible()
        await through.click()
        await expect(page).toHaveURL(new RegExp(`/books/reconcile/${reconciliationId}/?$`))
        await expect(visible(page, 'reconcile-finished')).toContainText('$603.00')
    })

    test('for review: the hint counts the connection’s For review transactions up to the statement date and opens Banking', async ({
        page,
    }) => {
        await signIn(page)
        // Two bank transactions on or before the statement date, one after it; the account
        // has no entry, so the difference ($10.00, not a multiple of 9 cents) has no other hint.
        const { accountName, connectionId } = await importReviewStatement(page, stamp => [
            { day: ofxDay(3), amount: '-12.00', name: `${stamp} early one` },
            { day: ofxDay(1), amount: '30.00', name: `${stamp} early two` },
            { day: ofxDay(0), amount: '-5.00', name: `${stamp} after` },
        ])
        const statementDate = daysAgo(1)
        await startReconciliation(page, accountName, { balance: '10.00', date: statementDate })
        const work = await visibleScreen(page, 'reconcile-screen')
        await expectDifference(page, '$10.00')

        const hints = work.getByTestId('reconcile-hints')
        await expect(hints).toContainText(
            `2 bank transactions up to ${formatDay(statementDate)} are still in For review. Review them first.`
        )
        const open = hints.getByTestId('reconcile-hint-action-review')
        await expect(open).toHaveText('Open Banking')
        await open.click()
        await expect(page).toHaveURL(
            new RegExp(`/books/banking\\?(?=.*account=${connectionId})(?=.*tab=review)`)
        )

        // The work screen stays mounted under Banking, whose own `list` scope now holds the
        // keyboard. A phone width and back unmounts and mounts the wide buttons again under
        // Banking; owned by the work screen's scope, their keys stay off here: ⌘S (Banking
        // has no ⌘S) must not run Finish later. The next key, 2 (Banking's Reviewed tab),
        // shows that ⌘S was handled and Banking still holds the keyboard.
        await visibleScreen(page, 'banking-screen')
        await page.setViewportSize(PHONE)
        await expect(page.getByTestId('reconcile-later')).toHaveCount(0)
        await page.setViewportSize(DESKTOP)
        await expect(page.getByTestId('reconcile-later')).toHaveCount(1)
        await expect(visible(page, 'reconcile-later')).toHaveCount(0)
        await page.keyboard.press('ControlOrMeta+s')
        await page.keyboard.press('2')
        await expect(page).toHaveURL(
            new RegExp(`/books/banking\\?(?=.*account=${connectionId})(?=.*tab=reviewed)`)
        )
        await expect(visible(page, 'reconcile-accounts-screen')).toHaveCount(0)
        await visibleScreen(page, 'banking-screen')

        // Back returns to the same work screen.
        await page.goBack()
        await expect(page).toHaveURL(WORK_URL)
        await visibleScreen(page, 'reconcile-screen')
        await expect(visible(page, 'reconcile-later')).toBeVisible()
    })

    test('a second reconciliation starts from the first statement and lists only later entries', async ({
        page,
    }) => {
        await signIn(page)
        const name = await createReconcileAccount(page, 'bank')
        const stamp = uniqueName('rs')
        const first = `${stamp} first deposit`
        const later = `${stamp} later deposit`
        const firstDate = daysAgo(3)
        await postDatedEntry(page, {
            memo: first,
            amount: '100.00',
            debitAccount: name,
            creditAccount: ACCOUNT_LABELS.equity,
            date: daysAgo(4),
        })
        await postDatedEntry(page, {
            memo: later,
            amount: '50.00',
            debitAccount: name,
            creditAccount: ACCOUNT_LABELS.equity,
            date: daysAgo(1),
        })

        // The first statement lists only the entry dated on or before it.
        await startReconciliation(page, name, { balance: '100.00', date: firstDate })
        await pressRow(page, first)
        await expectChecked(page, first, true)
        await expect(lineRow(page, later)).toHaveCount(0)
        await finishReconciliation(page)

        await visible(page, 'reconcile-another').click()
        await visibleScreen(page, 'reconcile-accounts-screen')
        const accountId = await accountIdOf(page, name)
        const writes = startWrites(page)
        await visible(page, `reconcile-start-${accountId}`).click()
        const dialog = page.getByTestId('reconcile-start-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByTestId('reconcile-beginning')).toHaveText('$100.00')
        await expect(dialog).toContainText(`From the statement of ${formatDay(firstDate)}`)

        // A date equal to the first statement date is refused in the form.
        await dialog.getByTestId('reconcile-ending-balance').fill('150.00')
        await dialog.getByTestId('reconcile-ending-date').fill(firstDate)
        await dialog.getByTestId('reconcile-start-submit').click()
        await expect(dialog.getByTestId('reconcile-ending-date-error')).toHaveText(
            `The date must be after ${formatDay(firstDate)}, the last reconciled statement.`
        )
        await expect(dialog).toBeVisible()
        expect(writes).toEqual([])

        await dialog.getByTestId('reconcile-ending-date').fill(daysAgo(0))
        await dialog.getByTestId('reconcile-start-submit').click()
        await expect(page).toHaveURL(WORK_URL)
        const work = await visibleScreen(page, 'reconcile-screen')
        const laterId = await lineIdOf(lineRow(page, later))
        await expect.poll(() => shownLineIds(page)).toEqual([laterId])
        const summary = work.getByTestId('reconcile-summary')
        await expect(bandFigure(summary, 'Beginning balance')).toContainText('$100.00')
        await expect(bandFigure(summary, 'Cleared balance')).toContainText('$100.00')
        await expectDifference(page, '$50.00')
    })

    test('edit from the keyboard only: E edits the statement, an earlier date unclears, ⌘S and ↵ resume', async ({
        page,
    }) => {
        await signIn(page)
        const name = await createReconcileAccount(page, 'bank')
        const stamp = uniqueName('re')
        const older = `${stamp} older deposit`
        const newer = `${stamp} newer deposit`
        await postDatedEntry(page, {
            memo: older,
            amount: '100.00',
            debitAccount: name,
            creditAccount: ACCOUNT_LABELS.equity,
            date: daysAgo(5),
        })
        await postDatedEntry(page, {
            memo: newer,
            amount: '50.00',
            debitAccount: name,
            creditAccount: ACCOUNT_LABELS.equity,
            date: daysAgo(0),
        })
        const reconciliationId = await startReconciliation(page, name, {
            balance: '150.00',
            date: daysAgo(0),
        })
        const work = await visibleScreen(page, 'reconcile-screen')
        const olderId = await lineIdOf(lineRow(page, older))
        await lineIdOf(lineRow(page, newer))
        await expect(visible(page, 'reconcile-search')).not.toBeFocused()

        // No click from here on. A clears both rows.
        const result = visible(page, 'reconcile-result')
        await page.keyboard.press('a')
        await expect(result).toHaveText('Cleared 2 transactions.')
        await expectChecked(page, older, true)
        await expectChecked(page, newer, true)
        await expectDifference(page, '$0.00')

        // E opens the statement information with the stored values.
        await page.keyboard.press('e')
        const dialog = page.getByTestId('reconcile-start-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText('Edit statement information')
        const balance = dialog.getByTestId('reconcile-ending-balance')
        const date = dialog.getByTestId('reconcile-ending-date')
        await expect(balance).toBeFocused()
        await expect(balance).toHaveValue('150.00')
        await expect(date).toHaveValue(daysAgo(0))

        const newDate = daysAgo(2)
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type('100.00')
        await tabTo(page, date)
        await expect(date).toBeFocused()
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type(newDate)

        // A refused update: the dialog stays open with the refusal and the typed values,
        // over the work screen (the optimistic date must not swap the screen for loading).
        await page.route(RECONCILIATION_RECORD_URL, (route: Route) => {
            if (route.request().method() !== 'PATCH') return route.fallback()
            return route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ status: 400, message: `${EDIT_REFUSAL}.`, data: {} }),
            })
        })
        const refused = page.waitForResponse(
            response =>
                response.url().includes('/api/collections/books_reconciliations/records/') &&
                response.request().method() === 'PATCH'
        )
        await page.keyboard.press('ControlOrMeta+Enter')
        await refused
        await expect(dialog).toBeVisible()
        await expect(dialog.getByTestId('reconcile-start-errors')).toContainText(EDIT_REFUSAL)
        await expect(balance).toHaveValue('100.00')
        await expect(date).toHaveValue(newDate)
        await expect(visible(page, 'reconcile-loading')).toHaveCount(0)
        await expect(work).toBeVisible()
        await expect(work.getByTestId('reconcile-title')).toContainText(
            `Statement ending ${formatDay(daysAgo(0))}`
        )
        await page.unrouteAll({ behavior: 'wait' })
        await page.keyboard.press('ControlOrMeta+Enter')

        await expect(dialog).toBeHidden()
        await expect(result).toHaveText(
            `1 cleared transaction after ${formatDay(newDate)} was uncleared.`
        )
        await expect.poll(() => shownLineIds(page)).toEqual([olderId])
        await expectChecked(page, older, true)
        await expect(work.getByTestId('reconcile-title')).toContainText(
            `Statement ending ${formatDay(newDate)}`
        )
        const summary = work.getByTestId('reconcile-summary')
        await expect(bandFigure(summary, 'Statement ending balance')).toContainText('$100.00')
        await expectDifference(page, '$0.00')

        // ⌘S leaves for the accounts screen; the row offers Resume, and ↵ on it resumes.
        await page.keyboard.press('ControlOrMeta+s')
        await visibleScreen(page, 'reconcile-accounts-screen')
        const accountId = await accountIdOf(page, name)
        await expect(visible(page, `reconcile-resume-${accountId}`)).toBeVisible()
        await focusAccountRow(page, accountId)
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL(new RegExp(`/books/reconcile/${reconciliationId}/?$`))
        await visibleScreen(page, 'reconcile-screen')
        await expect.poll(() => shownLineIds(page)).toEqual([olderId])
        await expectChecked(page, older, true)
    })

    test('discard: More asks first, Cancel keeps it, Discard removes it here and on another page', async ({
        page,
    }) => {
        await signIn(page)
        const name = await createReconcileAccount(page, 'bank')
        const stamp = uniqueName('rd')
        const one = `${stamp} deposit one`
        const two = `${stamp} deposit two`
        await postEntryLines(page, {
            date: daysAgo(1),
            memo: `${stamp} entry`,
            lines: [
                { account: name, debit: '100.00', memo: one },
                { account: name, debit: '50.00', memo: two },
                { account: ACCOUNT_LABELS.equity, credit: '150.00' },
            ],
        })
        await startReconciliation(page, name, { balance: '150.00', date: daysAgo(0) })
        await pressRow(page, one)
        await expectChecked(page, one, true)
        await pressRow(page, two)
        await expectChecked(page, two, true)

        // A second page with the same work screen open.
        const other = await openOtherBooksPage(page)
        await openWorkScreen(other, name)
        await expect(lineBox(other, one)).toHaveAttribute('aria-checked', 'true')

        await visible(page, 'reconcile-more').click()
        await visible(page, 'reconcile-menu-discard').click()
        const confirm = visible(page, 'reconcile-discard-confirm')
        await expect(confirm).toBeVisible()
        await expect(visible(page, 'confirm-dialog-body')).toContainText(
            'The 2 cleared marks of this statement are removed.'
        )
        await page
            .getByRole('button', { name: 'Cancel', exact: true })
            .filter({ visible: true })
            .click()
        await expect(confirm).toHaveCount(0)
        await expect(page).toHaveURL(WORK_URL)
        await visibleScreen(page, 'reconcile-screen')
        await expectChecked(page, one, true)
        await expectChecked(page, two, true)

        // While writes are unavailable the menu's Discard says why it is disabled.
        await page.context().setOffline(true)
        await expect(visible(page, 'reconcile-edit-info')).toBeDisabled()
        await visible(page, 'reconcile-more').click()
        await expect(visible(page, 'reconcile-menu-discard')).toBeVisible()
        await expect(visible(page, 'reconcile-menu-discard-description')).toHaveText(OFFLINE_REASON)
        await page.keyboard.press('Escape')
        await expect(visible(page, 'reconcile-menu-discard')).toHaveCount(0)
        await page.context().setOffline(false)
        await expect(visible(page, 'reconcile-edit-info')).toBeEnabled()

        await visible(page, 'reconcile-more').click()
        await visible(page, 'reconcile-menu-discard').click()
        await visible(page, 'reconcile-discard-confirm').click()
        await visibleScreen(page, 'reconcile-accounts-screen')
        await expect(page).toHaveURL(/\/books\/reconcile\/?$/)
        const accountId = await accountIdOf(page, name)
        const row = accountRow(page, name)
        await expect(row.getByTestId(`reconcile-start-${accountId}`)).toBeVisible()
        await expect(row.getByTestId(`reconcile-resume-${accountId}`)).toHaveCount(0)
        await expect(row).toContainText('Never')

        const notFound = visible(other, 'reconcile-not-found')
        await expect(notFound).toContainText('This reconciliation does not exist.')
        await expect(visible(other, 'reconcile-back')).toBeVisible()
        await other.close()
    })

    test('credit card: the card words, a balance typed as the amount owed, and Finish', async ({
        page,
    }) => {
        await signIn(page)
        const name = await createReconcileAccount(page, 'card')
        const stamp = uniqueName('rcc')
        const charge = `${stamp} charge`
        const payment = `${stamp} payment`
        await postEntryLines(page, {
            date: daysAgo(2),
            memo: `${stamp} entry`,
            lines: [
                { account: ACCOUNT_LABELS.equity, debit: '764.20' },
                { account: name, credit: '864.20', memo: charge },
                { account: name, debit: '100.00', memo: payment },
            ],
        })

        await openReconcile(page)
        const accountId = await accountIdOf(page, name)
        await visible(page, `reconcile-start-${accountId}`).click()
        const dialog = page.getByTestId('reconcile-start-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByText('Charges', { exact: true })).toBeVisible()
        await expect(dialog.getByText('Payments', { exact: true })).toBeVisible()
        await expect(dialog.getByText('Deposits', { exact: true })).toHaveCount(0)
        await dialog.getByTestId('reconcile-ending-balance').fill('764.20')
        await dialog.getByTestId('reconcile-ending-date').fill(daysAgo(0))
        await dialog.getByTestId('reconcile-start-submit').click()
        await expect(page).toHaveURL(WORK_URL)
        const work = await visibleScreen(page, 'reconcile-screen')

        await expect(visible(page, 'reconcile-side-tab-all')).toContainText('All')
        await expect(visible(page, 'reconcile-side-tab-out')).toContainText('Charges')
        await expect(visible(page, 'reconcile-side-tab-in')).toContainText('Payments')
        await expect(visible(page, 'reconcile-sort-out')).toContainText('Charge')
        await expect(visible(page, 'reconcile-sort-in')).toContainText('Payment')
        await expect(visible(page, 'reconcile-sort-in')).not.toContainText('Deposit')

        await pressRow(page, charge)
        await expectChecked(page, charge, true)
        await pressRow(page, payment)
        await expectChecked(page, payment, true)
        const summary = work.getByTestId('reconcile-summary')
        await expect(summary).toContainText(
            /Beginning balance[\s\S]*\+[\s\S]*1 charge[\s\S]*\$864\.20[\s\S]*−[\s\S]*1 payment[\s\S]*\$100\.00/
        )
        await expectDifference(page, '$0.00')
        await expect(visible(page, 'reconcile-difference')).toContainText('Balanced')

        const finished = await finishReconciliation(page)
        await expect(bandFigure(finished, 'Statement ending balance')).toContainText('$764.20')
        await expect(finished).toContainText('1 charge')
        await expect(finished).toContainText('1 payment')
        await expect(visible(page, 'reconcile-status')).toHaveText('Reconciled')
    })

    test('phone: cards, Clear all shown, the order toggle, the bottom Finish bar and the More menu', async ({
        page,
    }) => {
        await signIn(page)
        const name = await createReconcileAccount(page, 'bank')
        const stamp = uniqueName('rp')
        const pay = `${stamp} payment`
        const dep = `${stamp} deposit`
        await postDatedEntry(page, {
            memo: pay,
            amount: '250.00',
            debitAccount: ACCOUNT_LABELS.equity,
            creditAccount: name,
            date: daysAgo(2),
        })
        await postDatedEntry(page, {
            memo: dep,
            amount: '400.00',
            debitAccount: name,
            creditAccount: ACCOUNT_LABELS.equity,
            date: daysAgo(1),
        })
        await startReconciliation(page, name, { balance: '150.00', date: daysAgo(0) })
        const payId = await lineIdOf(lineRow(page, pay))
        const depId = await lineIdOf(lineRow(page, dep))

        await page.setViewportSize(PHONE)
        const cards = visible(page, 'reconcile-cards')
        await expect(cards).toBeVisible()
        await expect(visible(page, 'reconcile-table')).toHaveCount(0)
        await expect(visible(page, `reconcile-row-${payId}`)).toContainText('-$250.00')

        // Finish is in the bottom bar only, with the reason it is disabled.
        const bar = visible(page, 'reconcile-finish-bar')
        await expect(bar).toBeVisible()
        await expect(visible(page, 'reconcile-finish')).toHaveCount(1)
        await expect(bar.getByTestId('reconcile-finish')).toBeDisabled()
        await expect(bar).toContainText(FINISH_HINT)
        await expect(bar.getByTestId('reconcile-disabled-reason')).toHaveText(FINISH_HINT)
        await expect(visible(page, 'reconcile-disabled-reason')).toHaveCount(1)
        await expect(visible(page, 'reconcile-edit-info')).toHaveCount(0)
        await expect(visible(page, 'reconcile-later')).toHaveCount(0)

        // The order toggle puts the newest card first, then the oldest again.
        await expect.poll(async () => (await shownLineIds(page))[0]).toBe(payId)
        const order = visible(page, 'reconcile-sort-date')
        await order.click()
        await expect.poll(async () => (await shownLineIds(page))[0]).toBe(depId)
        await order.click()
        await expect.poll(async () => (await shownLineIds(page))[0]).toBe(payId)

        await visible(page, 'reconcile-phone-bar').getByTestId('reconcile-select-all').click()
        for (const id of [payId, depId]) {
            await expect(visible(page, `reconcile-check-${id}`)).toHaveAttribute(
                'aria-checked',
                'true'
            )
        }
        await expect(visible(page, 'reconcile-difference')).toContainText('Balanced')
        await expect(visible(page, 'reconcile-difference')).not.toContainText('Not balanced')
        await expect(bar.getByTestId('reconcile-finish')).toBeEnabled()
        await expect(bar).not.toContainText(FINISH_HINT)
        await expect(visible(page, 'reconcile-disabled-reason')).toHaveCount(0)

        // The More menu holds the header's other actions on a phone.
        await visible(page, 'reconcile-more').click()
        await expect(visible(page, 'reconcile-menu-edit')).toContainText('Edit info')
        await expect(visible(page, 'reconcile-menu-later')).toContainText('Finish later')
        await expect(visible(page, 'reconcile-menu-discard')).toContainText(
            'Discard reconciliation'
        )
        await page.keyboard.press('Escape')
        await expect(visible(page, 'reconcile-menu-discard')).toHaveCount(0)

        // E and ⌘S work on a phone too: E opens Edit info, ⌘S leaves for the accounts
        // screen, and Resume comes back to the same work screen.
        await page.keyboard.press('e')
        const editTitle = page
            .getByText('Edit statement information', { exact: true })
            .filter({ visible: true })
        await expect(editTitle).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(editTitle).toHaveCount(0)
        await page.keyboard.press('ControlOrMeta+s')
        await visibleScreen(page, 'reconcile-accounts-screen')
        const accountId = await accountIdOf(page, name)
        await visible(page, `reconcile-resume-${accountId}`).click()
        await visibleScreen(page, 'reconcile-screen')
        await expect(visible(page, `reconcile-check-${payId}`)).toHaveAttribute(
            'aria-checked',
            'true'
        )

        const finished = await finishReconciliation(page)
        await expect(finished).toContainText('1 payment')
        await expect(finished).toContainText('1 deposit')
    })
})

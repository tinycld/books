import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage, trackRealtimeClients } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import {
    accountItem,
    DESKTOP,
    openChart,
    openRegister,
    revealRegisterItem,
} from './account-register-helpers'
import { bankCard, connectAccount, fakeReadOnlyAccess, openBanking } from './banking-helpers'
import { ACCOUNT_LABELS, postedEntryNumber } from './journal-entries-helpers'
import {
    accountIdOf,
    bandFigure,
    createReconcileAccount,
    daysAgo,
    finishReconciliation,
    lineBox,
    lineIdOf,
    lineRow,
    openWorkScreen,
    postDatedEntry,
    postEntryLines,
    pressRow,
    reconciliationIdOf,
    startReconciliation,
} from './reconcile-helpers'
import { uniqueName } from './record-form-helpers'
import { visibleScreen } from './screen-helpers'

// Reconcile spec §2 "Other entry points" (the register's Reconcile button, the Banking More
// menu's Reconcile) and §3 "The account register" ("Reconciled through", the Status column,
// the entry drawer's word and statement), §3 "When a cleared or reconciled transaction
// changes" (a void). Each writer test makes its own account in the Chart of Accounts and posts
// its own entries through the journal entry form against 3000 Owner's Equity, dated today or
// a few days before. The reader test makes and reconciles its account in a writer session of
// its own, and reads only the date-free header of the seeded reconciliations of 1010 Business
// Savings.

const WORK_URL = /\/books\/reconcile\/[a-z0-9]{15}\/?$/

async function signIn(page: Page): Promise<void> {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

function visible(page: Page, testId: string): Locator {
    return page.getByTestId(testId).filter({ visible: true })
}

// The register's visible row that shows `memo` exactly: an earlier register of the same
// account can stay stacked and hidden under a later one, with the same test ids.
function registerRow(page: Page, memo: string): Locator {
    return page
        .locator('[data-testid^="register-row-"]')
        .filter({ has: page.getByText(memo, { exact: true }), visible: true })
}

async function registerLineId(page: Page, memo: string): Promise<string> {
    const row = registerRow(page, memo)
    await revealRegisterItem(page, row)
    await expect(row).toHaveCount(1)
    return ((await row.getAttribute('data-testid')) ?? '').replace('register-row-', '')
}

function statusCell(page: Page, lineId: string): Locator {
    return visible(page, `register-cell-status-${lineId}`)
}

async function openRegisterOf(page: Page, name: string): Promise<void> {
    await openRegister(page, name)
    await expect(visible(page, 'register-title')).toContainText(name)
}

// A reader has no row menu in the Chart: the row opens the account panel, whose View
// register opens the register. The row is found through the chart's search box.
async function openReaderRegister(page: Page, name: string): Promise<void> {
    await openChart(page)
    await visible(page, 'account-search').fill(name)
    await accountItem(page, name).click()
    await visible(page, 'account-panel-view-register').click()
    await expect(visible(page, 'register-title')).toContainText(name)
}

async function chooseRange(page: Page, name: string): Promise<void> {
    await visible(page, 'register-range').click()
    await page.getByRole('menuitem', { name, exact: true }).click()
    await expect(visible(page, 'register-range')).toContainText(name)
    await expect(page.getByTestId('register-loading')).toHaveCount(0)
}

// The accounts screen with the start dialog open for the account named `name`.
async function expectStartDialogFor(page: Page, name: string): Promise<Locator> {
    await visibleScreen(page, 'reconcile-accounts-screen')
    const dialog = visible(page, 'reconcile-start-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(`Reconcile ${name}`)
    return dialog
}

async function chooseVoid(page: Page): Promise<Locator> {
    await visible(page, 'entry-actions').getByRole('button', { name: 'Void', exact: true }).click()
    const dialog = page.getByTestId('void-dialog')
    await expect(dialog).toBeVisible()
    return dialog
}

test.describe('reconcile: register and entry points', () => {
    test('register: R starts, the Status words follow clearing and Finish, the drawer names the statement', async ({
        page,
    }) => {
        await signIn(page)
        const name = await createReconcileAccount(page, 'bank')
        const stamp = uniqueName('rr')
        const depositA = `${stamp} deposit A`
        const depositB = `${stamp} deposit B`
        const today = daysAgo(0)
        await postEntryLines(page, {
            date: today,
            memo: `${stamp} entry`,
            lines: [
                { account: name, debit: '300.00', memo: depositA },
                { account: name, debit: '50.00', memo: depositB },
                { account: ACCOUNT_LABELS.equity, credit: '350.00' },
            ],
        })

        await openRegisterOf(page, name)
        const reconcile = visible(page, 'register-reconcile')
        await expect(reconcile).toBeVisible()
        await expect(visible(page, 'register-reconciled-through')).toHaveCount(0)

        // R opens the accounts screen with the start dialog of this account.
        await page.keyboard.press('r')
        const dialog = await expectStartDialogFor(page, name)
        await dialog.getByTestId('reconcile-ending-balance').fill('300.00')
        await dialog.getByTestId('reconcile-ending-date').fill(today)
        await dialog.getByTestId('reconcile-start-submit').click()
        await expect(page).toHaveURL(WORK_URL)
        await visibleScreen(page, 'reconcile-screen')
        const reconciliationId = reconciliationIdOf(page)
        const lineA = await lineIdOf(lineRow(page, depositA))
        const lineB = await lineIdOf(lineRow(page, depositB))
        await pressRow(page, depositA)
        await expect(lineBox(page, depositA)).toHaveAttribute('aria-checked', 'true')
        await visible(page, 'reconcile-later').click()
        await visibleScreen(page, 'reconcile-accounts-screen')

        // In progress: A reads Cleared, B nothing.
        await openRegisterOf(page, name)
        await expect(statusCell(page, lineA)).toHaveText('Cleared')
        await expect(statusCell(page, lineB)).toHaveText('')
        await expect(visible(page, 'register-reconciled-through')).toHaveCount(0)

        // With a reconciliation in progress the button opens it, with no dialog.
        await visible(page, 'register-reconcile').click()
        await expect(page).toHaveURL(new RegExp(`/books/reconcile/${reconciliationId}/?$`))
        await visibleScreen(page, 'reconcile-screen')
        await expect(page.getByTestId('reconcile-start-dialog')).toHaveCount(0)
        await finishReconciliation(page)

        // Finished: the header names the statement, A reads Reconciled, B nothing.
        await openRegisterOf(page, name)
        await expect(visible(page, 'register-reconciled-through')).toHaveText(
            `Reconciled through ${formatDay(today)}`
        )
        await expect(statusCell(page, lineA)).toHaveText('Reconciled')
        await expect(statusCell(page, lineB)).toHaveText('')

        // The entry drawer of A shows its word and its statement.
        const rowA = visible(page, `register-row-${lineA}`)
        await rowA.focus()
        await page.keyboard.press('Enter')
        const drawer = visible(page, 'register-entry-drawer')
        await expect(drawer).toBeVisible()
        // A and B are lines of one entry: the word and the statement are on A's line, and
        // B's line has neither.
        const statusA = drawer.getByTestId(`register-drawer-status-${lineA}`)
        await expect(statusA).toContainText('Reconciled')
        await expect(statusA).toContainText(`Statement of ${formatDay(today)}`)
        await expect(drawer.getByTestId(`register-drawer-line-${lineB}`)).toBeVisible()
        await expect(drawer.getByTestId(`register-drawer-status-${lineB}`)).toHaveCount(0)

        // Beside the inline drawer at 1280 the list is cards: A's card shows the word after
        // its Ref no., B's card none.
        const cardA = visible(page, `register-card-${lineA}`)
        const cardB = visible(page, `register-card-${lineB}`)
        await expect(cardA).toBeVisible()
        await expect(cardB).toBeVisible()
        await expect(cardA.getByTestId(`register-cell-status-${lineA}`)).toHaveText('Reconciled')
        await expect(cardB.getByTestId(`register-cell-status-${lineB}`)).toHaveCount(0)

        // The core Drawer pushes no shortcut scope: R still reaches the register.
        await page.keyboard.press('r')
        await expectStartDialogFor(page, name)
    })

    test('void: a reconciled entry refuses with the statement, a cleared one voids and leaves the list', async ({
        page,
    }) => {
        await signIn(page)
        const name = await createReconcileAccount(page, 'bank')
        const stamp = uniqueName('rv')
        const reconciledMemo = `${stamp} reconciled deposit`
        const clearedMemo = `${stamp} cleared deposit`
        const firstStatement = daysAgo(1)
        await postDatedEntry(page, {
            memo: reconciledMemo,
            amount: '100.00',
            debitAccount: name,
            creditAccount: ACCOUNT_LABELS.equity,
            date: firstStatement,
        })
        const reconciledNumber = await postedEntryNumber(page)
        await postDatedEntry(page, {
            memo: clearedMemo,
            amount: '40.00',
            debitAccount: name,
            creditAccount: ACCOUNT_LABELS.equity,
            date: daysAgo(0),
        })

        // The first statement reconciles the first entry; the second clears the second.
        await startReconciliation(page, name, { balance: '100.00', date: firstStatement })
        await pressRow(page, reconciledMemo)
        await expect(lineBox(page, reconciledMemo)).toHaveAttribute('aria-checked', 'true')
        await finishReconciliation(page)
        // The summary's Reconcile another account returns to the accounts screen below it.
        await visible(page, 'reconcile-another').click()
        await visibleScreen(page, 'reconcile-accounts-screen')
        await visible(page, `reconcile-start-${await accountIdOf(page, name)}`).click()
        const second = visible(page, 'reconcile-start-dialog')
        await expect(second).toBeVisible()
        await second.getByTestId('reconcile-ending-balance').fill('140.00')
        await second.getByTestId('reconcile-ending-date').fill(daysAgo(0))
        await second.getByTestId('reconcile-start-submit').click()
        await expect(page).toHaveURL(WORK_URL)
        await visibleScreen(page, 'reconcile-screen')
        const clearedLine = await lineIdOf(lineRow(page, clearedMemo))
        await pressRow(page, clearedMemo)
        await expect(lineBox(page, clearedMemo)).toHaveAttribute('aria-checked', 'true')
        await visible(page, 'reconcile-later').click()
        await visibleScreen(page, 'reconcile-accounts-screen')

        // A void of the reconciled entry is refused, and the entry stays posted. The entry
        // opens from the register's drawer: a trip to the entries list after the entry forms
        // above would stack a second, hidden list.
        await openRegisterOf(page, name)
        // The reconciled entry is dated yesterday, which is last month on the 1st of a month.
        const sameMonth = firstStatement.slice(0, 7) === daysAgo(0).slice(0, 7)
        await chooseRange(page, sameMonth ? 'This month' : 'Last month')
        const reconciledRow = registerRow(page, reconciledMemo)
        await expect(reconciledRow).toHaveCount(1)
        await reconciledRow.focus()
        await page.keyboard.press('Enter')
        await visible(page, 'register-drawer-open-entry').click()
        await expect(visible(page, 'entry-read-only')).toContainText(reconciledMemo)
        const refused = await chooseVoid(page)
        await refused.getByTestId('void-confirm').click()
        await expect(refused.getByTestId('entry-error-summary')).toContainText(
            `Journal entry ${reconciledNumber} is reconciled on ${name} (statement of ${formatDay(firstStatement)}). It cannot be voided or changed.`
        )
        await expect(refused).toBeVisible()
        await refused.getByRole('button', { name: 'Cancel', exact: true }).click()
        await expect(refused).toHaveCount(0)
        await expect(visible(page, 'entry-badge')).toHaveText('Posted')

        // A void of the cleared entry goes through and removes its cleared mark. The entry opens
        // from its Transaction link on the work screen: a second trip to the entries list would
        // stack a second, hidden list.
        await openWorkScreen(page, name)
        await visible(page, `reconcile-link-${clearedLine}`).click()
        await expect(visible(page, 'entry-read-only')).toContainText(clearedMemo)
        const voiding = await chooseVoid(page)
        await voiding.getByTestId('void-confirm').click()
        await expect(visible(page, 'entry-badge')).toHaveText('Void')

        const work = await openWorkScreen(page, name)
        const summary = work.getByTestId('reconcile-summary')
        await expect(bandFigure(summary, 'Beginning balance')).toContainText('$100.00')
        await expect(bandFigure(summary, 'Cleared balance')).toContainText('$100.00')
        await expect(lineRow(page, clearedMemo)).toHaveCount(0)
    })

    test('Banking menu: Reconcile follows View register and opens the start dialog', async ({
        page,
    }) => {
        await signIn(page)
        const name = await createReconcileAccount(page, 'bank')
        await openBanking(page)
        await connectAccount(page, name)

        await page.getByTestId('bank-panel-more').click()
        await expect(page.getByRole('menuitem')).toHaveText([
            'Edit bank details',
            'View register',
            'Reconcile',
            'Disconnect',
        ])
        await page.getByTestId('bank-menu-reconcile').click()
        await expectStartDialogFor(page, name)
    })

    test('a reader has no Reconcile entry point and reads the Status words', async ({
        page,
        browser,
    }) => {
        // A writer session makes the account and reconciles A; B stays out. Both lines are
        // dated today, inside the register's default range.
        const stamp = uniqueName('rd')
        const depositA = `${stamp} deposit A`
        const depositB = `${stamp} deposit B`
        const today = daysAgo(0)
        const context = await browser.newContext()
        trackRealtimeClients(context)
        let name = ''
        try {
            const writer = await context.newPage()
            await signIn(writer)
            name = await createReconcileAccount(writer, 'bank')
            await postEntryLines(writer, {
                date: today,
                memo: `${stamp} entry`,
                lines: [
                    { account: name, debit: '300.00', memo: depositA },
                    { account: name, debit: '50.00', memo: depositB },
                    { account: ACCOUNT_LABELS.equity, credit: '350.00' },
                ],
            })
            await startReconciliation(writer, name, { balance: '300.00', date: today })
            await pressRow(writer, depositA)
            await expect(lineBox(writer, depositA)).toHaveAttribute('aria-checked', 'true')
            await finishReconciliation(writer)
        } finally {
            await context.close()
        }

        await fakeReadOnlyAccess(page)
        await signIn(page)

        // The reader's Banking panel has a View register link and no More menu.
        await openBanking(page)
        await bankCard(page, '1000 Business Checking').click()
        await expect(visible(page, 'bank-view-register')).toBeVisible()
        await expect(page.getByTestId('bank-panel-more')).toHaveCount(0)
        await expect(page.getByTestId('bank-menu-reconcile')).toHaveCount(0)

        // The seeded 1010 Business Savings: no Reconcile button, and its header names the
        // seeded finished statement, which the reconciliations read gives whatever the range.
        await openReaderRegister(page, 'Business Savings')
        await expect(page.getByTestId('register-reconcile')).toHaveCount(0)
        // RECONCILE_SEED.finished.statement_date is 2026-08-31.
        await expect(visible(page, 'register-reconciled-through')).toHaveText(
            'Reconciled through Aug 31, 2026'
        )

        // The writer's account: the reader sees the words and the statement, and no button.
        await openReaderRegister(page, name)
        const lineA = await registerLineId(page, depositA)
        const lineB = await registerLineId(page, depositB)
        await expect(visible(page, 'register-reconciled-through')).toHaveText(
            `Reconciled through ${formatDay(today)}`
        )
        await expect(statusCell(page, lineA)).toHaveText('Reconciled')
        await expect(statusCell(page, lineB)).toHaveText('')
        await expect(page.getByTestId('register-reconcile')).toHaveCount(0)
    })
})

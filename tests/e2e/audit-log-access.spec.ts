import { expect, test } from '@playwright/test'
import { hubRow, login, navigateToPackage, signInAsCollaborator } from '@tinycld/core/e2e-helpers'
import { AUDIT_LOG_TITLE } from '~/tinycld/books/lib/audit-log-fixture'
import {
    openEntryFromList,
    openHistoryFromMore,
    openMoreMenu,
    openRecordId,
    postInvoiceFor,
    waitForAuditRow,
} from './audit-log-helpers'
import { collaboratorLevel, type Level, setCollaboratorLevel } from './books-access-helpers'
import { openBooksReports } from './books-report-helpers'
import { createCustomer, openCustomer } from './customer-form-helpers'
import { openInvoiceBySearch, uniqueMemo } from './invoice-helpers'
import { ACCOUNT_LABELS, createPostedEntry, postedEntryNumber } from './journal-entries-helpers'
import { uniqueName } from './products-services-helpers'

// The shared collaborator as a Books reader (spec §3 "Who sees it", Q2): a read-only user
// reads the Audit Log and every record's history, and More → Audit history is offered on
// each record screen; at level None a pasted history link shows the no-access state. The
// collaborator's level is one row of the shared e2e database, so this file's title ends in
// "(collaborator level)" and runs in the one-worker `books-access-level` project
// (playwright.config.ts, plan P5); the level is put back in afterEach (lesson 35).

// What afterEach puts back: the collaborator's own browser context, and their level.
const restore: { level: Level | undefined; closeReader: (() => Promise<void>) | undefined } = {
    level: undefined,
    closeReader: undefined,
}

test.describe('audit-log: access (collaborator level)', () => {
    test.use({ viewport: { width: 1280, height: 800 }, timezoneId: 'America/Chicago' })

    test.afterEach(async ({ page }) => {
        const { level, closeReader } = restore
        restore.level = undefined
        restore.closeReader = undefined
        if (closeReader) await closeReader()
        if (level !== undefined) await setCollaboratorLevel(page, level)
    })

    test('a read-only collaborator reads the Audit Log and each record’s history, and at None a pasted history link shows no access', async ({
        page,
    }) => {
        // As the owner: a new customer, an invoice to them, and a posted entry.
        await login(page)
        await navigateToPackage(page, 'books')
        const customer = uniqueName('Audit access customer')
        await createCustomer(page, { name: customer })
        const customerId = await openRecordId(page)
        const invoiceMemo = uniqueMemo('Audit access invoice')
        const invoice = await postInvoiceFor(page, customer, invoiceMemo)
        const entryMemo = uniqueMemo('Audit access entry')
        await createPostedEntry(page, {
            memo: entryMemo,
            amount: '34.56',
            debitAccount: ACCOUNT_LABELS.checking,
            creditAccount: ACCOUNT_LABELS.equity,
        })
        const entryId = await openRecordId(page)
        const entryTitle = `Journal entry ${await postedEntryNumber(page)}`

        restore.level = await collaboratorLevel(page)
        await setCollaboratorLevel(page, 'read_only')

        const reader = await signInAsCollaborator(page)
        restore.closeReader = reader.close
        const view = reader.page

        // The hub lists the Audit Log, and it holds the owner's Posted row.
        await openBooksReports(view)
        await expect(hubRow(view, AUDIT_LOG_TITLE)).toBeVisible()
        await hubRow(view, AUDIT_LOG_TITLE).click()
        await expect(view.getByTestId('report-table')).toBeVisible()
        await waitForAuditRow(view, { record: entryTitle, event: 'Posted' })

        // The customer page: More holds Audit history alone.
        await navigateToPackage(view, 'books')
        await openCustomer(view, customer)
        const customerItems = await openMoreMenu(view, 'customer-more')
        await expect(customerItems).toHaveText(['Audit history'])
        await openHistoryFromMore(view, 'customer-more-history', {
            collection: 'books_customers',
            id: customerId,
            title: customer,
        })

        // The entry's read view: More holds Audit history alone.
        await openEntryFromList(view, entryMemo, entryId)
        await expect(view.getByTestId('entry-read-only').filter({ visible: true })).toBeVisible()
        await expect(view.getByTestId('entry-edit')).toHaveCount(0)
        const entryItems = await openMoreMenu(view, 'entry-more')
        await expect(entryItems).toHaveText(['Audit history'])
        await openHistoryFromMore(view, 'entry-history', {
            collection: 'books_journal_entries',
            id: entryId,
            title: entryTitle,
        })

        // The invoice's read view: Audit history after the reader's own items, if any.
        await openInvoiceBySearch(view, invoiceMemo)
        await expect(view.getByTestId('invoice-read-only')).toBeVisible()
        const invoiceItems = await openMoreMenu(view, 'invoice-read-more')
        await expect(invoiceItems.last()).toHaveText('Audit history')
        await openHistoryFromMore(view, 'invoice-read-history', {
            collection: 'books_invoices',
            id: invoice.id,
            title: `Invoice ${invoice.number}`,
        })

        // Level None: a pasted link to the entry's history shows the no-access state.
        await setCollaboratorLevel(page, 'none')
        await view.goto(`/a/books/history/books_journal_entries/${entryId}`)
        await expect(view.getByTestId('history-no-access')).toHaveText(
            "You need Books access to see a record's history."
        )
    })
})

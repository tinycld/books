import { expect, test } from '@playwright/test'
import { login, navigateToPackage, TEST_USER_NAME } from '@tinycld/core/e2e-helpers'
import { shortDay } from '@tinycld/core/reports/lib/dates'
import {
    expectPhoneMoreHistory,
    historyEvents,
    openAuditLog,
    openEntryFromList,
    openHistoryFromMore,
    openHistoryFromRow,
    openMoreMenu,
    openRecordId,
    postInvoiceFor,
    waitForAuditRow,
} from './audit-log-helpers'
import { browserToday } from './books-report-helpers'
import { createCustomer } from './customer-form-helpers'
import { uniqueMemo } from './invoice-helpers'
import {
    ACCOUNT_LABELS,
    createDraftEntry,
    createPostedEntry,
    fillLine,
    openOtherBooksPage,
    postedEntryNumber,
    postOpenEntry,
} from './journal-entries-helpers'
import {
    createProduct,
    deleteDialog,
    expectSavedToList,
    field,
    openDeleteDialog,
    openProduct,
    productEntry,
    productIdOf,
    productSurface,
    searchProducts,
    uniqueName,
} from './products-services-helpers'

// Record history as a Books screen, opened from an Audit Log row (spec §3 Record history).
// Every change is made through the UI; the reader's zone is Central time, not the
// server's UTC, so a time written in UTC would not match the report row's.

function escaped(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// A Field | Before | After row as its cells read in order (money may carry its symbol).
function fieldRow(label: string, before: string, after: string): RegExp {
    return new RegExp(`${label}\\s*\\$?${escaped(before)}\\s*\\$?${escaped(after)}`)
}

// An amount no other run uses, from 100.00 to 899.99, so it and the same amount plus
// 50.00 have no thousands mark in a line's record label or in the table.
function uniqueAmount(): string {
    const cents = 10_000 + ((Date.now() + test.info().workerIndex * 7919) % 80_000)
    return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

function plusFifty(amount: string): string {
    const cents = Math.round(Number(amount) * 100) + 5_000
    return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

// Every read of the history's audit rows (the books_audit_log list request).
function isAuditRead(url: URL): boolean {
    return url.pathname.endsWith('/api/collections/books_audit_log/records')
}

const EMPTY_PAGE = { page: 1, perPage: 50, totalItems: 0, totalPages: 0, items: [] }

test.describe('audit-log: record history', () => {
    test.use({ viewport: { width: 1280, height: 800 }, timezoneId: 'America/Chicago' })

    test('a product change shows Before and After, a new change arrives live, and Open opens the product', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        const name = uniqueName('Audit history lamp')
        const renamed = `${name} renamed`
        const third = `${name} again`
        await createProduct(page, { type: 'service', name, price: '900.00' })
        await openProduct(page, name)
        await field(page, 'name').fill(renamed)
        await field(page, 'price').fill('1250.00')
        await field(page, 'price').press('Tab')
        await page.getByTestId('product-save').click()
        await expectSavedToList(page)
        await searchProducts(page, renamed)
        const id = await productIdOf(page, renamed)

        await openAuditLog(page)
        const changed = await waitForAuditRow(page, { record: renamed, event: 'Changed' })
        await openHistoryFromRow(page, { record: renamed, event: 'Changed' })
        await expect(page).toHaveURL(new RegExp(`/books/history/books_products/${id}$`))
        await expect(page.getByTestId('history-back')).toBeVisible()
        await expect(page.getByTestId('history-type')).toHaveText('Product or service')
        await expect(page.getByTestId('history-title')).toHaveText(renamed)

        const newest = historyEvents(page).first()
        await expect(newest).toContainText(changed.label)
        await expect(newest).toContainText(TEST_USER_NAME)
        await expect(newest).toContainText('Changed')
        await expect(newest).toContainText(fieldRow('Name', name, renamed))
        await expect(newest).toContainText(/\$?900\.00\s*\$?1,250\.00/)
        for (const internal of ['sort_key', 'name_key', 'Sort key', 'Name key']) {
            await expect(newest).not.toContainText(internal)
        }
        await expect(newest).not.toContainText('Changed (hidden)')

        // Another tab renames it again; this page is not reloaded.
        const before = await historyEvents(page).count()
        const other = await openOtherBooksPage(page, ['products'])
        await openProduct(other, renamed)
        await field(other, 'name').fill(third)
        await other.getByTestId('product-save').click()
        await expectSavedToList(other)
        await other.close()
        await expect(historyEvents(page)).toHaveCount(before + 1)
        await expect(historyEvents(page).first()).toContainText('Changed')
        await expect(historyEvents(page).first()).toContainText(fieldRow('Name', renamed, third))

        const open = page.getByTestId('history-open')
        await expect(open).toHaveText('Open product or service')
        await open.click()
        await expect(page).toHaveURL(new RegExp(`/books/products/${id}`))
        await expect(productSurface(page)).toBeVisible()
    })

    test('a deleted product says when it was deleted and shows its last values', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        const name = uniqueName('Audit history gone')
        await createProduct(page, { type: 'service', name })
        await searchProducts(page, name)
        const id = await productIdOf(page, name)
        await openDeleteDialog(page, id)
        await deleteDialog(page).confirm.click()
        await expect(productEntry(page, name)).toHaveCount(0)
        const today = await browserToday(page)

        await openAuditLog(page)
        await openHistoryFromRow(page, { record: name, event: 'Deleted' })
        await expect(page).toHaveURL(new RegExp(`/books/history/books_products/${id}$`))
        await expect(page.getByTestId('history-deleted')).toHaveText(
            `This record was deleted on ${shortDay(today)}.`
        )
        await expect(page.getByTestId('history-open')).toHaveCount(0)

        // The Deleted event's Field | Value table, then the Added event below it.
        const deleted = historyEvents(page).first()
        await expect(deleted).toContainText('Deleted')
        await expect(deleted).toContainText('Value')
        await expect(deleted).not.toContainText('Before')
        await expect(deleted).toContainText(new RegExp(`Name\\s*${escaped(name)}`))
        await expect(historyEvents(page).last()).toContainText(`Added ${name}`)
    })

    test('a journal line row opens its entry’s history with the lines’ events', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        const first = uniqueAmount()
        const second = plusFifty(first)
        await createDraftEntry(page, {
            memo: uniqueMemo('Audit history lines'),
            amount: first,
            debitAccount: ACCOUNT_LABELS.checking,
            creditAccount: ACCOUNT_LABELS.equity,
        })
        const entryId = /\/books\/entries\/([a-z0-9]{15})/.exec(page.url())?.[1]
        if (!entryId) throw new Error(`no entry id in ${page.url()}`)

        // The saved draft, both sides changed, saved again, then posted.
        await fillLine(page, 0, { debit: second })
        await fillLine(page, 1, { credit: second })
        const saved = page.waitForResponse(
            res => res.url().includes('/api/batch') && res.status() === 200
        )
        await page.getByTestId('entry-save-draft').click()
        await saved
        await postOpenEntry(page)
        const title = `Journal entry ${await postedEntryNumber(page)}`

        await openAuditLog(page)
        await openHistoryFromRow(page, {
            record: `1000:Business Checking debit ${first}`,
            event: 'Added',
        })
        await expect(page).toHaveURL(new RegExp(`/books/history/books_journal_entries/${entryId}$`))
        await expect(page.getByTestId('history-title')).toHaveText(title)

        const events = historyEvents(page)
        await expect(events.filter({ hasText: /Status\s*Draft\s*Posted/ })).toHaveCount(1)
        await expect(events.filter({ hasText: 'Line 1 — Added' })).toHaveCount(1)
        await expect(events.filter({ hasText: 'Line 2 — Added' })).toHaveCount(1)
        await expect(
            events
                .filter({ hasText: 'Line 1 — Changed' })
                .filter({ hasText: fieldRow('Debit', first, second) })
        ).toHaveCount(1)

        await page.getByTestId('history-open').click()
        await expect(page).toHaveURL(new RegExp(`/books/entries/${entryId}`))
        // The report's row link pushed the history on top of the Books stack, so the entry
        // screen posted earlier stays mounted and hidden under the one Open pushes.
        await expect(page.getByTestId('entry-read-only').filter({ visible: true })).toBeVisible()
    })

    test('the history shows loading, then an error with Retry, then the empty state', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        const name = uniqueName('Audit history states')
        await createProduct(page, { type: 'service', name })
        await openAuditLog(page)
        await waitForAuditRow(page, { record: name, event: 'Added' })

        const read = { release: () => {} }
        const held = new Promise<void>(resolve => {
            read.release = resolve
        })
        await page.route(isAuditRead, async route => {
            await held
            await route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ status: 400, message: 'Bad request.', data: {} }),
            })
        })
        await openHistoryFromRow(page, { record: name, event: 'Added' })
        await expect(page.getByTestId('history-loading')).toBeVisible()

        read.release()
        await expect(page.getByTestId('history-error')).toBeVisible()
        await expect(page.getByTestId('history-retry')).toBeVisible()
        await expect(page.getByTestId('history-loading')).toHaveCount(0)

        await page.unrouteAll({ behavior: 'wait' })
        await page.route(isAuditRead, route =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(EMPTY_PAGE),
            })
        )
        await page.getByTestId('history-retry').click()
        await expect(page.getByTestId('history-empty')).toContainText(
            'No changes recorded for this record.'
        )
        await expect(page.getByTestId('history-error')).toHaveCount(0)
    })

    // Spec §3 "Entry points": Audit history is the last item of the More menu of a customer
    // page, a document's read view and a journal entry (read view and saved draft); a wide
    // screen that had no More for its actions now shows one holding it.
    test('More → Audit history opens the history of a customer, an invoice and a posted and a draft entry', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')

        // The invoice's customer, new, from the Books landing.
        const customer = uniqueName('Audit menu customer')
        await createCustomer(page, { name: customer })
        const customerId = openRecordId(page)
        const customerItems = await openMoreMenu(page, 'customer-more')
        await expect(customerItems).toHaveText([
            'Add sub-customer',
            'Make inactive',
            'Delete customer',
            'Audit history',
        ])
        await openHistoryFromMore(page, 'customer-more-history', {
            collection: 'books_customers',
            id: customerId,
            title: customer,
        })

        // A posted invoice at 1280: its actions are buttons, so More holds Audit history alone.
        const invoice = await postInvoiceFor(page, customer, uniqueMemo('Audit menu invoice'))
        await expect(page.getByTestId('invoice-read-actions')).toBeVisible()
        const invoiceItems = await openMoreMenu(page, 'invoice-read-more')
        await expect(invoiceItems).toHaveText(['Audit history'])
        await openHistoryFromMore(page, 'invoice-read-history', {
            collection: 'books_invoices',
            id: invoice.id,
            title: `Invoice ${invoice.number}`,
        })
        // The invoice form left an entries list in the stack; a sidebar push from here would
        // stack a second, hidden one (memory p3-transfer), so go back before the entry steps.
        await page.getByTestId('history-back').filter({ visible: true }).click()
        await expect(page.getByTestId('invoice-read-only').filter({ visible: true })).toBeVisible()
        // A phone's More holds every action but Edit, then Audit history last. Receive payment
        // is first: the invoice is posted and has a balance.
        await expectPhoneMoreHistory(
            page,
            {
                trigger: 'invoice-read-more',
                history: 'invoice-read-history',
                before: [
                    /Receive payment/,
                    /Void/,
                    /Copy/,
                    /Create credit memo/,
                    /View journal entry/,
                    /Download PDF/,
                ],
            },
            { collection: 'books_invoices', id: invoice.id, title: `Invoice ${invoice.number}` }
        )
        await expect(page.getByTestId('invoice-read-only').filter({ visible: true })).toBeVisible()

        // A posted entry, opened from the list search: More on the wide read view.
        const postedMemo = uniqueMemo('Audit menu posted')
        await createPostedEntry(page, {
            memo: postedMemo,
            amount: '12.34',
            debitAccount: ACCOUNT_LABELS.checking,
            creditAccount: ACCOUNT_LABELS.equity,
        })
        const postedId = openRecordId(page)
        const postedTitle = `Journal entry ${await postedEntryNumber(page)}`
        await openEntryFromList(page, postedMemo, postedId)
        await expect(page.getByTestId('entry-read-only').filter({ visible: true })).toBeVisible()
        const postedItems = await openMoreMenu(page, 'entry-more')
        await expect(postedItems.last()).toHaveText('Audit history')
        await openHistoryFromMore(page, 'entry-history', {
            collection: 'books_journal_entries',
            id: postedId,
            title: postedTitle,
        })
        await page.getByTestId('history-back').filter({ visible: true }).click()
        await expect(page.getByTestId('entry-read-only').filter({ visible: true })).toBeVisible()
        // A phone's More holds Reverse and Void, then Audit history last.
        await expectPhoneMoreHistory(
            page,
            { trigger: 'entry-more', history: 'entry-history', before: [/Reverse/, /Void/] },
            { collection: 'books_journal_entries', id: postedId, title: postedTitle }
        )
        await expect(page.getByTestId('entry-read-only').filter({ visible: true })).toBeVisible()

        // A saved draft, reopened: More holds Delete draft, then Audit history.
        const draftMemo = uniqueMemo('Audit menu draft')
        await createDraftEntry(page, {
            memo: draftMemo,
            amount: '23.45',
            debitAccount: ACCOUNT_LABELS.checking,
            creditAccount: ACCOUNT_LABELS.equity,
        })
        const draftId = openRecordId(page)
        await openEntryFromList(page, draftMemo, draftId)
        await expect(page.getByTestId('entry-badge').filter({ visible: true })).toHaveText('Draft')
        const draftItems = await openMoreMenu(page, 'entry-more')
        await expect(draftItems).toHaveText(['Delete draft', 'Audit history'])
        await openHistoryFromMore(page, 'entry-history', {
            collection: 'books_journal_entries',
            id: draftId,
        })
        await page.getByTestId('history-back').filter({ visible: true }).click()
        await expect(page.getByTestId('entry-badge').filter({ visible: true })).toHaveText('Draft')
        // A phone's More holds Post & new and Delete draft, then Audit history last.
        await expectPhoneMoreHistory(
            page,
            {
                trigger: 'entry-more',
                history: 'entry-history',
                before: [/Post & new/, /Delete draft/],
            },
            { collection: 'books_journal_entries', id: draftId }
        )
    })
})

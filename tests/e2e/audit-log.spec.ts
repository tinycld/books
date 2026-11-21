import { expect, test } from '@playwright/test'
import {
    chooseParamOption,
    hubRow,
    login,
    navigateToPackage,
    TEST_USER_NAME,
} from '@tinycld/core/e2e-helpers'
import { rangeWords } from '@tinycld/core/reports/lib/dates'
import { AUDIT_SHOWN_EVENT_OPTIONS } from '~/tinycld/books/lib/audit-log'
import {
    AUDIT_LOG_DESCRIPTION,
    AUDIT_LOG_TITLE,
    AUDIT_LOG_ZONE_WORDS,
} from '~/tinycld/books/lib/audit-log-fixture'
import {
    type AuditRowText,
    auditRows,
    localMinutesSince,
    openAuditLog,
    pageNow,
    waitForAuditRow,
} from './audit-log-helpers'
import {
    browserToday,
    dayWords,
    expectedHeading,
    openBooksReports,
    reportSnapshot,
    snapshotWhen,
    voidPostedEntry,
} from './books-report-helpers'
import { uniqueMemo } from './invoice-helpers'
import {
    ACCOUNT_LABELS,
    createPostedEntry,
    openOtherBooksPage,
    postedEntryNumber,
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
    searchProducts,
    uniqueName,
} from './products-services-helpers'

// The Audit Log over real changes made through the UI (spec §6). The reader's zone is
// Central time, not the server's UTC, so a Date changed in UTC would fail the minute check.

const PARAM_CHIPS = [
    'report-param-period',
    'report-param-users',
    'report-param-events',
    'report-param-types',
]

// The Add filter menu's items for the params with no default, in the spec's order.
const FILTER_ITEMS = [
    'report-add-filter-users',
    'report-add-filter-events',
    'report-add-filter-types',
]

// The first and last day of the browser's month: the This month the report opens on.
function monthOf(today: string): { from: string; to: string } {
    const year = Number(today.slice(0, 4))
    const month = Number(today.slice(5, 7))
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return {
        from: `${today.slice(0, 8)}01`,
        to: `${today.slice(0, 8)}${String(last).padStart(2, '0')}`,
    }
}

// The Event column shows a row's event_shown, not its event: the view writes
// event_shown = 'credit_removed' for a delete of a credit memo application and the event
// itself for every other delete (EVENT_SHOWN, pb-migrations/2100000037_create_books_audit_log.js;
// shownEvent in lib/audit-log-fixture.ts mirrors it). So the Deleted filter shows these.
const DELETED_SHOWN = ['deleted', 'credit_removed']

// The words the Event column draws for those values (auditShownEvents in server/audit.go,
// AUDIT_SHOWN_EVENT_OPTIONS in lib/audit-log.ts).
function shownWordsOf(values: readonly string[]): string[] {
    return values.map(value => {
        const option = AUDIT_SHOWN_EVENT_OPTIONS.find(o => o.value === value)
        if (!option) throw new Error(`no shown event ${value}`)
        return option.label
    })
}

// An amount no other run uses, under 1,000 so the line's label has no thousands mark.
function uniqueAmount(): string {
    const cents = 10_000 + ((Date.now() + test.info().workerIndex * 7919) % 89_999)
    return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

test.describe('audit-log: report', () => {
    test.use({ viewport: { width: 1280, height: 800 }, timezoneId: 'America/Chicago' })

    test('my product changes appear live in my zone, newest first, and the Event chip narrows them', async ({
        page,
    }) => {
        await login(page)
        await openBooksReports(page)
        await expect(hubRow(page, AUDIT_LOG_TITLE)).toContainText(AUDIT_LOG_DESCRIPTION)
        await openAuditLog(page)

        const shown = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.title === AUDIT_LOG_TITLE && s.header !== '' && s.business !== '',
            'the Audit Log header'
        )
        const month = monthOf(await browserToday(page))
        // books-settings.spec.ts changes the business name on the shared DB, so the heading
        // and the name it should show are read in the same poll.
        await expect
            .poll(async () => {
                const snapshot = await reportSnapshot(page)
                const expected = await expectedHeading(page)
                return { matches: snapshot.business === expected && expected !== '', expected }
            })
            .toMatchObject({ matches: true })
        expect(shown.header).toBe(rangeWords(month.from, month.to))
        await expect(page.getByTestId('report-document-zone')).toHaveCount(1)
        await expect(page.getByTestId('report-document-zone')).toHaveText(AUDIT_LOG_ZONE_WORDS)
        // Only the defaulted Date changed is a chip; the unset params wait under Add filter,
        // in the spec's order.
        const chips = await page.evaluate(
            ids =>
                [...document.querySelectorAll('[data-testid^="report-param-"]')]
                    .map(element => element.getAttribute('data-testid') ?? '')
                    .filter(id => ids.includes(id)),
            PARAM_CHIPS
        )
        expect(chips).toEqual(['report-param-period'])
        await expect(page.getByTestId('report-param-period')).toContainText('This month')
        await page.getByTestId('report-add-filter').click()
        await expect(page.getByTestId('report-add-filter-users')).toBeVisible()
        const addable = await page.evaluate(
            ids =>
                [...document.querySelectorAll('[data-testid^="report-add-filter-"]')]
                    .map(element => element.getAttribute('data-testid') ?? '')
                    .filter(id => ids.includes(id)),
            FILTER_ITEMS
        )
        expect(addable).toEqual(FILTER_ITEMS)
        await expect(page.getByTestId('report-add-filter-users')).toHaveText('User')
        await expect(page.getByTestId('report-add-filter-events')).toHaveText('Event')
        await expect(page.getByTestId('report-add-filter-types')).toHaveText('Record type')
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('report-add-filter-users')).toHaveCount(0)
        await expect(page.getByTestId('report-heading-created')).toHaveText(/^Date changed$/i)
        await expect(page.getByTestId('report-heading-user')).toHaveText(/^User$/i)
        await expect(page.getByTestId('report-heading-event')).toHaveText(/^Event$/i)
        await expect(page.getByTestId('report-heading-type')).toHaveText(/^Record type$/i)
        await expect(page.getByTestId('report-heading-record')).toHaveText(/^Record$/i)

        // Another tab adds, renames and deletes a product; this page is not reloaded.
        const name = uniqueName('Audit lamp')
        const renamed = `${name} renamed`
        const other = await openOtherBooksPage(page, ['products'])
        const startedAt = await pageNow(page)
        await createProduct(other, { type: 'service', name })
        await openProduct(other, name)
        await field(other, 'name').fill(renamed)
        await other.getByTestId('product-save').click()
        await expectSavedToList(other)
        await searchProducts(other, renamed)
        const id = await productIdOf(other, renamed)
        await openDeleteDialog(other, id)
        await deleteDialog(other).confirm.click()
        await expect(productEntry(other, renamed)).toHaveCount(0)
        await other.close()

        const added = await waitForAuditRow(page, { record: name, event: 'Added' })
        const changed = await waitForAuditRow(page, { record: renamed, event: 'Changed' })
        const deleted = await waitForAuditRow(page, { record: renamed, event: 'Deleted' })
        // Any minute from just before the first write to now: the three writes and the
        // waits may pass a minute boundary or two.
        const minutes = await localMinutesSince(page, startedAt)
        for (const row of [added, changed, deleted]) {
            expect(row.user, `${row.event} row's user`).toBe(TEST_USER_NAME)
            expect(row.type, `${row.event} row's record type`).toBe('Product or service')
            expect(minutes, `${row.event} row's Date changed in Central time`).toContain(row.label)
        }
        const order = (await auditRows(page)).map(row => row.id)
        expect(order.indexOf(deleted.id)).toBeLessThan(order.indexOf(changed.id))
        expect(order.indexOf(changed.id)).toBeLessThan(order.indexOf(added.id))

        await chooseParamOption(page, 'events', { from: 'add-filter', labels: ['Deleted'] })
        // Other specs delete in the same database: a credit memo application's delete
        // matches the Deleted filter and shows "Credit removed".
        const deletedWords = shownWordsOf(DELETED_SHOWN)
        await expect
            .poll(async () => {
                const rows = await auditRows(page)
                return {
                    onlyDeleted: rows.every(row => deletedWords.includes(row.event)),
                    mine: rows.find(row => row.id === deleted.id)?.event ?? null,
                }
            })
            .toEqual({ onlyDeleted: true, mine: 'Deleted' })
    })

    test('a posted then voided entry and its lines show under the User, Record type and Date changed chips', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        const amount = uniqueAmount()
        await createPostedEntry(page, {
            memo: uniqueMemo('Audit entry'),
            amount,
            debitAccount: ACCOUNT_LABELS.checking,
            creditAccount: ACCOUNT_LABELS.equity,
        })
        const entry = `Journal entry ${await postedEntryNumber(page)}`
        const today = await browserToday(page)
        await voidPostedEntry(page)

        await openAuditLog(page)
        await chooseParamOption(page, 'users', { from: 'add-filter', labels: [TEST_USER_NAME] })
        await chooseParamOption(page, 'types', {
            from: 'add-filter',
            labels: ['Journal entry', 'Journal line'],
        })

        const debitLine = `1000:Business Checking debit ${amount}`
        const creditLine = `3000:Owner's Equity credit ${amount}`
        const posted = await waitForAuditRow(page, { record: entry, event: 'Posted' })
        const voided = await waitForAuditRow(page, { record: entry, event: 'Voided' })
        const draftAdded = await waitForAuditRow(page, {
            record: `Draft journal entry ${today}`,
            event: 'Added',
        })
        const lines = [
            await waitForAuditRow(page, { record: debitLine, event: 'Added' }),
            await waitForAuditRow(page, { record: creditLine, event: 'Added' }),
        ]
        for (const row of [posted, voided, draftAdded]) {
            expect(row.type, `${row.record} · ${row.event}`).toBe('Journal entry')
        }
        for (const row of lines) expect(row.type, row.record).toBe('Journal line')
        // Core keeps the User-only run's rows until the Record type run lands, so poll
        // until every row shown is mine and of the two types.
        await expect
            .poll(async () => {
                const all = await auditRows(page)
                return {
                    otherUsers: all.filter(row => row.user !== TEST_USER_NAME),
                    otherTypes: all.filter(
                        row => !['Journal entry', 'Journal line'].includes(row.type)
                    ),
                }
            })
            .toEqual({ otherUsers: [], otherTypes: [] })

        // Journal entry alone: the line rows go, the entry's rows stay.
        await chooseParamOption(page, 'types', { from: 'chip', labels: ['Journal line'] })
        const ids = (rows: AuditRowText[]) => rows.map(row => row.id)
        await expect
            .poll(async () => {
                const rows = await auditRows(page)
                return {
                    lineRows: rows.filter(row => row.type === 'Journal line').length,
                    entryRows: [posted.id, voided.id].every(id => ids(rows).includes(id)),
                }
            })
            .toEqual({ lineRows: 0, entryRows: true })

        // Today, in the reader's zone, keeps the entry's rows.
        await page.getByTestId('report-param-period').click()
        await page.getByTestId('report-period-preset-today').click()
        await expect(page.getByTestId('report-param-period')).toContainText('Today')
        await expect(page.getByTestId('report-document-period')).toHaveText(dayWords(today))
        await expect
            .poll(async () => {
                const rows = ids(await auditRows(page))
                return [draftAdded.id, posted.id, voided.id].every(id => rows.includes(id))
            })
            .toBe(true)
    })
})

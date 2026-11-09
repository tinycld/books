import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { ENTRIES_SEED } from '../../tinycld/books/lib/journal-entries-fixture'
import { openRegister, revealRegisterItem } from './account-register-helpers'
import { createCustomer, customerHelpers } from './customer-form-helpers'
import {
    ACCOUNT_LABELS,
    DESKTOP,
    fillLine,
    isPhone,
    openEntriesList,
    openNewEntry,
    PHONE,
    postOpenEntry,
    searchEntries,
} from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'
import { createVendor, vendorHelpers } from './vendor-form-helpers'

// The Name of a journal entry line: a customer or a vendor picked in the line's Name picker
// (two groups, active parties only), shown in the read view and the register's entry
// drawer, kept on the entry when the party becomes inactive, and a customer named on a line
// cannot be deleted. Every customer, vendor and entry here is made through the UI with a
// unique name; nothing seeded is changed.
//
// The phone run covers the code a phone draws differently: the line card's Name field
// (`EntryEditableLineCard`) and the read view's line card (`EntryLineCard`). The register
// drawer and the picker's load error run the same code at both sizes, so they run on desktop
// only.

const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

const CUSTOMER_RECORDS = '**/api/collections/books_customers/records*'
const LINE_RECORDS = '**/api/collections/books_journal_lines/records*'
const REALTIME = '**/api/realtime*'

const OPTION = 'entry-line-name-option'

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

// The vertical order of the elements with these test ids, read in one pass; null while
// one of them is not on screen.
function topsInOrder(page: Page, testIds: readonly string[]) {
    return page.evaluate(ids => {
        const tops = ids.map(id => {
            const el = document.querySelector(`[data-testid="${id}"]`)
            return el ? el.getBoundingClientRect().top : null
        })
        if (tops.some(top => top === null)) return null
        return tops.every((top, i) => i === 0 || (top as number) > (tops[i - 1] as number))
    }, testIds)
}

// Back to the Books Lists hub through the browser history (a same-document popstate). The
// hub's nav item pushes a second hub over a list, whose cards the first hub then hides, and a
// phone has no Lists nav item, so going back is the one way that leaves a single hub.
async function backToLists(page: Page) {
    const card = page.getByTestId('books-list-card-entries').filter({ visible: true })
    await expect(async () => {
        if (!(await card.isVisible())) await page.goBack()
        await expect(card).toBeVisible({ timeout: 1500 })
    }).toPass({ timeout: 15_000 })
}

async function makeVendorInactive(page: Page, name: string) {
    await backToLists(page)
    await vendorHelpers.openList(page)
    await vendorHelpers.search(page, name)
    const id = await vendorHelpers.idOf(page, name)
    await vendorHelpers.chooseFromMenu(page, id, 'toggle-inactive')
    await expect(vendorHelpers.entry(page, name)).toHaveCount(0)
}

// From anywhere in Books to the read view of the entry whose memo is `memo`.
async function openEntryByMemo(page: Page, memo: string) {
    await backToLists(page)
    await openEntriesList(page)
    await searchEntries(page, memo)
    const prefix = isPhone(page) ? 'entries-card-' : 'entries-row-'
    await page
        .locator(`[data-testid^="${prefix}"]:not([data-testid^="entries-row-menu-"])`)
        .filter({ hasText: memo })
        .first()
        .click()
    await expect(visible(page, 'entry-read-only')).toBeVisible()
}

test.describe('general-ledger: journal entry Name', () => {
    for (const [sizeName, size] of SIZES) {
        test(`picks a customer or a vendor on a line and keeps it (${sizeName})`, async ({
            page,
        }) => {
            await login(page)
            await navigateToPackage(page, 'books')
            await page.setViewportSize(size)
            const prefix = uniqueName(`Name ${sizeName}`)
            const nameA = `${prefix} A`
            const nameB = `${prefix} B`
            const nameV = `${prefix} V`
            const memo = `${prefix} entry`
            const editedMemo = `${prefix} edited`

            // Customers A and B and vendor V; B made inactive.
            await customerHelpers.openList(page)
            await createCustomer(page, { name: nameA })
            await createCustomer(page, { name: nameB })
            await customerHelpers.search(page, prefix)
            const aId = await customerHelpers.idOf(page, nameA)
            const bId = await customerHelpers.idOf(page, nameB)
            await customerHelpers.chooseFromMenu(page, bId, 'toggle-inactive')
            await expect(customerHelpers.entry(page, nameB)).toHaveCount(0)
            await backToLists(page)
            await vendorHelpers.openList(page)
            await createVendor(page, { name: nameV })
            await vendorHelpers.search(page, nameV)
            const vId = await vendorHelpers.idOf(page, nameV)

            // The Name picker lists A under Customers and V under Vendors, and not B.
            await backToLists(page)
            await openNewEntry(page)
            await page.getByTestId('entry-memo').fill(memo)
            await fillLine(page, 0, { account: ACCOUNT_LABELS.checking, debit: '10.00' })
            await page.getByTestId('entry-line-name-0').click()
            const search = page.locator('input:focus')
            await expect(search).toBeVisible()
            await search.fill(prefix)
            await expect(page.getByTestId(`${OPTION}-customer:${aId}`)).toHaveText(nameA)
            await expect(page.getByTestId(`${OPTION}-vendor:${vId}`)).toHaveText(nameV)
            await expect(page.getByTestId(`${OPTION}-customer:${bId}`)).toHaveCount(0)
            await expect
                .poll(() =>
                    topsInOrder(page, [
                        `${OPTION}-group-Customers`,
                        `${OPTION}-customer:${aId}`,
                        `${OPTION}-group-Vendors`,
                        `${OPTION}-vendor:${vId}`,
                    ])
                )
                .toBe(true)
            await page.getByTestId(`${OPTION}-customer:${aId}`).click()
            await expect(page.getByTestId('entry-line-name-0')).toContainText(nameA)
            await fillLine(page, 1, { account: ACCOUNT_LABELS.equity, credit: '10.00' })
            await postOpenEntry(page)
            await expect(visible(page, 'entry-line-party-0')).toHaveText(nameA)
            // Line 2 names no one: its Name node is there, empty (an empty node has no size,
            // so it is found inside the visible read view, not by its own visibility).
            const unnamed = visible(page, 'entry-read-only').getByTestId('entry-line-party-1')
            await expect(unnamed).toHaveCount(1)
            await expect(unnamed).toHaveText('')

            // Edit: V replaces A on line 1.
            await visible(page, 'entry-edit').click()
            await expect(visible(page, 'entry-line-name-0')).toContainText(nameA)
            await page.getByTestId('entry-memo').fill(editedMemo)
            await fillLine(page, 0, { name: nameV })
            await postOpenEntry(page)
            const party = visible(page, 'entry-line-party-0')
            await expect(party).toHaveText(nameV)
            await expect(party).not.toContainText(nameA)

            // V made inactive: the posted entry still names V.
            await makeVendorInactive(page, nameV)
            await openEntryByMemo(page, editedMemo)
            await expect(visible(page, 'entry-line-party-0')).toHaveText(nameV)

            // A is on journal lines, so its delete is refused and A stays.
            await backToLists(page)
            await customerHelpers.openList(page)
            await customerHelpers.search(page, nameA)
            const dialog = await customerHelpers.openDeleteDialog(page, aId)
            await dialog.confirm.click()
            await expect(dialog.body).toContainText(
                `${nameA} is on journal lines. Make it inactive instead.`
            )
            await dialog.close.click()
            await expect(dialog.root).toBeHidden()
            await expect(customerHelpers.entry(page, nameA)).toBeVisible()

            if (sizeName !== 'desktop') return

            // The register's entry drawer names V on the line.
            await openRegister(page, 'Business Checking')
            await page.getByTestId('register-range').click()
            await page.getByRole('menuitem', { name: 'This month', exact: true }).click()
            await expect(page.getByTestId('register-range')).toContainText('This month')
            const row = page
                .locator('[data-testid^="register-row-"]')
                .filter({ hasText: editedMemo })
            await revealRegisterItem(page, row)
            await row.click()
            const drawer = page.getByTestId('register-entry-drawer')
            await expect(drawer).toBeVisible()
            await expect(drawer.getByTestId('entry-line-party-0')).toHaveText(nameV)
            const drawerUnnamed = drawer.getByTestId('entry-line-party-1')
            await expect(drawerUnnamed).toHaveCount(1)
            await expect(drawerUnnamed).toHaveText('')
        })
    }

    test('the Name picker and the read view show a load error and recover on Retry (desktop)', async ({
        page,
    }) => {
        // Cut realtime before login, so rows other workers write do not arrive past the
        // faked read.
        await page.route(REALTIME, route => route.abort())
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        await page.route(CUSTOMER_RECORDS, route =>
            route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ code: 400, message: 'Load failed.', data: {} }),
            })
        )
        await openNewEntry(page)
        await page.getByTestId('entry-line-name-0').click()
        const retry = page.getByTestId(`${OPTION}-retry`)
        await expect(retry).toBeVisible()
        await expect(page.locator(`[data-testid^="${OPTION}-customer:"]`)).toHaveCount(0)

        await page.unrouteAll({ behavior: 'wait' })
        await page.getByRole('button', { name: 'Retry', exact: true }).click()
        await expect(retry).toHaveCount(0)
        await expect(page.getByTestId(`${OPTION}-group-Customers`)).toBeVisible()
        await expect(page.locator(`[data-testid^="${OPTION}-customer:"]`).first()).toBeVisible()

        // The read view's lines (with their Name) fail to load: the view says so, and Retry
        // loads them. Realtime is cut again first, for the same reason as above.
        await page.route(REALTIME, route => route.abort())
        await page.keyboard.press('Escape')
        await openEntriesList(page)
        await searchEntries(page, ENTRIES_SEED.posted)
        await page.route(LINE_RECORDS, route =>
            route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ code: 400, message: 'Load failed.', data: {} }),
            })
        )
        await page
            .locator('[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])')
            .filter({ hasText: ENTRIES_SEED.posted })
            .first()
            .click()
        const loadError = visible(page, 'entry-read-load-error')
        await expect(loadError).toBeVisible()
        await expect(page.getByTestId('entry-line-account-0')).toHaveCount(0)

        await page.unrouteAll({ behavior: 'wait' })
        await visible(page, 'entry-read-retry').click()
        await expect(page.getByTestId('entry-read-load-error')).toHaveCount(0)
        await expect(visible(page, 'entry-line-account-0')).toHaveText(ACCOUNT_LABELS.checking)
        await expect(visible(page, 'entry-line-account-1')).toHaveText(ACCOUNT_LABELS.equity)
    })
})

import type { Page } from '@playwright/test'
import { expect, login, navigateToPackage, test } from '@tinycld/core/e2e-helpers'
import { DESKTOP, PHONE } from './account-register-helpers'
import { setLevelOf } from './books-access-helpers'
import { ACCOUNT_LABELS } from './journal-entries-helpers'
import {
    newActionItem,
    newActionTestId,
    newSectionToggle,
    openNewAction,
    openNewMenu,
} from './new-menu-helpers'
import {
    addShortcut,
    cancelCustomize,
    closeSidebar,
    DEFAULT_SLUGS,
    dialogRow,
    expectShortcuts,
    openBooksAt,
    openCustomize,
    pressShortcut,
    saveShortcuts,
    showSidebar,
} from './sidebar-shortcuts-helpers'

// The Shortcuts and New sections of the Books sidebar (unit p1-sidebar-shortcuts), at the
// desktop width and at a phone width. On a phone the sidebar is the drawer, the Customize
// shortcuts dialog is a sheet, and the round New button opens the drawer: different code
// from the desktop path, so each flow runs at both widths.
//
// A user's shortcut list is one row of the database, and each user has their own. A test
// that writes the list takes core's `freshMember` fixture: a new member for that test only,
// signed in on its own page. So no two tests write the same list, the tests run on the
// normal parallel workers, and each starts from a user with no stored list (the defaults).
// A new member has the Books level Bookkeeper (core access "full"), and Books shares its
// shipped reports with each new user (server/report_shares.go). The reader test takes a
// `freshMember` too: the owner makes that member a reader, so the test changes no level
// that another test reads. The tests that sign in as the shared e2e user only read its
// list, which no test writes.
//
// Not covered by e2e:
// - the drag of a row (the same core SortableList as the dashboard's Edit mode, proven by
//   tests/e2e/dashboard.spec.ts; the Move up and Move down buttons write the same order);
// - the 30-shortcut limit, a refused write and a report or account that is gone (unit
//   tests of parts 1 and 2: useSidebarShortcuts, useCustomizeShortcuts, shortcut-rows).

const SIZES = [
    { name: 'desktop', size: DESKTOP },
    { name: 'phone', size: PHONE },
]

// One action of each New group, with the form it opens.
const NEW_GROUP_ACTIONS = [
    { group: 'customers', id: 'invoice', url: /\/a\/books\/invoices\/new/ },
    { group: 'vendors', id: 'bill', url: /\/a\/books\/bills\/new/ },
    { group: 'other', id: 'transfer', url: /\/a\/books\/transfers\/new/ },
]

// Seven screens and eighteen forms, added to the five defaults: the full list of 30
// (MAX_SHORTCUTS), a Shortcuts section taller than a phone.
const LONG_LIST_SCREENS = [
    'Dashboard',
    'Banking',
    'Sales',
    'Expenses',
    'Lists',
    'Chart of Accounts',
    'Reconcile',
]
const LONG_LIST_FORMS = [
    'Receive payment',
    'Pay bills',
    'New statement',
    'New customer',
    'New invoice',
    'New estimate',
    'New sales receipt',
    'New credit memo',
    'New refund receipt',
    'New vendor',
    'New bill',
    'New expense',
    'New vendor credit',
    'New vendor refund',
    'New journal entry',
    'New transfer',
    'New bank deposit',
    'New product or service',
]

async function backToDashboard(page: Page) {
    await page.goBack()
    await expect(page).toHaveURL(/\/a\/books\/dashboard/)
    await page.getByTestId('dashboard-screen').filter({ visible: true }).waitFor()
}

test.describe('sidebar-shortcuts: the Shortcuts section', () => {
    for (const { name, size } of SIZES) {
        test(`${name}: defaults, add one of each kind and open it, remove, reorder, and the list stays after a reload`, async ({
            freshMember,
        }) => {
            const { page } = freshMember
            await openBooksAt(page, size)
            // A user with no stored list has the defaults.
            await expectShortcuts(page, DEFAULT_SLUGS)

            // Add a screen, a form, a report and an account register.
            await openCustomize(page)
            const banking = await addShortcut(page, 'screen', 'Banking')
            const invoice = await addShortcut(page, 'new', 'New invoice')
            const trialBalance = await addShortcut(page, 'report', 'Trial Balance')
            const register = await addShortcut(page, 'register', ACCOUNT_LABELS.checking)
            expect([banking, invoice, trialBalance]).toEqual([
                'screen-banking',
                'new-invoice',
                'report-books-trial-balance',
            ])
            await saveShortcuts(page)
            const added = [...DEFAULT_SLUGS, banking, invoice, trialBalance, register]
            await expectShortcuts(page, added)

            // Each kind opens its target.
            await pressShortcut(page, banking)
            await expect(page).toHaveURL(/\/a\/books\/banking/)
            await pressShortcut(page, trialBalance)
            await expect(page).toHaveURL(/\/a\/books\/reports\/[a-z0-9]{15}(\?|$)/)
            await expect(page.getByTestId('report-title').filter({ visible: true })).toHaveText(
                'Trial Balance'
            )
            await pressShortcut(page, register)
            await expect(page).toHaveURL(/\/a\/books\/accounts\/[a-z0-9]{15}(\?|$)/)
            await pressShortcut(page, invoice)
            await expect(page).toHaveURL(/\/a\/books\/invoices\/new/)
            await page.goBack()
            await expect(page).toHaveURL(/\/a\/books\/accounts\/[a-z0-9]{15}(\?|$)/)

            // Remove Vendors, move Products to the top and Banking one place down.
            await openCustomize(page)
            await dialogRow(page, 'screen-vendors')
                .getByTestId(/-remove$/)
                .click()
            await expect(dialogRow(page, 'screen-vendors')).toHaveCount(0)
            await dialogRow(page, 'screen-products').getByTestId(/-up$/).click()
            await dialogRow(page, banking)
                .getByTestId(/-down$/)
                .click()
            await saveShortcuts(page)
            const changed = [
                'screen-products',
                'screen-customers',
                'report-books-profit-and-loss',
                'report-books-balance-sheet',
                invoice,
                banking,
                trialBalance,
                register,
            ]
            await expectShortcuts(page, changed)

            // The list is stored for the user: a reload shows the same list.
            const urlBefore = page.url()
            await page.reload()
            await expect(page).toHaveURL(urlBefore)
            await expectShortcuts(page, changed)

            // Reset to defaults puts the default list back.
            await openCustomize(page)
            await page.getByTestId('books-shortcuts-reset').click()
            await saveShortcuts(page)
            await expectShortcuts(page, DEFAULT_SLUGS)
        })
    }
})

test.describe('sidebar-shortcuts: the New section', () => {
    for (const { name, size } of SIZES) {
        test(`${name}: an action of each group opens its form`, async ({ page }) => {
            await login(page)
            await openBooksAt(page, size)
            for (const action of NEW_GROUP_ACTIONS) {
                await openNewMenu(page)
                await expect(
                    page
                        .getByTestId(`books-sidebar-new-group-${action.group}`)
                        .filter({ visible: true })
                        .getByTestId(newActionTestId(action.id))
                ).toBeVisible()
                await newActionItem(page, action.id).click()
                await expect(page).toHaveURL(action.url)
                await backToDashboard(page)
            }
        })
    }

    // A sidebar row closes the drawer at once and leaves no timer (core SidebarItem, core
    // task 12c). So the round New button opens the section again directly after an action,
    // and the next action opens its form. This is the end-to-end flow only: goBack and the
    // URL wait lie between the press and the next press, so it cannot catch a timer that is
    // shorter than they are. Core's sidebar-item-drawer unit test holds that timer check.
    test('phone: the round New button opens the section again right after an action', async ({
        page,
    }) => {
        await login(page)
        await openBooksAt(page, PHONE)
        await openNewAction(page, 'invoice')
        await expect(page).toHaveURL(/\/a\/books\/invoices\/new/)
        await backToDashboard(page)

        await openNewMenu(page)
        await newActionItem(page, 'transfer').click()
        await expect(page).toHaveURL(/\/a\/books\/transfers\/new/)
    })

    // With 30 shortcuts the Shortcuts section is taller than a phone. The round New button
    // must still show the New actions without a scroll. A click scrolls its target into view,
    // so the checks read the viewport and press nothing in the section.
    test('phone: with a long Shortcuts list, the round New button shows the New actions', async ({
        freshMember,
    }) => {
        const { page } = freshMember
        await openBooksAt(page, PHONE)
        await openCustomize(page)
        const added: string[] = []
        for (const label of LONG_LIST_SCREENS) {
            added.push(await addShortcut(page, 'screen', label))
        }
        for (const label of LONG_LIST_FORMS) added.push(await addShortcut(page, 'new', label))
        await saveShortcuts(page)
        await expectShortcuts(page, [...DEFAULT_SLUGS, ...added])
        // The list is long enough: at the top of the drawer, New is below the screen.
        await expect(newSectionToggle(page)).not.toBeInViewport()
        await closeSidebar(page)
        await expectNewActionsShown(page)
    })
})

// Presses the round New button and expects the open New section on screen, without a
// scroll: its heading and the first action.
async function expectNewActionsShown(page: Page) {
    await page.getByLabel('New', { exact: true }).click()
    const panel = page.getByTestId('mobile-drawer-panel')
    await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0)
    await expect(newSectionToggle(page)).toHaveAttribute('aria-label', 'Collapse New')
    await expect(newSectionToggle(page)).toBeInViewport()
    await expect(newActionItem(page, 'customer')).toBeInViewport()
}

// The owner makes this test's own member a reader. The member's page may already have read
// the old level (after sign-in the app lands on the first installed package, which is Books
// when Books is the only one, as in the Books CI); the level is live, so it follows.
async function readerView(
    page: Page,
    freshMember: { user: { email: string }; page: Page },
    size: { width: number; height: number }
) {
    await login(page)
    await navigateToPackage(page, 'books')
    await setLevelOf(page, freshMember.user.email, 'read_only')
    await openBooksAt(freshMember.page, size)
    return freshMember.page
}

// Add shortcut offers a reader screens, and no form. The picker shows "Loading…" until the
// person's Books level has loaded (until then the level reads as none, whatever it is), so
// the screen option and the empty row below prove the level is loaded and is not a writer's.
// The checks after this call (no New section, no round New button) rest on that proof: the
// level is one read that every Books part shares.
async function expectReaderPicker(view: Page) {
    await openCustomize(view)
    await view.getByTestId('books-shortcuts-add').filter({ visible: true }).click()
    const search = view.getByTestId('books-shortcuts-add-search')
    await search.fill('Banking')
    await expect(view.getByTestId('books-shortcuts-add-option-screen:banking')).toBeVisible()
    await search.fill('New invoice')
    await expect(view.getByTestId('books-shortcuts-add-option-empty')).toBeVisible()
    await expect(view.locator('[data-testid^="books-shortcuts-add-option-new:"]')).toHaveCount(0)
    await view.keyboard.press('Escape')
    await expect(search).toHaveCount(0)
    await cancelCustomize(view)
}

test.describe('sidebar-shortcuts: reader', () => {
    test.use({ viewport: DESKTOP })

    test('desktop: a reader has no New section and no form to add', async ({
        page,
        freshMember,
    }) => {
        const view = await readerView(page, freshMember, DESKTOP)
        await expect(view.getByTestId('books-shortcuts-customize')).toBeVisible()
        await expectReaderPicker(view)
        await expect(view.getByTestId('books-sidebar-new-toggle')).toHaveCount(0)
    })

    // The phone layout is proven by the drawer (showSidebar waits for its panel), then the
    // level by the picker; only then is the missing round New button a statement about the level.
    test('phone: a reader has no round New button and the drawer holds no New section', async ({
        page,
        freshMember,
    }) => {
        const view = await readerView(page, freshMember, PHONE)
        await showSidebar(view)
        await expectReaderPicker(view)
        await expect(view.getByLabel('New', { exact: true })).toHaveCount(0)
        await showSidebar(view)
        const panel = view.getByTestId('mobile-drawer-panel')
        await expect(panel.getByTestId('books-shortcuts-customize')).toBeVisible()
        await expect(panel.getByTestId('books-sidebar-new-toggle')).toHaveCount(0)
    })

    // A member who has Books open sees a level change at once: the server signals the
    // books_access view when core access changes, and the page reads the level again. The
    // marker on window proves the page did not load again. The round New button reads the
    // same level as the desktop New section, so the phone path adds nothing here.
    test('desktop: a level change reaches an open Books page with no reload', async ({
        page,
        freshMember,
    }) => {
        const view = freshMember.page
        await openBooksAt(view, DESKTOP)
        await expect(view.getByTestId('books-sidebar-new-toggle')).toBeVisible()
        await view.evaluate(() => {
            Object.assign(window, { booksNoReload: true })
        })
        const notReloaded = () => view.evaluate(() => 'booksNoReload' in window)

        await login(page)
        await navigateToPackage(page, 'books')
        await setLevelOf(page, freshMember.user.email, 'read_only')
        await expect(view.getByTestId('books-sidebar-new-toggle')).toHaveCount(0)
        await expectReaderPicker(view)
        expect(await notReloaded()).toBe(true)

        await setLevelOf(page, freshMember.user.email, 'bookkeeper')
        await expect(view.getByTestId('books-sidebar-new-toggle')).toBeVisible()
        expect(await notReloaded()).toBe(true)
    })
})

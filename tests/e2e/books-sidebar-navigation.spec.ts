import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP, openEntriesList, settleFrames } from './journal-entries-helpers'

// Guards the Books sidebar's navigation semantics. The sidebar items call
// router.dismissTo (react-navigation StackRouter "POP_TO"): it returns to the section
// when the section is already in the stack, and otherwise replaces the top screen. So a
// section never stacks a second copy of itself, whether it is on top (pressing "Journal
// Entries" on the list) or further down (Chart → Entries → Chart). router.navigate only
// reused a same-named route on top of the stack, which stacked a second Chart in the
// second case. An expo-router upgrade that changes POP_TO fails this spec.
//
// Driven through the UI only (login, navigateToPackage, the sidebar item). The sidebar
// item exists on desktop only. The phone route (the Lists hub card) is covered by
// openEntriesList in the journal-entries phone specs.

async function pressSection(page: Page, id: 'accounts' | 'entries') {
    const item = page.getByTestId(`books-nav-${id}`)
    const toggle = page.getByTestId('books-nav-accounting-toggle')
    await expect(toggle).toBeVisible()
    if (!(await item.isVisible())) await toggle.click()
    await item.click()
    await settleFrames(page)
}

test.describe('books-sidebar-navigation: a sidebar section never stacks a second copy (desktop)', () => {
    test('pressing it with the list on top keeps one list, and back leaves the list', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        await openEntriesList(page)
        const entries = page.getByTestId('entries-screen')
        await expect(entries).toHaveCount(1)

        await page.getByTestId('books-nav-entries').click()
        await settleFrames(page)
        await expect(entries).toHaveCount(1)

        await page.getByTestId('books-nav-entries').click()
        await settleFrames(page)
        await expect(entries).toHaveCount(1)

        await page.goBack()
        await expect(entries).toHaveCount(0)
    })

    test('moving between sections keeps one screen of each and does not grow the stack', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        await openEntriesList(page)
        const chart = page.getByTestId('account-search')
        const entries = page.getByTestId('entries-screen')

        await pressSection(page, 'accounts')
        await expect(chart).toHaveCount(1)
        await expect(entries).toHaveCount(0)

        await pressSection(page, 'entries')
        await expect(entries).toHaveCount(1)
        await expect(chart).toHaveCount(0)

        await pressSection(page, 'accounts')
        await expect(chart).toHaveCount(1)
        await expect(entries).toHaveCount(0)
    })
})

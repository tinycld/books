import { expect, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP, openEntriesList, settleFrames } from './journal-entries-helpers'

// Guards the Books sidebar's navigation semantics. The sidebar items call
// router.navigate. In expo-router 57.0.25 NAVIGATE reuses a same-named route that is
// already on top of the stack, while PUSH always appends one (react-navigation
// StackRouter, "NAVIGATE" and "PUSH" cases), so pressing "Journal Entries" with the
// entries list already showing keeps exactly one entries-screen. An expo-router
// upgrade can change this: expo/expo issue 35212 describes the v4 behaviour where
// navigate acted as push, and that would stack a second list under the first on every
// sidebar press. This spec fails if that happens.
//
// Driven through the UI only (login, navigateToPackage, the sidebar item). The sidebar
// item exists on desktop only. The phone route (the Lists hub card) is covered by
// openEntriesList in the journal-entries phone specs.

test.describe('books-sidebar-navigation: the sidebar entries item never stacks a second list (desktop)', () => {
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
})

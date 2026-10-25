import { expect, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP, openEntriesList, PHONE, settleFrames } from './journal-entries-helpers'

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
// item exists on desktop; a phone has no sidebar, so the phone case checks the Lists
// hub card, the phone route to the same list.

test.describe('books: the sidebar entries item never stacks a second list (desktop)', () => {
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

test.describe('books: the phone route to the entries list opens one list (phone)', () => {
    test('there is no sidebar item and the Lists hub card opens exactly one list', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(PHONE)
        await expect(page.getByTestId('books-nav-entries')).toHaveCount(0)

        await openEntriesList(page)
        await settleFrames(page)
        await expect(page.getByTestId('entries-screen')).toHaveCount(1)
    })
})

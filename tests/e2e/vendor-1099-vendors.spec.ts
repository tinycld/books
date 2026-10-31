import { expect, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { boxOf } from './record-form-helpers'
import {
    besideCentered,
    createTrackedVendor,
    fakeEmptyList,
    openForm1099,
    trackedVendorsSnapshot,
    visible,
} from './vendor-1099-helpers'
import { DESKTOP, openBooksPage, PHONE, uniqueName } from './vendor-form-helpers'

// Settings → 1099s, the 1099 vendors card.
//
// Tracked vendors are created through the vendor form with a unique name; seeded vendors
// (Keystone Legal Group, Jamal Okafor, Old Town Print Shop) are only read. Other specs
// track vendors too, so the count line and the order are read in one snapshot and checked
// for consistency, never against a fixed list.

const VENDOR_ROWS = '[data-testid^="books-1099-vendor-row-"]'

function byLowerName(a: string, b: string): number {
    const left = a.toLowerCase()
    const right = b.toLowerCase()
    if (left < right) return -1
    if (left > right) return 1
    return 0
}

test.describe('vendor-1099: 1099 vendors', () => {
    for (const [label, size] of [
        ['desktop', DESKTOP],
        ['phone', PHONE],
    ] as const) {
        test(`lists a tracked vendor with its tax ID status and opens it (${label})`, async ({
            page,
        }) => {
            await login(page)
            await navigateToPackage(page, 'books')
            const name = uniqueName(page, `Tracked card ${label}`)
            const id = await createTrackedVendor(page, { name })
            await openForm1099(page)
            await page.setViewportSize(size)

            const row = visible(page, `books-1099-vendor-row-${id}`)
            await expect(row).toContainText(name)
            await expect(visible(page, `books-1099-vendor-missing-${id}`)).toHaveText(
                'Missing tax ID'
            )
            await expect(visible(page, 'books-1099-vendor-last-four-vendkeystonel01')).toHaveText(
                '•••2741'
            )
            await expect(visible(page, 'books-1099-vendor-row-vendokaforjam01')).toContainText(
                'Jamal A. Okafor'
            )
            await expect(visible(page, 'books-1099-vendor-row-vendoldtownpr01')).toContainText(
                'Inactive'
            )
            if (label === 'phone') {
                await expect
                    .poll(() =>
                        besideCentered(
                            visible(page, `books-1099-vendor-name-${id}`),
                            visible(page, `books-1099-vendor-missing-${id}`)
                        )
                    )
                    .toBe(true)
            }

            const snap = await trackedVendorsSnapshot(page)
            expect(snap.names).toEqual([...snap.names].sort(byLowerName))
            expect(snap.ids).toContain(id)
            expect(snap.summary).toBe(
                `${snap.names.length} vendors tracked · ${snap.missing} missing a tax ID`
            )

            if (label === 'phone') {
                // The New FAB floats over the scroller; the clearance keeps the last row
                // above it once the scroller is at its end.
                const scroller = visible(page, 'books-settings-scroll')
                const lastRow = visible(page, 'books-1099-vendors').locator(VENDOR_ROWS).last()
                // Core's FAB has no button role.
                const fab = page.getByLabel('New', { exact: true })
                await expect
                    .poll(async () => {
                        await scroller.evaluate(el => {
                            el.scrollTop = el.scrollHeight
                        })
                        const [rowBox, fabBox] = await Promise.all([boxOf(lastRow), boxOf(fab)])
                        if (!rowBox || !fabBox) return false
                        return rowBox.y + rowBox.height <= fabBox.y
                    })
                    .toBe(true)
            }

            await row.click()
            await expect(page).toHaveURL(new RegExp(`/books/vendors/${id}$`))
            await expect(visible(page, 'vendor-page')).toBeVisible()
            await expect(visible(page, 'vendor-title')).toHaveText('Edit vendor')

            await visible(page, 'vendor-back').click()
            await expect(visible(page, 'vendors-list')).toBeVisible()
            await expect(page).toHaveURL(/\/books\/vendors$/)
        })
    }

    test('an empty vendors card opens the Vendors list', async ({ page }) => {
        const fresh = await openBooksPage(page, DESKTOP, p => fakeEmptyList(p, 'books_vendors'))
        await openForm1099(fresh)

        const empty = visible(fresh, 'books-1099-vendors-empty')
        await expect(empty).toContainText('No vendors are tracked for 1099 yet.')
        await expect(empty).toContainText('Turn on Track payments for 1099 on a vendor.')
        await expect(fresh.getByTestId('books-1099-vendors-summary')).toHaveCount(0)

        // The three cards' order, read in one snapshot of the section's text.
        const order = await visible(fresh, 'books-1099-section').evaluate(el => {
            const text = el.textContent ?? ''
            return ['Reporting threshold', 'Accounts reported on 1099s', '1099 vendors'].map(
                title => text.indexOf(title)
            )
        })
        expect(order.every(at => at >= 0)).toBe(true)
        expect(order).toEqual([...order].sort((a, b) => a - b))

        await visible(fresh, 'books-1099-vendors-open').click()
        await expect(visible(fresh, 'vendors-list')).toBeVisible()
        await expect(fresh).toHaveURL(/\/books\/vendors$/)
    })
})

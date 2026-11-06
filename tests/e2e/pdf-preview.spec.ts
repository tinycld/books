import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'

// Preview PDF downloads a sample invoice rendered by the server with the saved
// company details and the organization branding. The download is checked as a
// file (magic bytes, page count); its printed content is pinned by the Go tests
// (server/pdf_render_test.go). Desktop only: the button is the same component
// in the phone layout's pushed Company page, and the phone path runs no other
// code. The native share-sheet path cannot run in a browser. The read-only member's
// preview is in books-settings.spec.ts ('pdf-preview: a read-only member'): it changes
// the shared collaborator's access level, which only that file does.

// A screen covered in the navigation stack stays mounted but hidden, so only the visible match counts.
function id(page: Page, testId: string) {
    return page.locator(`[data-testid="${testId}"]:visible`)
}

// At desktop width the Settings index shows the Company section in place.
async function openCompanySettings(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await id(page, 'books-nav-settings').click()
    await expect(id(page, 'books-settings')).toBeVisible()
    await expect(id(page, 'books-settings-preview-pdf')).toBeVisible()
}

// Read-only page count: omnidoc writes the page tree uncompressed, so the page
// objects and the tree's /Count can be read from the bytes.
function pageCounts(pdf: Buffer) {
    const text = pdf.toString('latin1')
    const pageObjects = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0
    const declared = Number(/\/Count\s+(\d+)/.exec(text)?.[1] ?? -1)
    return { pageObjects, declared }
}

test.describe('pdf-preview:', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test('Preview PDF downloads the sample invoice as a one-page PDF', async ({ page }) => {
        await openCompanySettings(page)
        const download = page.waitForEvent('download')
        await id(page, 'books-settings-preview-pdf').click()
        const file = await download

        expect(file.suggestedFilename()).toBe('sample-invoice.pdf')
        const pdf = await readFile(await file.path())
        expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
        expect(pageCounts(pdf)).toEqual({ pageObjects: 1, declared: 1 })
        await expect(id(page, 'books-settings-preview-pdf')).toBeEnabled()
    })

    test('a refused download says why and leaves the button ready', async ({ page }) => {
        await openCompanySettings(page)
        await page.route('**/api/books/pdf/sample', route =>
            route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({
                    status: 403,
                    message: 'You do not have access to Books.',
                    data: {},
                }),
            })
        )
        await id(page, 'books-settings-preview-pdf').click()
        await expect(page.getByText('Could not create the PDF', { exact: true })).toBeVisible()
        await expect(
            page.getByText('You do not have access to Books.', { exact: true })
        ).toBeVisible()
        await expect(id(page, 'books-settings-preview-pdf')).toBeEnabled()
        await page.unrouteAll({ behavior: 'wait' })
    })
})

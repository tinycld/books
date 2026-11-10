import { expect, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { openNewInvoice, pickInvoiceCustomer, pickLineProduct, uniqueMemo } from './invoice-helpers'

// The PDF view tab (spec §3.7): what it shows before the first save, after a refused
// fetch and its Retry, and with unsaved edits; and ⌘P's download name. The printed
// content is pinned by the Go tests (server/pdf_invoice_test.go). Desktop only: the
// tabs and the viewer are the same components in the phone layout.

function seededNames() {
    const customer = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.harborview)
    const product = PRODUCTS.find(p => p.id === PRODUCT_IDS.accessPoint)
    if (!customer || !product)
        throw new Error('no Harborview or Wireless access point in the fixtures')
    return { customer: customer.display_name, product: product.name }
}

// A saved draft's PDF tab: `books/invoices/<id>?tab=pdf`.
const DRAFT_PDF_URL = /\/books\/invoices\/(?!new[?#/]|new$)[^/?#]+\?tab=pdf$/

test.describe('invoice-form: pdf', () => {
    test('the PDF tab shows the saved invoice', async ({ page }) => {
        const names = seededNames()
        await login(page)
        await navigateToPackage(page, 'books')
        await openNewInvoice(page)
        await pickInvoiceCustomer(page, names.customer)
        await pickLineProduct(page, 0, names.product)
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Invoice PDF'))

        await page.keyboard.press('Alt+2')
        await expect(page.getByTestId('invoice-tab-pdf')).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByTestId('invoice-tab-edit')).not.toHaveAttribute(
            'aria-selected',
            'true'
        )
        const unsaved = page.getByTestId('invoice-pdf-unsaved')
        await expect(unsaved).toContainText('Save a draft to see the PDF')

        await page.route('**/api/books/pdf/invoice/*', route =>
            route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'x' }),
            })
        )
        await unsaved.getByRole('button', { name: 'Save draft' }).click()
        await expect(page).toHaveURL(DRAFT_PDF_URL)
        await expect(page.getByTestId('invoice-pdf-error')).toBeVisible()

        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('invoice-pdf-retry').click()
        const canvas = page.getByTestId('invoice-pdf').locator('canvas').first()
        await expect(canvas).toBeVisible()
        await expect
            .poll(async () => {
                const box = await canvas.boundingBox()
                return Math.min(box?.width ?? 0, box?.height ?? 0)
            })
            .toBeGreaterThan(100)

        await page.keyboard.press('Alt+1')
        await expect(page.getByTestId('invoice-tab-edit')).toHaveAttribute('aria-selected', 'true')
        const memo = page.getByTestId('form-input-memo')
        await expect(memo).toBeVisible()
        await memo.fill(uniqueMemo('Invoice PDF edited'))

        await page.keyboard.press('Alt+2')
        await expect(page.getByTestId('invoice-tab-pdf')).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByTestId('invoice-pdf-stale')).toHaveText(
            'Shows the last saved version'
        )

        const download = page.waitForEvent('download')
        await page.keyboard.press('ControlOrMeta+p')
        expect((await download).suggestedFilename()).toBe('draft-invoice.pdf')
    })
})

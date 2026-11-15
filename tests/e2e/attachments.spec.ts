import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    attachmentRow,
    attachmentsSection,
    expectAttachmentNames,
    openSeededBill1002,
} from './attachments-helpers'
import { fakeReadOnlyAccess } from './banking-helpers'
import { searchToBill } from './bill-helpers'
import { searchToExpense } from './expense-helpers'
import { DESKTOP, openInvoiceBySearch } from './invoice-helpers'

// Attachments spec §3.3, §3.4, §3.5, plan checkpoint 2. Every test reads the seeded
// documents only (bill 1002 and 1003, expense 1003, invoice 1003): none adds, removes,
// edits, voids or copies there.

const BILL_PDF = 'OSW-invoice-1002.pdf'
const BILL_PNG = 'packing-slip-photo.png'
const EXPENSE_JPG = 'receipt-office-supply-world.jpg'
// The memo the e2e seed writes on the posted invoice INVOICE_IDS.posted (seed.ts,
// seedInvoiceMemo); the server numbers it 1003, the third of INVOICE_SEED_IDS.
const SEEDED_INVOICE_MEMO = 'Seed invoice posted'

const ATTACHMENTS_LIST = '**/api/collections/books_attachments/records*'

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

function previewModal(page: Page): Locator {
    return page.getByTestId('file-preview-modal')
}

function previewButton(page: Page, name: string): Locator {
    return previewModal(page).getByRole('button', { name, exact: true })
}

test.describe('attachments: read view', () => {
    test('lists, previews and downloads the files of a posted bill', async ({ page }) => {
        await openBooks(page)
        await openSeededBill1002(page)

        const section = attachmentsSection(page, 'bill')
        await expect(page.getByTestId('bill-attachments-heading')).toHaveText('Attachments (2)')
        await expect(section.getByText('Up to 20 MB each', { exact: true })).toBeVisible()
        // The W-9 of the custom File field is not a section row.
        await expectAttachmentNames(page, 'bill', [BILL_PDF, BILL_PNG])

        // An image row draws core Thumbnail through an authed 40 px thumb URL.
        const thumb = attachmentRow(page, 'bill', BILL_PNG).locator('img')
        await expect(thumb).toHaveAttribute('src', /token=/)
        await expect(thumb).toHaveAttribute('src', /thumb=40x40/)
        await expect
            .poll(() => thumb.evaluate(img => (img as HTMLImageElement).naturalWidth))
            .toBeGreaterThan(0)

        const pdfRow = attachmentRow(page, 'bill', BILL_PDF)
        await expect(pdfRow.getByText(/^[\d.]+ (KB|B) · .+, [A-Z][a-z]{2} \d{1,2}$/)).toBeVisible()

        // Wide: the section sits in the notes column, under Memo.
        const memo = page.getByTestId('bill-detail-memo')
        await expect
            .poll(async () => {
                const memoBox = await memo.boundingBox()
                const sectionBox = await section.boundingBox()
                if (!memoBox || !sectionBox) return null
                return {
                    isBelow: sectionBox.y >= memoBox.y + memoBox.height,
                    leftGap: Math.round(Math.abs(sectionBox.x - memoBox.x)),
                }
            })
            .toEqual({ isBelow: true, leftGap: 0 })

        await pdfRow.click()
        const modal = previewModal(page)
        await expect(modal).toBeVisible()
        await expect(modal).toContainText(BILL_PDF)

        await previewButton(page, 'Next file').click()
        await expect(modal).toContainText(BILL_PNG)
        await previewButton(page, 'Previous file').click()
        await expect(modal).toContainText(BILL_PDF)

        const [download] = await Promise.all([
            page.waitForEvent('download'),
            previewButton(page, 'Download').click(),
        ])
        expect(download.url()).toContain('download=1')
        expect(download.url()).toContain('token=')
        // PocketBase's Content-Disposition names the stored file.
        expect(download.suggestedFilename()).toMatch(/^osw.invoice.1002.*\.pdf$/i)

        await page.keyboard.press('Escape')
        await expect(modal).not.toBeVisible()

        await pdfRow.click()
        await expect(modal).toBeVisible()
        await previewButton(page, 'Close preview').click()
        await expect(modal).not.toBeVisible()

        // Invoices keep no files.
        await openInvoiceBySearch(page, SEEDED_INVOICE_MEMO)
        await expect(page.getByTestId('invoice-read-only').filter({ visible: true })).toBeVisible()
        await expect(page.getByTestId('invoice-attachments')).toHaveCount(0)
    })
})

test.describe('attachments: reader', () => {
    test('a reader lists and opens files and sees when there are none', async ({ page }) => {
        await fakeReadOnlyAccess(page)
        await openBooks(page)

        await searchToExpense(page, '1003', 'Expense 1003 · Office Supply World')
        await expect(page.getByTestId('expense-read-only').filter({ visible: true })).toBeVisible()
        const section = attachmentsSection(page, 'expense')
        await expectAttachmentNames(page, 'expense', [EXPENSE_JPG])
        await expect(section.getByRole('button', { name: `Remove ${EXPENSE_JPG}` })).toHaveCount(0)
        await expect(page.getByTestId('expense-attachments-add')).toHaveCount(0)

        await attachmentRow(page, 'expense', EXPENSE_JPG).click()
        const modal = previewModal(page)
        await expect(modal).toBeVisible()
        await expect(modal).toContainText(EXPENSE_JPG)
        await previewButton(page, 'Close preview').click()
        await expect(modal).not.toBeVisible()

        await searchToBill(page, '1003', 'Bill 1003 · Summit IT Services')
        await expect(page.getByTestId('bill-read-only').filter({ visible: true })).toBeVisible()
        await expect(page.getByTestId('bill-attachments-empty')).toHaveText('No attachments')
    })
})

test.describe('attachments: loading and load error', () => {
    test('a failed attachment load shows Retry and keeps the bill', async ({ page }) => {
        await openBooks(page)

        let answer: () => void = () => {}
        const answered = new Promise<void>(resolve => {
            answer = resolve
        })
        await page.route(ATTACHMENTS_LIST, async route => {
            if (route.request().method() !== 'GET') return route.fallback()
            await answered
            await route.fulfill({ status: 400 })
        })

        await openSeededBill1002(page)
        const loading = page.getByTestId('bill-attachments-loading')
        await expect(loading).toHaveCount(1)
        await expect(loading).toBeVisible()
        await expect
            .poll(async () => (await loading.boundingBox())?.height ?? 0)
            .toBeGreaterThanOrEqual(44)

        answer()
        await expect(page.getByTestId('bill-attachments-error')).toContainText(
            'Attachments could not be loaded.'
        )
        const readView = page.getByTestId('bill-read-only').filter({ visible: true })
        await expect(readView).toContainText('Toner, paper and desk supplies for the quarter')
        await expect(page.getByTestId('bill-total').filter({ visible: true })).toBeVisible()

        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('bill-attachments-retry').click()
        await expectAttachmentNames(page, 'bill', [BILL_PDF, BILL_PNG])
    })
})

import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    attachFiles,
    attachmentNames,
    attachmentRow,
    attachmentsSection,
    attachmentTransfer,
    dropAttachments,
    expectAttachmentNames,
    newPostedBill,
    newPostedExpense,
    openSeededBill1002,
    reopenPostedBill,
    testFile,
} from './attachments-helpers'
import { fakeReadOnlyAccess } from './banking-helpers'
import { searchToBill } from './bill-helpers'
import { searchToExpense } from './expense-helpers'
import { DESKTOP, openInvoiceBySearch, uniqueMemo } from './invoice-helpers'
import { isDisabled } from './record-form-helpers'

// Attachments spec §3.3, §3.4, §3.5, plan checkpoint 2. Every test reads the seeded
// documents only (bill 1002 and 1003, expense 1002 and 1003, invoice 1003): none adds, removes,
// edits, voids or copies there.

const BILL_PDF = 'OSW-invoice-1002.pdf'
const BILL_PNG = 'packing-slip-photo.png'
const EXPENSE_JPG = 'receipt-office-supply-world.jpg'
// The seeded HEIC photo on posted expense 1002 (fixture ATTACHMENT_IDS.expenseHeic).
const EXPENSE_HEIC = 'pacific-power-meter.heic'
const SEEDED_EXPENSE_1002_TITLE = 'Expense 1002 · Pacific Power'
const LIMIT_TEXT = 'Up to 20 MB each'
// The memo the e2e seed writes on the posted invoice INVOICE_IDS.posted (seed.ts,
// seedInvoiceMemo); the server numbers it 1003, the third of INVOICE_SEED_IDS.
const SEEDED_INVOICE_MEMO = 'Seed invoice posted'

const ATTACHMENTS_LIST = '**/api/collections/books_attachments/records*'
const PHONE = { width: 390, height: 844 }
const FULL_AREA_MIN = 92
const FULL_AREA_MAX = 130
const QUOTA_REFUSAL =
    'Organization storage limit exceeded: 10.0 GB used of 10.0 GB limit, 0 B available but 60.0 KB requested.'
// A stored row's detail: "<size> · <uploader>, <Mon D>".
const STORED_DETAIL = /^[\d.]+ (KB|B) · .+, [A-Z][a-z]{2} \d{1,2}$/

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
        // A writer on a posted bill can add a file, so the limit text shows.
        await expect(section.getByText(LIMIT_TEXT, { exact: true })).toBeVisible()
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
        // A reader cannot add a file, so the limit text does not show.
        await expect(section.getByText(LIMIT_TEXT, { exact: true })).toHaveCount(0)

        await attachmentRow(page, 'expense', EXPENSE_JPG).click()
        const modal = previewModal(page)
        await expect(modal).toBeVisible()
        await expect(modal).toContainText(EXPENSE_JPG)
        await previewButton(page, 'Close preview').click()
        await expect(modal).not.toBeVisible()

        await searchToBill(page, '1003', 'Bill 1003 · Summit IT Services')
        await expect(page.getByTestId('bill-read-only').filter({ visible: true })).toBeVisible()
        await expect(page.getByTestId('bill-attachments-empty')).toHaveText('No attachments')
        await expect(
            attachmentsSection(page, 'bill').getByText(LIMIT_TEXT, { exact: true })
        ).toHaveCount(0)
    })
})

test.describe('attachments: generated thumbnail', () => {
    test("a HEIC photo's row draws the thumbnail the server made", async ({ page }) => {
        await openBooks(page)
        await searchToExpense(page, '1002', SEEDED_EXPENSE_1002_TITLE)
        await expect(page.getByTestId('expense-read-only').filter({ visible: true })).toBeVisible()

        // The browser cannot draw a HEIC: the row's image is the generated JPEG,
        // thumbnailed again by PocketBase to 40 px, through an authed URL.
        const thumb = attachmentRow(page, 'expense', EXPENSE_HEIC).locator('img')
        await expect(thumb).toHaveAttribute('src', /\/api\/files\/[^/]+\/[^/]+\/[^/?]+\.jpg\?/)
        await expect(thumb).not.toHaveAttribute('src', /\.heic/i)
        await expect(thumb).toHaveAttribute('src', /token=/)
        await expect(thumb).toHaveAttribute('src', /thumb=40x40/)
        await expect
            .poll(() => thumb.evaluate(img => (img as HTMLImageElement).naturalWidth))
            .toBeGreaterThan(0)
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

// Checkpoint 3 (spec §3.1, §3.2, §3.3, §3.5, §3.7): a writer adds and removes files on the
// read view of a posted bill or expense the test makes; each file uploads at once.

function boxHeight(locator: Locator) {
    return locator.boundingBox().then(box => box?.height ?? 0)
}

function isUploadPost(url: string, method: string) {
    return (
        method === 'POST' && new URL(url).pathname === '/api/collections/books_attachments/records'
    )
}

test.describe('attachments: add and remove', () => {
    test('a writer attaches two files to a posted bill and removes one', async ({ page }) => {
        await openBooks(page)
        const memo = uniqueMemo('Attachments add')
        await newPostedBill(page, memo)

        // With no files, the full add area.
        const section = attachmentsSection(page, 'bill')
        const add = section.getByTestId('bill-attachments-add')
        await expect(add).toBeVisible()
        await expect.poll(() => boxHeight(add)).toBeGreaterThanOrEqual(FULL_AREA_MIN)
        await expect.poll(() => boxHeight(add)).toBeLessThanOrEqual(FULL_AREA_MAX)
        await expect(
            section.getByText('Drag files here or choose them', { exact: true })
        ).toBeVisible()

        // ⌥A opens the browser's file input from the read view's scope.
        const [chooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.keyboard.press('Alt+a'),
        ])
        await chooser.setFiles([testFile('receipt.pdf', 3 * 1024), testFile('photo.png', 2 * 1024)])

        // Each uploads at once and ends as a stored row.
        for (const name of ['receipt.pdf', 'photo.png']) {
            await expect(attachmentRow(page, 'bill', name).getByText(STORED_DETAIL)).toBeVisible()
        }
        await expect(section.getByText(/^Uploading…/)).toHaveCount(0)
        await expect(section.getByTestId('bill-attachments-heading')).toHaveText('Attachments (2)')

        // With files, the area is one row under the list.
        const list = section.getByTestId('bill-attachments-list')
        await expect
            .poll(async () => {
                const addBox = await add.boundingBox()
                const listBox = await list.boundingBox()
                if (!addBox || !listBox) return null
                return {
                    isUnderList: addBox.y >= listBox.y + listBox.height - 1,
                    isOneRow: addBox.height < 64,
                }
            })
            .toEqual({ isUnderList: true, isOneRow: true })

        // Stored: reopening the bill lists both.
        await reopenPostedBill(page, memo)
        await expect
            .poll(async () => [...(await attachmentNames(page, 'bill'))].sort())
            .toEqual(['photo.png', 'receipt.pdf'])

        // ⇧? lists Attach files with ⌥A under the Bill group.
        await page.keyboard.press('Shift+?')
        const shortcuts = page.getByRole('dialog').filter({ hasText: 'Keyboard shortcuts' })
        await expect(shortcuts).toBeVisible()
        const group = shortcuts.getByText('Bill', { exact: true }).locator('..')
        const attachKey = group.getByText('Attach files', { exact: true }).locator('..')
        await expect(attachKey).toContainText(/(⌥|Alt)\+?A/)
        await page.keyboard.press('Escape')
        await expect(shortcuts).toHaveCount(0)

        // Tab order: Memo → each row → its Remove → Attach files → the action bar.
        const order = await attachmentNames(page, 'bill')
        await page.getByTestId('bill-memo').filter({ visible: true }).click()
        for (const name of order) {
            if (name === null) throw new Error('an attachment row has no accessible name')
            await page.keyboard.press('Tab')
            await expect(attachmentRow(page, 'bill', name)).toBeFocused()
            await page.keyboard.press('Tab')
            await expect(
                section.getByRole('button', { name: `Remove ${name}`, exact: true })
            ).toBeFocused()
        }
        await page.keyboard.press('Tab')
        await expect(section.getByTestId('bill-attachments-attach')).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(
            page
                .getByTestId('bill-read-actions')
                .filter({ visible: true })
                .getByRole('button')
                .first()
        ).toBeFocused()

        // Remove asks first, then deletes.
        await section.getByRole('button', { name: 'Remove receipt.pdf', exact: true }).click()
        await expect(page.getByText('Remove receipt.pdf?', { exact: true })).toBeVisible()
        await expect(page.getByText('It is deleted from this bill.', { exact: true })).toBeVisible()
        await page.getByTestId('bill-attachment-remove-confirm').click()
        await expectAttachmentNames(page, 'bill', ['photo.png'])
        await expect(section.getByTestId('bill-attachments-heading')).toHaveText('Attachments (1)')
    })
})

test.describe('attachments: refusals and retry', () => {
    test('refuses files that break a rule and retries a refused upload', async ({ page }) => {
        await openBooks(page)
        await newPostedBill(page)
        const section = attachmentsSection(page, 'bill')

        // Over 20 MB and an HTML page: the first refusal shows, and neither is added.
        await attachFiles(page, 'bill', [
            testFile('big.pdf', 20 * 1024 * 1024 + 1),
            testFile('page.html'),
        ])
        const refusal = section.getByTestId('bill-attachments-refusal')
        await expect(refusal).toHaveText('big.pdf is larger than 20 MB.')
        await expect(refusal).toHaveAttribute('role', 'alert')
        await expect(refusal).toHaveClass(/text-danger/)
        expect(await attachmentNames(page, 'bill')).toEqual([])

        // The next add clears the refusal and uploads.
        await attachFiles(page, 'bill', [testFile('notes.txt')])
        await expect(refusal).toHaveCount(0)
        await expect(
            attachmentRow(page, 'bill', 'notes.txt').getByText(STORED_DETAIL)
        ).toBeVisible()

        // Core's quota refusal shows on the row, with Retry and Remove.
        await page.route(ATTACHMENTS_LIST, route => {
            const request = route.request()
            if (!isUploadPost(request.url(), request.method())) return route.fallback()
            return route.fulfill({
                status: 413,
                contentType: 'application/json',
                body: JSON.stringify({ message: QUOTA_REFUSAL, data: {} }),
            })
        })
        await attachFiles(page, 'bill', [testFile('notes.csv')])
        const failed = attachmentRow(page, 'bill', 'notes.csv')
        const message = failed.getByText(QUOTA_REFUSAL, { exact: true })
        await expect(message).toBeVisible()
        await expect(message).toHaveClass(/text-danger/)
        const retry = section.locator('[data-testid^="bill-attachment-retry-"]')
        await expect(retry).toHaveCount(1)
        await expect(
            section.locator('[data-testid^="bill-attachment-remove-pending-"]')
        ).toHaveCount(1)

        await page.unrouteAll({ behavior: 'wait' })
        await retry.click()
        await expect(
            attachmentRow(page, 'bill', 'notes.csv').getByText(STORED_DETAIL)
        ).toBeVisible()
        await expect(section.getByText(QUOTA_REFUSAL, { exact: true })).toHaveCount(0)
        await expect(section.getByTestId('bill-attachments-heading')).toHaveText('Attachments (2)')
    })
})

test.describe('attachments: drop and offline', () => {
    test('a dropped file uploads, and offline add and remove are disabled', async ({ page }) => {
        await openBooks(page)
        await newPostedExpense(page)
        const section = attachmentsSection(page, 'expense')
        let uploads = 0
        page.on('request', request => {
            if (isUploadPost(request.url(), request.method())) uploads++
        })

        // A drag over the area shows the overlay; a drop uploads.
        const dragged = await attachmentTransfer(page, [testFile('receipt.jpg')])
        await section.getByTestId('expense-attachments-drop').dispatchEvent('dragenter', {
            dataTransfer: dragged,
        })
        await expect(page.getByText('Drop files to attach', { exact: true })).toBeVisible()
        await dragged.dispose()
        await dropAttachments(page, 'expense', [testFile('receipt.jpg')])
        await expect(
            attachmentRow(page, 'expense', 'receipt.jpg').getByText(STORED_DETAIL)
        ).toBeVisible()
        expect(uploads).toBe(1)

        await page.context().setOffline(true)
        const attach = section.getByTestId('expense-attachments-attach')
        await expect.poll(() => isDisabled(attach)).toBe(true)
        const remove = section.getByRole('button', { name: 'Remove receipt.jpg', exact: true })
        expect(await isDisabled(remove)).toBe(true)

        // ⌥A opens no chooser.
        const chooserOpened = Promise.race([
            page.waitForEvent('filechooser', { timeout: 1_000 }).then(
                () => true,
                () => false
            ),
            new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1_000)),
        ])
        await page.keyboard.press('Alt+a')
        expect(await chooserOpened).toBe(false)

        // A drop is refused: no row, no upload.
        await dropAttachments(page, 'expense', [testFile('second.jpg')])

        // Open still works.
        await attachmentRow(page, 'expense', 'receipt.jpg').click()
        const modal = previewModal(page)
        await expect(modal).toBeVisible()
        await expect(modal).toContainText('receipt.jpg')
        await previewButton(page, 'Close preview').click()
        await expect(modal).not.toBeVisible()
        expect(await attachmentNames(page, 'expense')).toEqual(['receipt.jpg'])
        expect(uploads).toBe(1)

        await page.context().setOffline(false)
        await expect.poll(() => isDisabled(attach)).toBe(false)
    })
})

test.describe('attachments: phone remove', () => {
    test('on a phone the section follows Memo and Remove confirms in a sheet', async ({ page }) => {
        await openBooks(page)
        await newPostedBill(page)
        await page.setViewportSize(PHONE)
        const section = attachmentsSection(page, 'bill')

        await attachFiles(page, 'bill', [testFile('slip.png')])
        const row = attachmentRow(page, 'bill', 'slip.png')
        await expect(row.getByText(STORED_DETAIL)).toBeVisible()

        // Full width after Memo: the Memo detail stretches across the stacked footer.
        const memo = page.getByTestId('bill-detail-memo').filter({ visible: true })
        await expect
            .poll(async () => {
                const memoBox = await memo.boundingBox()
                const sectionBox = await section.boundingBox()
                if (!memoBox || !sectionBox) return null
                return {
                    isBelow: sectionBox.y >= memoBox.y + memoBox.height,
                    leftGap: Math.round(Math.abs(sectionBox.x - memoBox.x)),
                    widthGap: Math.round(Math.abs(sectionBox.width - memoBox.width)),
                    isWide: sectionBox.width >= 320,
                }
            })
            .toEqual({ isBelow: true, leftGap: 0, widthGap: 0, isWide: true })
        await expect.poll(() => boxHeight(row)).toBeGreaterThanOrEqual(44)

        // Remove → the confirm (a Sheet on a phone) → no rows, the full add area.
        await section.getByRole('button', { name: 'Remove slip.png', exact: true }).click()
        await page.getByTestId('bill-attachment-remove-confirm').click()
        await expectAttachmentNames(page, 'bill', [])
        const add = section.getByTestId('bill-attachments-add')
        await expect.poll(() => boxHeight(add)).toBeGreaterThanOrEqual(FULL_AREA_MIN)
    })
})

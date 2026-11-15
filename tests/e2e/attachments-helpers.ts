import { expect, type Locator, type Page } from '@playwright/test'
import { ATTACHMENT_SEED_FILES } from '../../tinycld/books/lib/attachment-seed-files'
import { ATTACHMENT_IDS } from '../../tinycld/books/lib/attachments-fixture'
import {
    billCellTestId,
    openBillBySearch,
    openNewBill,
    pickBillVendor,
    pickLineAccount,
    postBill,
    searchToBill,
} from './bill-helpers'
import {
    expenseCellTestId,
    openNewExpense,
    pickExpenseLineAccount,
    pickExpenseVendor,
    pickPaidFrom,
    postExpense,
} from './expense-helpers'
import { uniqueMemo } from './invoice-helpers'

// The seeded posted bill with two section files (OSW-invoice-1002.pdf,
// packing-slip-photo.png) and a W-9 in a custom File field. Read only: a test never adds,
// removes, edits, voids or copies there.
export const SEEDED_BILL_1002_TITLE = 'Bill 1002 · Office Supply World'

// `prefix` is the kind's test id: `bill` or `expense`.
export function attachmentsSection(page: Page, prefix: string): Locator {
    return page.getByTestId(`${prefix}-attachments`).filter({ visible: true })
}

// Every row of the list in screen order: stored (`-attachment-<id>`) and pending
// (`-attachment-pending-<key>`) rows, never a row's Remove or Retry button.
function attachmentRows(page: Page, prefix: string): Locator {
    const row = `[data-testid^="${prefix}-attachment-"]`
    const notButton = `:not([data-testid^="${prefix}-attachment-remove-"]):not([data-testid^="${prefix}-attachment-retry-"])`
    return attachmentsSection(page, prefix)
        .getByTestId(`${prefix}-attachments-list`)
        .locator(`${row}${notButton}`)
}

export function attachmentRow(page: Page, prefix: string, name: string): Locator {
    return attachmentRows(page, prefix).filter({ has: page.getByText(name, { exact: true }) })
}

// The list's rows by their accessible name (the file name), in screen order.
export async function expectAttachmentNames(page: Page, prefix: string, names: string[]) {
    await expect
        .poll(() =>
            attachmentRows(page, prefix).evaluateAll(rows =>
                rows.map(row => row.getAttribute('aria-label'))
            )
        )
        .toEqual(names)
}

// Books must already be open. Search `1002` and pick the bill's own result.
export async function openSeededBill1002(page: Page) {
    await searchToBill(page, '1002', SEEDED_BILL_1002_TITLE)
    await expect(page.getByTestId('bill-read-only').filter({ visible: true })).toBeVisible()
}

// The list's file names in screen order (an empty list when no row shows).
export function attachmentNames(page: Page, prefix: string): Promise<(string | null)[]> {
    return attachmentRows(page, prefix).evaluateAll(rows =>
        rows.map(row => row.getAttribute('aria-label'))
    )
}

export type AttachmentTestFile = { name: string; mimeType: string; buffer: Buffer }

const SEEDED_BYTES = {
    pdf: { base64: ATTACHMENT_SEED_FILES[ATTACHMENT_IDS.billPdf], mimeType: 'application/pdf' },
    png: { base64: ATTACHMENT_SEED_FILES[ATTACHMENT_IDS.billPhoto], mimeType: 'image/png' },
    jpg: { base64: ATTACHMENT_SEED_FILES[ATTACHMENT_IDS.expenseReceipt], mimeType: 'image/jpeg' },
} as const

const TEXT_TYPES: Record<string, string> = {
    txt: 'text/plain',
    csv: 'text/csv',
    html: 'text/html',
}

// A file with real bytes of its type (the server sniffs every upload): a .pdf, .png or
// .jpg from the seed's bytes padded with zero bytes to `size` (trailing bytes do not
// change the sniffed type); a .txt, .csv or .html of plain ASCII, padded with spaces.
export function testFile(name: string, size?: number): AttachmentTestFile {
    const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    if (ext === 'pdf' || ext === 'png' || ext === 'jpg') {
        const seeded = SEEDED_BYTES[ext]
        const bytes = Buffer.from(seeded.base64, 'base64')
        const buffer =
            size !== undefined && size > bytes.length
                ? Buffer.concat([bytes, Buffer.alloc(size - bytes.length)])
                : bytes
        return { name, mimeType: seeded.mimeType, buffer }
    }
    const mimeType = TEXT_TYPES[ext]
    if (!mimeType) throw new Error(`testFile makes no .${ext} file`)
    const text =
        ext === 'html'
            ? '<!doctype html><html><body><p>Vendor portal export</p></body></html>\n'
            : `Attachment test file ${name}\n`
    const padded = size !== undefined && size > text.length ? text.padEnd(size, ' ') : text
    return { name, mimeType, buffer: Buffer.from(padded, 'ascii') }
}

// Core's picker clicks a dynamic file input, so the chooser is caught around the press of
// Attach files.
export async function attachFiles(page: Page, prefix: string, files: AttachmentTestFile[]) {
    const attach = page.getByTestId(`${prefix}-attachments-attach`).filter({ visible: true })
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), attach.click()])
    await chooser.setFiles(files)
}

// A browser DataTransfer holding `files`, built in the page.
export function attachmentTransfer(page: Page, files: AttachmentTestFile[]) {
    const list = files.map(file => ({
        name: file.name,
        mimeType: file.mimeType,
        base64: file.buffer.toString('base64'),
    }))
    return page.evaluateHandle(items => {
        const transfer = new DataTransfer()
        for (const item of items) {
            const binary = atob(item.base64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
            transfer.items.add(new File([bytes], item.name, { type: item.mimeType }))
        }
        return transfer
    }, list)
}

// A drop of `files` on the add area's DropZone, as a browser delivers one from the desktop.
export async function dropAttachments(page: Page, prefix: string, files: AttachmentTestFile[]) {
    const dataTransfer = await attachmentTransfer(page, files)
    await page
        .getByTestId(`${prefix}-attachments-drop`)
        .filter({ visible: true })
        .dispatchEvent('drop', { dataTransfer })
    await dataTransfer.dispose()
}

const SUMMIT = 'Summit IT Services'
const RENT = '6100 Rent'
const CARD = '2100 Company Card'

// Books must already be open. Makes and posts a bill for Summit with `memo` (unique, so
// openBillBySearch finds it again); ends on its read view and returns its number.
export async function newPostedBill(
    page: Page,
    memo = uniqueMemo('Attachments bill')
): Promise<string> {
    await openNewBill(page)
    await pickBillVendor(page, SUMMIT)
    const line = await pickLineAccount(page, 0, RENT)
    await page.getByTestId(billCellTestId('account_lines', line, 'amount')).fill('42.00')
    await page.getByTestId('form-input-memo').fill(memo)
    return postBill(page)
}

// Books must already be open. Makes and posts an expense for Summit paid by card, with
// `memo`; ends on its read view and returns its number.
export async function newPostedExpense(
    page: Page,
    memo = uniqueMemo('Attachments expense')
): Promise<string> {
    await openNewExpense(page)
    await pickExpenseVendor(page, SUMMIT)
    await pickPaidFrom(page, CARD)
    const line = await pickExpenseLineAccount(page, 0, RENT)
    await page.getByTestId(expenseCellTestId('account_lines', line, 'amount')).fill('18.00')
    await page.getByTestId('form-input-memo').fill(memo)
    return postExpense(page)
}

// Desktop. Leaves the bill through the sidebar's Journal Entries item, then reopens it by
// its unique memo through search.
export async function reopenPostedBill(page: Page, memo: string) {
    const navItem = page.getByTestId('books-nav-entries')
    if (!(await navItem.isVisible())) {
        await page.getByTestId('books-nav-accounting-toggle').click()
    }
    await navItem.click()
    await expect(page.getByTestId('entries-screen').last()).toBeVisible()
    await expect(page.getByTestId('bill-read-only').filter({ visible: true })).toHaveCount(0)
    await openBillBySearch(page, memo)
    await expect(page.getByTestId('bill-read-only').filter({ visible: true })).toBeVisible()
}

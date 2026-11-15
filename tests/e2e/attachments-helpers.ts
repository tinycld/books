import { expect, type Locator, type Page } from '@playwright/test'
import { searchToBill } from './bill-helpers'

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

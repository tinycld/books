import { expect, type Locator, type Page } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP } from './account-register-helpers'

// A deposit's own screen: `books/deposits/<id>`, never `.../new`.
export const DEPOSIT_URL = /\/books\/deposits\/(?!new(?:[?#]|$))[^/?#]+$/

// The one deposit seed.ts posts (bank deposit spec §4.6): to 1000 Business Checking, holding
// the $180.00 sales receipt and one other funds line, "October interest" $12.40, on 4900.
// No spec voids or edits it.
export const SEEDED_DEPOSIT = {
    memo: 'Seeded deposit',
    depositTo: '1000 Business Checking',
    itemAmount: '$180.00',
    lineDescription: 'October interest',
    lineAmount: '$12.40',
    total: '$192.40',
} as const

export function depositUrlOf(id: string) {
    return new RegExp(`/books/deposits/${id}$`)
}

export function depositIdFromUrl(page: Page): string {
    const match = /\/books\/deposits\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    const id = match?.[1]
    if (!id || id === 'new') throw new Error(`Not on a saved deposit: ${page.url()}`)
    return id
}

// A screen covered in the navigation stack stays mounted but hidden, so only the visible
// match counts.
export function shownDeposit(page: Page, testId: string): Locator {
    return page.getByTestId(testId).filter({ visible: true })
}

export async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// A deposit's search option: "Draft deposit", or "Deposit <n>" / "Deposit <n> (void)" with
// " · <Deposit to>". The deposit's own journal entry is a document entry, which search
// leaves out, so only the deposit's row matches.
const DEPOSIT_OPTION = /^(Draft deposit|Deposit \d+( \(void\))? · )/

// Leaves the page on the deposit's route without waiting for it to load, for a test whose
// load is meant to fail.
export async function searchToDeposit(page: Page, memo: string, title = DEPOSIT_OPTION) {
    await page.keyboard.press('/')
    // The palette focuses its input a frame after it shows; keys typed before that frame
    // are lost.
    const input = page.getByRole('dialog', { name: 'Search' }).getByRole('textbox')
    await expect(input).toBeFocused()
    const searched = page.waitForResponse(
        r =>
            r.url().includes('/api/search') &&
            r.status() === 200 &&
            new URL(r.url()).searchParams.get('q') === memo
    )
    await page.keyboard.type(memo)
    await searched
    await page.getByRole('option').filter({ hasText: title }).click()
    await expect(page).toHaveURL(DEPOSIT_URL)
}

// Opens a deposit through core's search palette (`/`), by its memo, and waits for its form
// or its read view.
export async function openDepositBySearch(page: Page, memo: string) {
    await searchToDeposit(page, memo)
    await expect(
        shownDeposit(page, 'deposit-form').or(shownDeposit(page, 'deposit-read-only'))
    ).toBeVisible()
}

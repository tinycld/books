import { expect, type Locator, type Page } from '@playwright/test'
import {
    connectTestAccount,
    type OfxEntry,
    ofxStatement,
    openImportFromUpload,
} from './bank-import-helpers'
import { bankCard, chooseBankFile, connectionIdOf } from './banking-helpers'
import { stampDigits } from './record-form-helpers'

// Shared by the for-review e2e specs. A test that writes connects its own number-less Bank
// account and imports its own OFX file (only OFX carries a memo and a check number), with
// the test's stamp in every name and memo, so its rows and its file bytes are its own on
// the shared DB. The seeded 1000 and 2100 connections are only read.

export type ReviewEntry = OfxEntry

export type ReviewImport = {
    accountName: string
    connectionId: string
    stamp: string
    fileName: string
}

// Connects a new account, uploads an OFX statement of `entriesOf(stamp)`, imports every
// line, and returns on For review through "Review transactions".
export async function importReviewStatement(
    page: Page,
    entriesOf: (stamp: string) => ReviewEntry[]
): Promise<ReviewImport> {
    const stamp = stampDigits()
    const accountName = await connectTestAccount(page)
    const connectionId = await connectionIdOf(bankCard(page, accountName))
    const file = ofxStatement(stamp, entriesOf(stamp))
    await chooseBankFile(page, file)
    await expect(page.getByTestId('bank-upload-done')).toBeVisible()
    await openImportFromUpload(page)
    await page.getByTestId('bank-import-submit').click()
    await expect(page.getByTestId('bank-import-result-text')).toBeVisible()
    await page.getByTestId('bank-import-review').click()
    await expect(page).toHaveURL(/[?&]tab=review(&|$)/)
    return { accountName, connectionId, stamp, fileName: file.name }
}

// The transaction row (table row or phone card) that shows `text` exactly.
export function reviewRow(page: Page, text: string): Locator {
    return page
        .locator('[data-testid^="bank-review-row-"]')
        .filter({ has: page.getByText(text, { exact: true }) })
}

// Presses a tab of the account panel and waits for its body and the URL. The chosen tab is
// read from the URL and the body, never from aria-selected (core SetupTabs sets only
// accessibilityState, which react-native-web does not write as aria-selected).
export async function openReviewTab(
    page: Page,
    tab: 'review' | 'reviewed' | 'excluded' | 'files'
): Promise<void> {
    await page.getByTestId(`bank-tabs-${tab}`).click()
    await expect(page.getByTestId(`bank-tab-body-${tab}`)).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`[?&]tab=${tab}(&|$)`))
}

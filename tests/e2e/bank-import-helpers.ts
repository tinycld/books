import { expect, type Locator, type Page } from '@playwright/test'
import {
    type BankTestFile,
    connectAccount,
    createBankTestAccount,
    openBanking,
} from './banking-helpers'

// Shared by the bank-import-mapping e2e specs. A test that uploads connects its own
// number-less Bank account (the seeded 1000 and 2100 connections stay as seeded, because
// other banking specs read their files), and every file carries the test's stamp, so its
// bytes and its descriptions differ from every other file: the server refuses the same
// bytes anywhere in Books and dedupes rows per connection.

// Creates a number-less Bank account, opens Banking and connects it with bank details.
// Returns the account name, which is the card's label and the "Into:" label.
export async function connectTestAccount(page: Page): Promise<string> {
    const name = await createBankTestAccount(page)
    await openBanking(page)
    await connectAccount(page, name, { institution: 'E2E Bank', mask: '4821' })
    return name
}

// `day` is 'YYYYMMDD' or any text; text the server cannot read as a day stays in the
// row's date cell, so the import shows it in the row error.
export type OfxEntry = { day: string; amount: string; name: string; memo?: string }

function ofxTransaction(stamp: string, entry: OfxEntry, index: number): string[] {
    return [
        '<STMTTRN>',
        `<TRNTYPE>${entry.amount.startsWith('-') ? 'DEBIT' : 'CREDIT'}`,
        `<DTPOSTED>${entry.day}`,
        `<TRNAMT>${entry.amount}`,
        `<FITID>${stamp}-${index + 1}`,
        `<NAME>${entry.name}`,
        ...(entry.memo === undefined ? [] : [`<MEMO>${entry.memo}`]),
        '</STMTTRN>',
    ]
}

// A bank OFX statement of `entries`, named `<stamp>.ofx`.
export function ofxStatement(stamp: string, entries: OfxEntry[]): BankTestFile {
    const text = [
        'OFXHEADER:100',
        'DATA:OFXSGML',
        'VERSION:102',
        '',
        '<OFX>',
        '<BANKMSGSRSV1><STMTTRNRS><STMTRS>',
        '<CURDEF>USD',
        '<BANKTRANLIST>',
        ...entries.flatMap((entry, i) => ofxTransaction(stamp, entry, i)),
        '</BANKTRANLIST>',
        '</STMTRS></STMTTRNRS></BANKMSGSRSV1>',
        '</OFX>',
        '',
    ].join('\n')
    return { name: `${stamp}.ofx`, mimeType: 'application/x-ofx', buffer: Buffer.from(text) }
}

// A CSV file of `lines` as written, named `<stamp>.csv`.
export function csvStatement(stamp: string, lines: string[]): BankTestFile {
    return {
        name: `${stamp}.csv`,
        mimeType: 'text/csv',
        buffer: Buffer.from(`${lines.join('\n')}\n`),
    }
}

// The row of the import list that shows `text` exactly.
export function importLine(page: Page, text: string): Locator {
    return page
        .getByTestId('bank-import-list')
        .locator('[data-testid^="bank-import-line-"]')
        .filter({ has: page.getByText(text, { exact: true }) })
}

// The check box of an import row.
export function importBox(row: Locator): Locator {
    return row.locator('[data-testid^="bank-import-check-"]')
}

// Presses "Import transactions" beside the upload line and waits for the import page.
export async function openImportFromUpload(page: Page): Promise<void> {
    await page.getByTestId('bank-upload-import').click()
    await expect(page).toHaveURL(/\/banking\/import\//)
    await expect(page.getByTestId('bank-import-screen')).toBeVisible()
}

// The Banking file row (table or card) whose file name is `name`.
export function fileRowByName(page: Page, name: string): Locator {
    return page
        .getByTestId('bank-files')
        .locator(
            '[data-testid^="bank-file-"]:not([data-testid^="bank-file-remove-"]):not([data-testid^="bank-file-import-"])'
        )
        .filter({ has: page.getByText(name, { exact: true }) })
}

// The bank file id a file row carries in its test id.
export async function fileIdOf(row: Locator): Promise<string> {
    await expect(row).toHaveCount(1)
    const testId = (await row.getAttribute('data-testid')) ?? ''
    if (!testId.startsWith('bank-file-')) throw new Error(`no bank-file-<id> test id: ${testId}`)
    return testId.slice('bank-file-'.length)
}

import { expect, type Locator, type Page } from '@playwright/test'
import { BANK_CSV_SAMPLE, BANK_OFX_SAMPLE } from '../../tinycld/books/lib/bank-connection-fixture'
import { createAccount, DESKTOP, openChart, PHONE } from './account-register-helpers'
import { uniqueName } from './record-form-helpers'

// Shared by the bank-connection e2e specs. The DB is shared by every spec file on two
// workers, so a spec that writes never touches a seeded connection (1000, 2100) or the
// unconnected 1010: it makes its own number-less Bank account with createBankTestAccount.
// A number-less account sorts last in chart order, so no spec assumes which card is first.

export const BANKING_DESKTOP = DESKTOP
export const BANKING_PHONE = PHONE

// From the Books sidebar to Banking. Waits for whichever state the page settles in.
export async function openBanking(page: Page): Promise<void> {
    await page.getByTestId('books-nav-banking').click()
    await expect(
        page
            .getByTestId('bank-strip')
            .or(page.getByTestId('bank-intro'))
            .or(page.getByTestId('bank-error'))
            .first()
    ).toBeVisible()
}

export function bankStrip(page: Page): Locator {
    return page.getByTestId('bank-strip')
}

// Every account card in the strip, in screen order.
export function bankCards(page: Page): Locator {
    return bankStrip(page).locator('[data-testid^="bank-card-"]')
}

export function selectedCard(page: Page): Locator {
    return bankCards(page).and(page.locator('[aria-selected="true"]'))
}

// The card of the connection whose label (number and name) is `label`.
export function bankCard(page: Page, label: string): Locator {
    return bankCards(page).filter({ has: page.getByText(label, { exact: true }) })
}

// The connection id that a card carries in its test id.
export async function connectionIdOf(card: Locator): Promise<string> {
    await expect(card).toHaveCount(1)
    const testId = (await card.getAttribute('data-testid')) ?? ''
    if (!testId.startsWith('bank-card-')) throw new Error(`no bank-card-<id> test id: ${testId}`)
    return testId.slice('bank-card-'.length)
}

// Connect account → pick `accountName` → fill the bank details → Connect, then waits for
// the account's card to be the selected one. A number-less account's card label is its name.
export async function connectAccount(
    page: Page,
    accountName: string,
    details: { institution?: string; mask?: string } = {}
): Promise<void> {
    await page.getByTestId('bank-connect').or(page.getByTestId('bank-intro-connect')).click()
    const dialog = page.getByTestId('bank-connect-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('bank-connect-account').click()
    await page.getByRole('menuitem', { name: accountName, exact: true }).click()
    if (details.institution !== undefined) {
        await page.getByTestId('bank-connect-institution').fill(details.institution)
    }
    if (details.mask !== undefined) {
        await page.getByTestId('bank-connect-mask').fill(details.mask)
    }
    await page.getByTestId('bank-connect-submit').click()
    await expect(dialog).toHaveCount(0)
    await expect(bankCard(page, accountName)).toHaveAttribute('aria-selected', 'true')
}

// More → Disconnect → confirm on the selected connection, then waits for its card to go.
export async function disconnectSelected(page: Page, accountName: string): Promise<void> {
    await page.getByTestId('bank-panel-more').click()
    await page.getByRole('menuitem', { name: 'Disconnect', exact: true }).click()
    const dialog = page.getByTestId('bank-disconnect-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('bank-disconnect-dialog-confirm').click()
    await expect(dialog).toHaveCount(0)
    await expect(bankCard(page, accountName)).toHaveCount(0)
}

// Opens the Chart of Accounts and creates a number-less Bank / Checking account with a
// name no other spec or run can have. Returns the name.
export async function createBankTestAccount(page: Page): Promise<string> {
    await openChart(page)
    const name = uniqueName('Bank e2e')
    await createAccount(page, name, { type: 'Bank', detailType: 'Checking' })
    return name
}

export type BankTestFile = { name: string; mimeType: string; buffer: Buffer }

const STAMPED_OFX_TRANSACTION = (stamp: string) =>
    [
        '<STMTTRN>',
        '<TRNTYPE>DEBIT',
        '<DTPOSTED>20261020',
        '<TRNAMT>-1.00',
        `<FITID>${stamp}`,
        `<NAME>${stamp}`,
        '</STMTTRN>',
    ].join('\n')

// The fixture sample plus one row (CSV) or transaction (OFX) that holds `stamp`, so its
// bytes differ from every other file: the server refuses the same bytes anywhere in Books.
export function statementFile(stamp: string, ext: 'csv' | 'ofx' = 'csv'): BankTestFile {
    if (ext === 'ofx') {
        const text = BANK_OFX_SAMPLE.replace(
            '</BANKTRANLIST>',
            `${STAMPED_OFX_TRANSACTION(stamp)}\n</BANKTRANLIST>`
        )
        return { name: `${stamp}.ofx`, mimeType: 'application/x-ofx', buffer: Buffer.from(text) }
    }
    const text = `${BANK_CSV_SAMPLE}2026-10-20,${stamp},-1.00\n`
    return { name: `${stamp}.csv`, mimeType: 'text/csv', buffer: Buffer.from(text) }
}

// Makes the signed-in user a read-only Books user by rewriting the books_access read's
// answer; it fakes a read only, never a write. Install it before login. Realtime is cut
// too: an access event would undo the fake, and the other worker's banking tests connect
// accounts whose events would add rows past a faked read.
export async function fakeReadOnlyAccess(page: Page): Promise<void> {
    await page.route('**/api/realtime*', route => route.abort())
    await page.route('**/api/collections/books_access/records*', async route => {
        const response = await route.fetch()
        const body = await response.json()
        const items = (body.items ?? []).map((item: Record<string, unknown>) => ({
            ...item,
            level: 'read_only',
            can_read: true,
            can_write: false,
            is_admin: false,
        }))
        await route.fulfill({ response, json: { ...body, items } })
    })
}

// Core's picker clicks a dynamic file input, so the chooser is caught around the press.
export async function chooseBankFile(page: Page, file: BankTestFile): Promise<void> {
    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByTestId('bank-choose-file').click(),
    ])
    await chooser.setFiles(file)
}

// A drop of `files` on the upload area, as a browser delivers one from the desktop.
export async function dropBankFiles(
    page: Page,
    files: { name: string; text: string }[]
): Promise<void> {
    const dataTransfer = await page.evaluateHandle(list => {
        const transfer = new DataTransfer()
        for (const file of list) transfer.items.add(new File([file.text], file.name))
        return transfer
    }, files)
    await page.getByTestId('bank-file-drop').dispatchEvent('drop', { dataTransfer })
    await dataTransfer.dispose()
}

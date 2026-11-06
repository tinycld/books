import { expect, type Page, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    connectTestAccount,
    fileIdOf,
    fileRowByName,
    importBox,
    importLine,
    ofxStatement,
    openImportFromUpload,
} from './bank-import-helpers'
import {
    BANKING_DESKTOP,
    bankCard,
    chooseBankFile,
    connectionIdOf,
    fakeReadOnlyAccess,
    openBanking,
} from './banking-helpers'
import { navigateInApp, uniqueName } from './record-form-helpers'

// The writer tests connect their own number-less Bank account and upload OFX files with
// the test's stamp in every description. An import makes the connection permanent (the
// server refuses to disconnect a connection with imported transactions), so those tests
// leave it; a number-less account sorts last in the strip. The read tests use the seeded
// 2100 Company Card and its seeded card-2026-10.ofx (and the load-problems test also the
// seeded 1000 Business Checking file checking-2026-09.csv), and never import them.

const CARD = '2100 Company Card'
const CARD_FILE = 'card-2026-10.ofx'
const CHECKING = '1000 Business Checking'
const CHECKING_FILE = 'checking-2026-09.csv'
const IMPORTS_URL = '**/api/collections/books_bank_imports/records*'
const CONTENTS_URL = '**/api/collections/books_bank_file_contents/records*'
const TRANSPORT_TEXT = 'The import could not be sent. Check your connection and try again.'
const PENDING_ERROR = /^Line \d+: "PENDING" is not a date in the YYYY-MM-DD format\.$/

function stampOf(label: string): string {
    return uniqueName(label).replaceAll(' ', '-')
}

function bankingUrl(connectionId?: string): RegExp {
    return connectionId
        ? new RegExp(`/banking\\?(.*&)?account=${connectionId}(&|$)`)
        : /\/banking(\?|$)/
}

async function openBooksBanking(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(BANKING_DESKTOP)
}

// Answers the next import POSTs with `answer`; reads pass.
async function answerImportPosts(page: Page, answer: (route: Route) => Promise<void>) {
    await page.unrouteAll({ behavior: 'wait' })
    await page.route(IMPORTS_URL, route =>
        route.request().method() === 'POST' ? answer(route) : route.continue()
    )
}

test.describe('bank-import-mapping: import', () => {
    test('imports an OFX file in two parts', async ({ page }) => {
        await openBooksBanking(page)
        const name = await connectTestAccount(page)
        const stamp = stampOf('ofx-parts')
        const file = ofxStatement(stamp, [
            {
                day: '20261001',
                amount: '100.00',
                name: `${stamp} deposit`,
                memo: `ACH CREDIT ${stamp}`,
            },
            { day: '20261002', amount: '-25.50', name: `${stamp} supplies` },
            { day: '20261003', amount: '-10.00', name: `${stamp} fee` },
            { day: 'PENDING', amount: '-5.00', name: `${stamp} pending` },
        ])
        await chooseBankFile(page, file)
        await expect(page.getByTestId('bank-upload-done')).toBeVisible()
        await openImportFromUpload(page)

        const fileLine = page.getByTestId('bank-import-file')
        await expect(fileLine).toContainText(`File: ${file.name}`)
        await expect(fileLine.getByText('OFX', { exact: true })).toBeVisible()
        const into = page.getByTestId('bank-import-into')
        await expect(into).toContainText(`Into: ${name}`)
        await expect(into.getByText('E2E Bank ••4821', { exact: true })).toBeVisible()

        const steps = page.getByTestId('bank-import-steps')
        await expect(steps.getByText('Upload', { exact: true })).toBeVisible()
        const current = steps.locator('[aria-current="step"]')
        await expect(current).toHaveCount(1)
        await expect(current).toContainText('Choose transactions')
        await expect(steps.getByText('Map columns', { exact: true })).toHaveCount(0)

        const deposit = importLine(page, `${stamp} deposit`)
        const supplies = importLine(page, `${stamp} supplies`)
        const fee = importLine(page, `${stamp} fee`)
        await expect(deposit.getByText(`ACH CREDIT ${stamp}`, { exact: true })).toBeVisible()

        await expect(page.getByTestId('bank-import-summary')).toHaveText(
            '4 transactions from Oct 1 to Oct 3, 2026 · 1 with errors'
        )
        await expect(page.getByTestId('bank-import-band')).toHaveText(
            'Books could not read 1 row of this OFX file.'
        )
        await expect(page.getByTestId('bank-import-change-mapping')).toHaveCount(0)

        const pending = page
            .getByTestId('bank-import-list')
            .locator('[data-testid^="bank-import-line-"]')
            .filter({ has: page.getByText(PENDING_ERROR) })
        await expect(pending).toHaveCount(1)
        await expect(importBox(pending)).toHaveAttribute('aria-checked', 'false')
        await expect(importBox(pending)).toHaveAttribute('aria-disabled', 'true')

        const selection = page.getByTestId('bank-import-selection')
        const selectAll = page.getByTestId('bank-import-select-all')
        const submit = page.getByTestId('bank-import-submit')
        await expect(selection).toHaveText('3 selected · Money in $100.00 · Money out $35.50')
        await expect(selectAll).toHaveAttribute('aria-checked', 'true')

        await importBox(fee).click()
        await expect(selection).toHaveText('2 selected · Money in $100.00 · Money out $25.50')
        await expect(selectAll).toHaveAttribute('aria-checked', 'mixed')
        await expect(submit).toHaveText('Import 2 transactions')
        await submit.click()

        const resultText = page.getByTestId('bank-import-result-text')
        const more = page.getByTestId('bank-import-more')
        await expect(resultText).toHaveText(`Imported 2 transactions into ${name}.`)
        await expect(more).toBeVisible()
        await more.click()

        for (const row of [deposit, supplies]) {
            await expect(row.getByText('Already imported', { exact: true })).toBeVisible()
            await expect(importBox(row)).toHaveAttribute('aria-disabled', 'true')
            await expect(importBox(row)).toHaveAttribute('aria-checked', 'false')
        }
        await expect(importBox(fee)).toHaveAttribute('aria-checked', 'true')
        await expect(selection).toHaveText('1 selected · Money in $0.00 · Money out $10.00')
        await expect(submit).toHaveText('Import 1 transaction')
        await submit.click()

        await expect(resultText).toHaveText(`Imported 1 transaction into ${name}.`)
        await expect(more).toHaveCount(0)
        await page.getByTestId('bank-import-to-banking').click()
        await expect(page).toHaveURL(/\/banking\?(.*&)?account=/)

        const row = fileRowByName(page, file.name)
        await expect(row.getByText('Imported: 3 transactions', { exact: true })).toBeVisible()
        const fileId = await fileIdOf(row)
        await page.getByTestId(`bank-file-import-${fileId}`).click()
        await expect(page.getByTestId('bank-import-all-imported')).toContainText(
            'Every transaction in this file is already imported.'
        )
        await page.getByTestId('bank-import-to-banking').click()
        await expect(page).toHaveURL(/\/banking\?(.*&)?account=/)
        await expect(page).not.toHaveURL(/\/import\//)
    })

    test('keeps the choice when an import cannot go out', async ({ page }) => {
        await openBooksBanking(page)
        const name = await connectTestAccount(page)
        const stamp = stampOf('ofx-refuse')
        const file = ofxStatement(stamp, [
            { day: '20261005', amount: '40.00', name: `${stamp} one` },
            { day: '20261006', amount: '-15.00', name: `${stamp} two` },
        ])
        await chooseBankFile(page, file)
        await expect(page.getByTestId('bank-upload-done')).toBeVisible()
        await openImportFromUpload(page)

        const selection = page.getByTestId('bank-import-selection')
        const submit = page.getByTestId('bank-import-submit')
        const errors = page.getByTestId('bank-import-form-errors')
        const chosenText = '2 selected · Money in $40.00 · Money out $15.00'
        await expect(selection).toHaveText(chosenText)

        await page.getByTestId('bank-import-select-all').click()
        await expect(selection).toHaveText('0 selected · Money in $0.00 · Money out $0.00')
        await expect(submit).toHaveText('Import')
        await submit.click()
        await expect(errors).toContainText('Choose at least one transaction to import.')
        await expect(page.getByTestId('bank-import-choose')).toBeVisible()
        await page.getByTestId('bank-import-select-all').click()
        await expect(selection).toHaveText(chosenText)

        await answerImportPosts(page, route =>
            route.fulfill({
                status: 400,
                json: { status: 400, message: 'Line 3 is not a line of this file.', data: {} },
            })
        )
        await submit.click()
        await expect(errors).toContainText('Line 3 is not a line of this file.')
        await expect(selection).toHaveText(chosenText)

        await answerImportPosts(page, route =>
            route.fulfill({
                status: 400,
                json: {
                    status: 400,
                    message: 'Failed to create record.',
                    data: {
                        lines: {
                            code: 'validation_invalid',
                            message: 'Line 9 is not a line of this file.',
                        },
                    },
                },
            })
        )
        await submit.click()
        await expect(errors).toContainText('Line 9 is not a line of this file.')
        await expect(selection).toHaveText(chosenText)

        await answerImportPosts(page, route => route.abort())
        await submit.click()
        await expect(errors).toContainText(TRANSPORT_TEXT)
        await expect(selection).toHaveText(chosenText)

        let release = () => {}
        const released = new Promise<void>(resolve => {
            release = resolve
        })
        let arrive = () => {}
        const arrived = new Promise<void>(resolve => {
            arrive = resolve
        })
        await answerImportPosts(page, async route => {
            arrive()
            await released
            await route.continue()
        })
        await submit.click()
        await arrived
        await expect(submit).toContainText('Importing…')
        await expect(page.getByTestId('bank-import-cancel')).toHaveAttribute(
            'aria-disabled',
            'true'
        )
        for (const text of [`${stamp} one`, `${stamp} two`]) {
            await expect(importBox(importLine(page, text))).toHaveAttribute('aria-disabled', 'true')
        }
        release()
        await expect(page.getByTestId('bank-import-result-text')).toHaveText(
            `Imported 2 transactions into ${name}.`
        )
        await page.unrouteAll({ behavior: 'wait' })
    })

    test('a read-only user cannot import', async ({ page }) => {
        await fakeReadOnlyAccess(page)
        await openBooksBanking(page)
        await openBanking(page)

        const card = bankCard(page, CARD)
        await card.click()
        await expect(card).toHaveAttribute('aria-selected', 'true')
        const row = fileRowByName(page, CARD_FILE)
        await expect(row).toHaveCount(1)
        await expect(page.locator('[data-testid^="bank-file-import-"]')).toHaveCount(0)
        await expect(page.getByTestId('bank-upload-import')).toHaveCount(0)
        const fileId = await fileIdOf(row)
        const cardId = await connectionIdOf(card)

        await navigateInApp(page, `${new URL(page.url()).pathname}/import/${fileId}`)
        await expect(page.getByTestId('bank-import-read-only')).toContainText(
            'You need bookkeeper access to import bank transactions.'
        )
        await page.getByTestId('bank-import-to-banking').click()
        await expect(page).toHaveURL(bankingUrl(cardId))
        await page.unrouteAll({ behavior: 'wait' })
    })

    test('shows the load problems with a way out', async ({ page }) => {
        await page.route('**/api/realtime*', route => route.abort())
        await openBooksBanking(page)
        await openBanking(page)

        // Steps (a) and (c) open different files. pbtsdb keeps a released contents subset
        // for `subsetGcTime` and serves an equal request from it with no request, so a
        // second open of the same file would never reach the faked 400 of step (c).
        const checking = bankCard(page, CHECKING)
        await checking.click()
        await expect(checking).toHaveAttribute('aria-selected', 'true')
        const checkingId = await connectionIdOf(checking)
        const checkingFileId = await fileIdOf(fileRowByName(page, CHECKING_FILE))
        const bankingPath = new URL(page.url()).pathname
        const toBanking = page.getByTestId('bank-import-to-banking')

        // (a) No contents row: the file cannot be read.
        await page.route(CONTENTS_URL, route =>
            route.fulfill({
                json: { page: 1, perPage: 500, totalItems: 0, totalPages: 0, items: [] },
            })
        )
        await page.getByTestId(`bank-file-import-${checkingFileId}`).click()
        await expect(page.getByTestId('bank-import-unreadable')).toContainText(
            'Books could not read the rows of this file. Remove it and upload it again.'
        )
        await expect(page.getByTestId('bank-import-file')).toContainText(`File: ${CHECKING_FILE}`)
        await toBanking.click()
        await expect(page).toHaveURL(bankingUrl(checkingId))
        await expect(page).not.toHaveURL(/\/import\//)

        // (b) No file with that id.
        await navigateInApp(page, `${bankingPath}/import/nosuchbankfile1`)
        await expect(page.getByTestId('bank-import-not-found')).toContainText(
            'This bank file is not in Books. It may have been removed.'
        )
        await toBanking.click()
        await expect(page).toHaveURL(bankingUrl())
        await expect(page).not.toHaveURL(/\/import\//)

        // (c) The contents read fails; Retry loads the file.
        await page.unroute(CONTENTS_URL)
        await page.route(CONTENTS_URL, route =>
            route.fulfill({
                status: 400,
                json: { status: 400, message: 'Bad request.', data: {} },
            })
        )
        const card = bankCard(page, CARD)
        await card.click()
        await expect(card).toHaveAttribute('aria-selected', 'true')
        const cardId = await connectionIdOf(card)
        const fileId = await fileIdOf(fileRowByName(page, CARD_FILE))
        await page.getByTestId(`bank-file-import-${fileId}`).click()
        await expect(page.getByTestId('bank-import-load-error')).toContainText(
            'Books could not load this bank file.'
        )
        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('bank-import-retry').click()
        await expect(page.getByTestId('bank-import-choose')).toBeVisible()
        await expect(page.getByTestId('bank-import-summary')).toHaveText(
            '4 transactions from Oct 2 to Oct 15, 2026'
        )
        await expect(page.getByTestId('bank-import-selection')).toHaveText(
            '4 selected · Money in $1,200.00 · Money out $586.77'
        )
        await page.getByTestId('bank-import-cancel').click()
        await expect(page).toHaveURL(bankingUrl(cardId))
    })
})

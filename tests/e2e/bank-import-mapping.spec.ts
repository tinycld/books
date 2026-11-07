import { expect, type Page, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    connectTestAccount,
    csvStatement,
    fileIdOf,
    fileRowByName,
    importBox,
    importLine,
    ofxStatement,
    openImportFromUpload,
} from './bank-import-helpers'
import {
    BANKING_DESKTOP,
    BANKING_PHONE,
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

const PREVIEW_PROMPT = 'Books shows your first rows here once every question above has an answer.'
const AMOUNT_ERROR = 'Choose the column that holds the amount.'

// Core SelectInput is a popover Menu: its items exist only while it is open, and an
// item's test id is `${testID}-${value}`.
async function chooseOption(page: Page, testId: string, value: string) {
    await page.getByTestId(testId).click()
    const item = page.getByTestId(`${testId}-${value}`)
    await item.click()
    await expect(item).toHaveCount(0)
}

async function uploadAndOpen(page: Page, file: { name: string }) {
    await expect(page.getByTestId('bank-upload-done')).toContainText(`${file.name} uploaded.`)
    await openImportFromUpload(page)
    await expect(page.getByTestId('bank-import-map')).toBeVisible()
}

async function backToBanking(page: Page) {
    await page.getByTestId('bank-import-to-banking').click()
    await expect(page).toHaveURL(/\/banking\?(.*&)?account=/)
    await expect(page).not.toHaveURL(/\/import\//)
}

// A two-amount-column bank export: line 4 holds a date no format reads.
function twoColumnLines(stamp: string): string[] {
    return [
        'Posted Date,Payee,Debit,Credit,Balance',
        `10/01/2026,${stamp} client,,3100.00,9100.00`,
        `10/02/2026,${stamp} supplies,64.20,,9035.80`,
        `13/45/2026,${stamp} staples,42.00,,8993.80`,
        `10/05/2026,${stamp} retainer,,1500.00,10493.80`,
        `10/06/2026,${stamp} software,59.99,,10433.81`,
    ]
}

test.describe('bank-import-mapping: csv mapping', () => {
    test('maps a CSV file, reads the rows and imports them', async ({ page }) => {
        await openBooksBanking(page)
        const name = await connectTestAccount(page)
        const stamp = stampOf('csv-map')
        const file = csvStatement(stamp, twoColumnLines(stamp))
        await chooseBankFile(page, file)
        await uploadAndOpen(page, file)

        const steps = page.getByTestId('bank-import-steps')
        for (const label of ['Upload', 'Map columns', 'Choose transactions']) {
            await expect(steps.getByText(label, { exact: true })).toBeVisible()
        }
        const current = steps.locator('[aria-current="step"]')
        await expect(current).toHaveCount(1)
        await expect(current).toContainText('Map columns')

        await expect(page.getByTestId('bank-import-intro')).toHaveText(
            "Books matched your file's columns. Check each one before you continue."
        )
        const triggers: [string, string][] = [
            ['bank-import-q-header', 'Yes'],
            ['bank-import-q-amounts', 'Two columns: money in and money out'],
            ['bank-import-q-format', 'MM/DD/YYYY (10/01/2026)'],
            ['bank-import-f-date', 'Column 1: Posted Date'],
            ['bank-import-f-description', 'Column 2: Payee'],
            ['bank-import-f-in', 'Column 4: Credit'],
            ['bank-import-f-out', 'Column 3: Debit'],
        ]
        for (const [testId, text] of triggers) {
            await expect(page.getByTestId(testId)).toHaveText(text)
        }

        const sample = page.getByTestId('bank-import-sample')
        await expect(sample.getByText('Posted Date', { exact: true })).toBeVisible()
        await expect(sample.getByText(`${stamp} client`, { exact: true })).toBeVisible()
        for (const line of ['1', '2', '3', '4', '5', '6']) {
            await expect(sample.getByText(line, { exact: true })).toBeVisible()
        }

        const preview = page.getByTestId('bank-import-preview')
        await expect(preview.getByText('Oct 1, 2026', { exact: true })).toBeVisible()
        await expect(preview.getByText(`${stamp} client`, { exact: true })).toBeVisible()
        await expect(preview.getByText('$3,100.00', { exact: true })).toBeVisible()

        await chooseOption(page, 'bank-import-q-format', 'DD/MM/YYYY')
        await expect(preview.getByText('Jan 10, 2026', { exact: true })).toBeVisible()
        await expect(preview.getByText('Oct 1, 2026', { exact: true })).toHaveCount(0)
        await chooseOption(page, 'bank-import-q-format', 'MM/DD/YYYY')
        await expect(preview.getByText('Oct 1, 2026', { exact: true })).toBeVisible()

        await chooseOption(page, 'bank-import-q-amounts', 'one')
        await expect(page.getByTestId('bank-import-preview-prompt')).toHaveText(PREVIEW_PROMPT)
        await expect(page.getByTestId('bank-import-f-amount')).toHaveText('Choose a column')
        await page.getByTestId('bank-import-continue').click()
        await expect(page.getByTestId('bank-import-form-errors')).toContainText(AMOUNT_ERROR)
        // Once under the Amount select and once in the summary.
        await expect(page.getByText(AMOUNT_ERROR, { exact: true })).toHaveCount(2)
        await expect(page.getByTestId('bank-import-choose')).toHaveCount(0)

        // Once Continue was pressed, the errors describe the current answers: fixing the
        // field clears its error under the select and in the summary.
        await chooseOption(page, 'bank-import-f-amount', '4')
        await expect(page.getByTestId('bank-import-f-amount')).toHaveText('Column 4: Credit')
        await expect(
            page.getByTestId('bank-import-form-errors').getByText(AMOUNT_ERROR, { exact: true })
        ).toHaveCount(0)
        await expect(page.getByText(AMOUNT_ERROR, { exact: true })).toHaveCount(0)
        await expect(page.getByTestId('bank-import-preview-prompt')).toHaveCount(0)
        await expect(preview.getByText('Oct 1, 2026', { exact: true })).toBeVisible()
        await expect(preview.getByText('$3,100.00', { exact: true })).toBeVisible()

        await chooseOption(page, 'bank-import-q-amounts', 'two')
        await page.getByTestId('bank-import-continue').click()
        await expect(page.getByTestId('bank-import-choose')).toBeVisible()

        const staples = page
            .getByTestId('bank-import-list')
            .locator('[data-testid^="bank-import-line-"]')
            .filter({
                has: page.getByText(
                    'Line 4: "13/45/2026" is not a date in the MM/DD/YYYY format.',
                    {
                        exact: true,
                    }
                ),
            })
        await expect(staples).toHaveCount(1)
        await expect(importBox(staples)).toHaveAttribute('aria-disabled', 'true')
        await expect(importBox(staples)).toHaveAttribute('aria-checked', 'false')
        await expect(page.getByTestId('bank-import-band')).toContainText(
            '1 row has an error and cannot be imported. Change the mapping to read it, or import the other rows.'
        )
        await expect(page.getByTestId('bank-import-change-mapping')).toBeVisible()

        const client = importLine(page, `${stamp} client`)
        const supplies = importLine(page, `${stamp} supplies`)
        const retainer = importLine(page, `${stamp} retainer`)
        const software = importLine(page, `${stamp} software`)
        await importBox(software).click()
        await expect(importBox(software)).toHaveAttribute('aria-checked', 'false')

        await page.getByTestId('bank-import-step-back').click()
        await expect(page.getByTestId('bank-import-map')).toBeVisible()
        await expect(page.getByTestId('bank-import-q-format')).toHaveText('MM/DD/YYYY (10/01/2026)')
        await page.getByTestId('bank-import-continue').click()
        await expect(page.getByTestId('bank-import-choose')).toBeVisible()
        await expect(importBox(software)).toHaveAttribute('aria-checked', 'false')
        await expect(importBox(client)).toHaveAttribute('aria-checked', 'true')
        const selection = page.getByTestId('bank-import-selection')
        await expect(selection).toHaveText('3 selected · Money in $4,600.00 · Money out $64.20')

        const submit = page.getByTestId('bank-import-submit')
        const resultText = page.getByTestId('bank-import-result-text')
        await submit.click()
        await expect(resultText).toHaveText(`Imported 3 transactions into ${name}.`)
        await backToBanking(page)

        const row = fileRowByName(page, file.name)
        await expect(row.getByText('Imported: 3 transactions', { exact: true })).toBeVisible()
        const fileId = await fileIdOf(row)
        await page.getByTestId(`bank-file-import-${fileId}`).click()
        await expect(page.getByTestId('bank-import-map')).toBeVisible()
        await page.getByTestId('bank-import-continue').click()
        await expect(page.getByTestId('bank-import-choose')).toBeVisible()
        for (const imported of [client, supplies, retainer]) {
            await expect(imported.getByText('Already imported', { exact: true })).toBeVisible()
            await expect(importBox(imported)).toHaveAttribute('aria-disabled', 'true')
            await expect(importBox(imported)).toHaveAttribute('aria-checked', 'false')
        }
        await expect(importBox(software)).toHaveAttribute('aria-checked', 'true')
        await expect(selection).toHaveText('1 selected · Money in $0.00 · Money out $59.99')
        await submit.click()
        await expect(resultText).toHaveText(`Imported 1 transaction into ${name}.`)
    })

    test('remembers the columns, skips rows already in Books, and shows an empty file', async ({
        page,
    }) => {
        await openBooksBanking(page)
        const name = await connectTestAccount(page)
        const stamp = stampOf('csv-memory')

        // A header-only file: no body cell, so the date format is not guessed.
        const empty = csvStatement(`${stamp}-e`, [`Date,Description,Amount,Note ${stamp}`])
        await chooseBankFile(page, empty)
        await uploadAndOpen(page, empty)
        await chooseOption(page, 'bank-import-q-format', 'YYYY-MM-DD')
        await page.getByTestId('bank-import-continue').click()
        await expect(page.getByTestId('bank-import-empty')).toContainText(
            'This file has no transactions.'
        )
        await page.getByTestId('bank-import-change-mapping').click()
        await expect(page.getByTestId('bank-import-map')).toBeVisible()
        await page.getByTestId('bank-import-cancel').click()
        await expect(page).toHaveURL(/\/banking\?(.*&)?account=/)
        await expect(page).not.toHaveURL(/\/import\//)

        const header = 'Date,Description,Amount'
        const a2 = `2026-10-02,${stamp} a2,20.00`
        const a3 = `2026-10-03,${stamp} a3,30.00`
        const fileA = csvStatement(`${stamp}-a`, [header, `2026-10-01,${stamp} a1,10.00`, a2, a3])
        await chooseBankFile(page, fileA)
        await uploadAndOpen(page, fileA)
        await chooseOption(page, 'bank-import-f-sign', 'out_positive')
        await expect(
            page.getByTestId('bank-import-preview').getByText('-$10.00', { exact: true })
        ).toBeVisible()
        await page.getByTestId('bank-import-continue').click()
        await page.getByTestId('bank-import-submit').click()
        const resultText = page.getByTestId('bank-import-result-text')
        await expect(resultText).toHaveText(`Imported 3 transactions into ${name}.`)
        await backToBanking(page)

        const fileB = csvStatement(`${stamp}-b`, [
            header,
            a2,
            a3,
            `2026-10-04,${stamp} b1,40.00`,
            `2026-10-05,${stamp} b2,50.00`,
        ])
        await chooseBankFile(page, fileB)
        await uploadAndOpen(page, fileB)
        await expect(page.getByTestId('bank-import-intro')).toHaveText(
            `Books used the columns of your last import to ${name}. Check each one before you continue.`
        )
        await expect(page.getByTestId('bank-import-f-sign')).toHaveText('Money out')
        await page.getByTestId('bank-import-continue').click()
        await expect(page.getByTestId('bank-import-selection')).toHaveText(
            '4 selected · Money in $0.00 · Money out $140.00'
        )
        await page.getByTestId('bank-import-submit').click()
        await expect(resultText).toHaveText(`Imported 2 transactions into ${name}.`)
        await expect(page.getByTestId('bank-import-result-detail')).toHaveText(
            '2 chosen transactions were already in Books, so they were skipped.'
        )
        await expect(page.getByTestId('bank-import-more')).toHaveCount(0)
        await backToBanking(page)

        const rowA = fileRowByName(page, fileA.name)
        const rowB = fileRowByName(page, fileB.name)
        await expect(rowA.getByText('Imported: 3 transactions', { exact: true })).toBeVisible()
        await expect(rowB.getByText('Imported: 2 transactions', { exact: true })).toBeVisible()
        const fileAId = await fileIdOf(rowA)
        await page.getByTestId(`bank-file-import-${fileAId}`).click()
        await expect(page.getByTestId('bank-import-map')).toBeVisible()
        await page.getByTestId('bank-import-continue').click()
        await expect(page.getByTestId('bank-import-all-imported')).toContainText(
            'Every transaction in this file is already imported.'
        )
    })

    test('maps and imports on a phone', async ({ page }) => {
        await openBooksBanking(page)
        const name = await connectTestAccount(page)
        await page.setViewportSize(BANKING_PHONE)
        const stamp = stampOf('csv-phone')
        const file = csvStatement(stamp, twoColumnLines(stamp))
        await chooseBankFile(page, file)
        await uploadAndOpen(page, file)

        const sample = page.getByTestId('bank-import-sample')
        const question = page.getByTestId('bank-import-q-header')
        await expect
            .poll(async () => {
                const top = await sample.boundingBox()
                const below = await question.boundingBox()
                return top !== null && below !== null && top.y + top.height <= below.y
            })
            .toBe(true)
        await expect
            .poll(() =>
                sample.evaluate(node => node.clientWidth > 0 && node.scrollWidth > node.clientWidth)
            )
            .toBe(true)
        await sample.evaluate(node => {
            node.scrollLeft = 200
        })
        await expect.poll(() => sample.evaluate(node => node.scrollLeft)).toBeGreaterThan(0)

        const preview = page.getByTestId('bank-import-preview')
        await chooseOption(page, 'bank-import-q-format', 'DD/MM/YYYY')
        await expect(preview.getByText('Jan 10, 2026', { exact: true })).toBeVisible()
        await chooseOption(page, 'bank-import-q-format', 'MM/DD/YYYY')
        await expect(preview.getByText('Oct 1, 2026', { exact: true })).toBeVisible()

        await page.getByTestId('bank-import-continue').click()
        await expect(page.getByTestId('bank-import-choose')).toBeVisible()
        await expect(
            importLine(page, `${stamp} client`).getByText('Oct 1, 2026 · Line 2', { exact: true })
        ).toBeVisible()
        await expect(page.getByText('Select all', { exact: true })).toBeVisible()
        await page.getByTestId('bank-import-submit').click()
        await expect(page.getByTestId('bank-import-result-text')).toHaveText(
            `Imported 4 transactions into ${name}.`
        )
    })
})

function shortcutList(page: Page) {
    return page.getByRole('dialog').filter({ hasText: 'Keyboard shortcuts' })
}

test.describe('bank-import-mapping: keys and statement', () => {
    // The test imports into its own connection, so it cannot disconnect it; the older
    // file stays waiting to import.
    test('drives the import from the keyboard', async ({ page }) => {
        await openBooksBanking(page)
        const name = await connectTestAccount(page)
        const stamp = stampOf('csv-keys')
        const header = 'Date,Description,Amount'

        const older = csvStatement(`${stamp}-old`, [header, `2026-10-09,${stamp} old,9.00`])
        await chooseBankFile(page, older)
        await expect(page.getByTestId('bank-upload-done')).toContainText(`${older.name} uploaded.`)
        const newer = csvStatement(stamp, [
            header,
            `2026-10-01,${stamp} k1,10.00`,
            `2026-10-02,${stamp} k2,-20.00`,
            `2026-10-03,${stamp} k3,30.00`,
        ])
        await chooseBankFile(page, newer)
        await expect(page.getByTestId('bank-upload-done')).toContainText(`${newer.name} uploaded.`)
        await expect(fileRowByName(page, older.name)).toHaveCount(1)
        await expect(fileRowByName(page, newer.name)).toHaveCount(1)

        // i opens the newest file waiting to import; Map columns opens with its first
        // question focused.
        await page.keyboard.press('i')
        await expect(page).toHaveURL(/\/banking\/import\//)
        const fileLine = page.getByTestId('bank-import-file')
        await expect(fileLine).toContainText(`File: ${newer.name}`)
        const map = page.getByTestId('bank-import-map')
        await expect(map).toBeVisible()
        await expect(page.getByTestId('bank-import-q-header')).toBeFocused()

        await page.keyboard.press('Shift+?')
        const list = shortcutList(page)
        await expect(list).toBeVisible()
        const group = list.getByText('Bank import', { exact: true }).locator('..')
        await expect(group.getByText('Continue', { exact: true })).toBeVisible()
        await expect(group.getByText('Cancel', { exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(list).toHaveCount(0)
        await expect(map).toBeVisible()

        // An open select menu takes Escape first: it closes, the page stays.
        await page.getByTestId('bank-import-q-format').click()
        const formatItem = page.getByTestId('bank-import-q-format-YYYY-MM-DD')
        await expect(formatItem).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(formatItem).toHaveCount(0)
        await expect(map).toBeVisible()
        await expect(page).toHaveURL(/\/banking\/import\//)

        await page.keyboard.press('ControlOrMeta+Enter')
        const choose = page.getByTestId('bank-import-choose')
        await expect(choose).toBeVisible()
        await expect(page.getByTestId('bank-import-select-all')).toBeFocused()

        const selection = page.getByTestId('bank-import-selection')
        await expect(selection).toHaveText('3 selected · Money in $40.00 · Money out $20.00')
        await page.keyboard.press('a')
        await expect(selection).toHaveText('0 selected · Money in $0.00 · Money out $0.00')
        await page.keyboard.press('a')
        await expect(selection).toHaveText('3 selected · Money in $40.00 · Money out $20.00')

        // Esc on a CSV file's Choose transactions goes back one step.
        await page.keyboard.press('Escape')
        await expect(map).toBeVisible()
        await expect(choose).toHaveCount(0)
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(choose).toBeVisible()
        await expect(selection).toHaveText('3 selected · Money in $40.00 · Money out $20.00')
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page.getByTestId('bank-import-result-text')).toHaveText(
            `Imported 3 transactions into ${name}.`
        )

        await page.keyboard.press('Escape')
        await expect(page).toHaveURL(/\/banking\?(.*&)?account=/)
        await expect(page).not.toHaveURL(/\/import\//)
        await expect(
            fileRowByName(page, newer.name).getByText('Imported: 3 transactions', { exact: true })
        ).toBeVisible()

        // Now the older file is the only one waiting; Esc on Map columns is Cancel.
        await page.keyboard.press('i')
        await expect(page).toHaveURL(/\/banking\/import\//)
        await expect(fileLine).toContainText(`File: ${older.name}`)
        await expect(map).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page).toHaveURL(/\/banking\?(.*&)?account=/)
        await expect(page).not.toHaveURL(/\/import\//)
    })

    test('shows the card’s bank statement', async ({ page }) => {
        await openBooksBanking(page)
        await openBanking(page)

        const card = bankCard(page, CARD)
        const cardId = await connectionIdOf(card)
        const statement = card.getByTestId(`bank-statement-${cardId}`)
        await expect(statement.getByText('Bank statement', { exact: true })).toBeVisible()
        await expect(statement.getByText('$3,410.17', { exact: true })).toBeVisible()
        await expect(statement.getByText('as of Oct 28, 2026', { exact: true })).toBeVisible()

        const checking = bankCard(page, CHECKING)
        await expect(checking).toBeVisible()
        await expect(checking.locator('[data-testid^="bank-statement-"]')).toHaveCount(0)
    })
})
